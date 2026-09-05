/**
 * Player Twitch embarqué.
 *
 * Depuis le passage à un cooldown en temps réel, le player ne conditionne plus
 * les boosters : il n'a plus qu'à afficher le stream et à dire s'il tourne,
 * pour l'indicateur de la vue Stream.
 */
import { currentChannel } from './streamers.js';

const watcher = {
  playing: false,
  player: null,
  error: null,
};

/** 'live' | 'paused' | 'error' */
export function playerStatus() {
  if (watcher.error) return 'error';
  // On recroise avec l'état du player : un événement PAUSE manqué (fin de
  // stream, coupure réseau, pré-roll publicitaire) laisserait sinon
  // l'indicateur bloqué sur « en direct ».
  if (watcher.playing && watcher.player?.isPaused?.()) watcher.playing = false;
  return watcher.playing ? 'live' : 'paused';
}

/** Accès au player embarqué, pour la console de test locale. */
export function getPlayer() {
  return watcher.player;
}

/**
 * Bascule le player sur une autre chaîne du plateau. Le cooldown n'en sait
 * rien et continue de tourner : changer de streamer ne coûte rien.
 */
export function setChannel(login) {
  if (!watcher.player) return;
  watcher.playing = false;
  watcher.player.setChannel(login);
}

function failPlayer(reason) {
  watcher.error = reason;
  const box = document.querySelector('[data-player-fallback]');
  const msg = document.querySelector('[data-fallback-reason]');
  if (msg) msg.textContent = reason;
  if (box) box.hidden = false;
}

export function initPlayer() {
  if (location.protocol === 'file:') {
    failPlayer(
      "Twitch refuse de s'embarquer depuis un fichier local. Sers le dossier en HTTP (npx serve -l 8080) puis recharge."
    );
    return;
  }

  if (typeof window.Twitch === 'undefined' || !window.Twitch.Player) {
    failPlayer(
      "Le script du player Twitch n'a pas pu être chargé (bloqueur de pub, hors ligne ?). Les boosters continuent d'arriver."
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
      watcher.playing = !player.isPaused();
    });
    player.addEventListener(P.PLAY, () => {
      watcher.playing = true;
    });
    for (const event of [P.PAUSE, P.ENDED, P.OFFLINE]) {
      player.addEventListener(event, () => {
        watcher.playing = false;
      });
    }
  } catch (err) {
    failPlayer(`Impossible d'initialiser le player : ${err.message}`);
  }
}

