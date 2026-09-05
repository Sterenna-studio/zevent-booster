/**
 * Player Twitch embarqué + compteur de temps de visionnage.
 *
 * Le temps n'est compté que si les trois conditions sont réunies :
 *   1. le player rapporte qu'il joue (événements PLAY / PAUSE / ENDED) ;
 *   2. l'onglet est au premier plan (Page Visibility) ;
 *   3. l'utilisateur n'est pas marqué AFK.
 *
 * Le delta est mesuré sur l'horloge réelle et plafonné, pour qu'un onglet mis
 * en veille par le navigateur ne puisse pas créditer un gros bloc d'un coup.
 */
import { CONFIG } from './config.js';
import { addWatchTime, commit } from './state.js';
import { currentChannel } from './streamers.js';

const TICK_MS = 1000;
const MAX_DELTA_MS = 2000;

const watcher = {
  playing: false,
  visible: document.visibilityState === 'visible',
  afk: false,
  /** Temps compté écoulé depuis la dernière preuve de présence. */
  sinceInteraction: 0,
  player: null,
  ready: false,
  error: null,
};

const tickHandlers = new Set();
const boosterHandlers = new Set();

export const onTick = (fn) => tickHandlers.add(fn);
export const onBoosterEarned = (fn) => boosterHandlers.add(fn);

/** 'live' | 'paused' | 'hidden' | 'afk' | 'error' */
export function watchStatus() {
  if (watcher.error) return 'error';
  if (watcher.afk) return 'afk';
  if (!watcher.visible) return 'hidden';
  return watcher.playing ? 'live' : 'paused';
}

/* ── AFK ───────────────────────────────────────────────────────────────── */

const afkDialog = document.querySelector('[data-afk]');
const afkTimerEl = afkDialog?.querySelector('[data-afk-timer]');
let graceTimer = null;

function openAfkPrompt() {
  if (!afkDialog || afkDialog.open) return;
  watcher.afk = true;
  let left = Math.round(CONFIG.afk.graceMs / 1000);

  const render = () => {
    if (afkTimerEl) afkTimerEl.textContent = `Fermeture automatique dans ${left} s`;
  };
  render();

  afkDialog.showModal();
  graceTimer = setInterval(() => {
    left -= 1;
    render();
    if (left <= 0) {
      clearInterval(graceTimer);
      // On rend la main : le compteur reste en pause jusqu'à une vraie interaction.
      if (afkDialog.open) afkDialog.close();
    }
  }, 1000);
}

function clearAfk() {
  if (!watcher.afk) return;
  watcher.afk = false;
  watcher.sinceInteraction = 0;
  clearInterval(graceTimer);
  if (afkDialog?.open) afkDialog.close();
}

afkDialog?.querySelector('[data-afk-confirm]')?.addEventListener('click', clearAfk);

// N'importe quelle interaction réelle vaut preuve de présence.
for (const evt of ['pointerdown', 'keydown']) {
  window.addEventListener(evt, () => {
    watcher.sinceInteraction = 0;
    if (watcher.afk && !afkDialog?.open) clearAfk();
  });
}

/* ── boucle de comptage ────────────────────────────────────────────────── */

let last = Date.now();

function loop() {
  const now = Date.now();
  const delta = Math.min(now - last, MAX_DELTA_MS);
  last = now;

  // On relit la visibilité à chaque tick plutôt que de se fier au seul
  // événement visibilitychange : certains contextes (webviews, onglets
  // restaurés) changent l'état sans jamais l'émettre, et le compteur restait
  // alors bloqué en « arrière-plan » devant un stream pourtant à l'écran.
  const visible = document.visibilityState === 'visible';
  if (visible !== watcher.visible) {
    watcher.visible = visible;
    // Le temps passé onglet caché ne doit pas être crédité au retour.
    last = now;
  }

  // Filet de sécurité : un événement PAUSE manqué (fin de stream, coupure
  // réseau, pré-roll publicitaire) laisserait le compteur tourner à vide. On
  // redemande son état au player, qui lui est fiable. Ce contrôle ne peut que
  // mettre en pause, jamais relancer : c'est l'événement PLAY qui fait ça.
  if (watcher.playing && watcher.player?.isPaused?.()) watcher.playing = false;

  if (watchStatus() === 'live') {
    const gained = addWatchTime(delta);
    watcher.sinceInteraction += delta;

    if (gained > 0) {
      for (const fn of boosterHandlers) fn(gained);
      commit('booster');
    } else if (Math.floor(now / 1000) % 15 === 0) {
      // Sauvegarde périodique : on ne réécrit pas localStorage à chaque seconde.
      commit('tick-save');
    }

    if (watcher.sinceInteraction >= CONFIG.afk.afterMs) openAfkPrompt();
  }

  for (const fn of tickHandlers) fn(watchStatus());
}

// La boucle fait déjà foi pour la visibilité ; l'événement ne sert plus qu'à
// sauvegarder tout de suite quand l'onglet part en arrière-plan.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') commit('tick-save');
});

/* ── mise en place du player ───────────────────────────────────────────── */

function failPlayer(reason) {
  watcher.error = reason;
  const box = document.querySelector('[data-player-fallback]');
  const msg = document.querySelector('[data-fallback-reason]');
  if (msg) msg.textContent = reason;
  if (box) box.hidden = false;
}

export function initPlayer() {
  setInterval(loop, TICK_MS);

  if (location.protocol === 'file:') {
    failPlayer(
      "Twitch refuse de s'embarquer depuis un fichier local. Sers le dossier en HTTP (npx serve -l 8080) puis recharge."
    );
    return;
  }

  if (typeof window.Twitch === 'undefined' || !window.Twitch.Player) {
    failPlayer(
      "Le script du player Twitch n'a pas pu être chargé (bloqueur de pub, hors ligne ?). Le compteur reste à l'arrêt."
    );
    return;
  }

  try {
    const player = new window.Twitch.Player('twitch-player', {
      channel: currentChannel(),
      parent: [location.hostname],
      width: '100%',
      height: '100%',
      autoplay: false,
      muted: false,
    });
    watcher.player = player;

    const P = window.Twitch.Player;
    player.addEventListener(P.READY, () => {
      watcher.ready = true;
      watcher.playing = !player.isPaused();
    });
    player.addEventListener(P.PLAY, () => {
      watcher.playing = true;
      last = Date.now();
    });
    player.addEventListener(P.PAUSE, () => {
      watcher.playing = false;
    });
    player.addEventListener(P.ENDED, () => {
      watcher.playing = false;
    });
    player.addEventListener(P.OFFLINE, () => {
      watcher.playing = false;
    });
  } catch (err) {
    failPlayer(`Impossible d'initialiser le player : ${err.message}`);
  }
}

/** Accès au player embarqué, pour la console de test locale. */
export function getPlayer() {
  return watcher.player;
}

/**
 * Bascule le player sur une autre chaîne du plateau. Le temps déjà compté est
 * conservé : c'est du visionnage ZEvent, peu importe chez qui.
 */
export function setChannel(login) {
  if (!watcher.player) return;
  // On repart de « en pause » : c'est l'événement PLAY de la nouvelle chaîne
  // qui relancera le compteur, pas la simple bascule.
  watcher.playing = false;
  last = Date.now();
  watcher.player.setChannel(login);
}
