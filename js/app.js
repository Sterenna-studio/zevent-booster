/** Point d'entrée : navigation entre les vues, tableau de bord, câblage global. */
import { CONFIG, RARITIES } from './config.js';
import { loadCards, getCards } from './cards.js';
import { state, subscribe, commit, reset, claimWelcome, msToNextBooster } from './state.js';
import { initPlayer, playerStatus, setChannel, getPlayer } from './twitch.js';
import { startCooldown, onTick, onBoosterEarned } from './cooldown.js';
import { initCollection, renderGrid, syncStatsSort } from './collection.js';
import { initOpening, refreshOpening } from './opening.js';
import { sfx, toggleSound } from './audio.js';
import { loadStreamers, initStreamerPicker } from './streamers.js';
import { initLightbox } from './lightbox.js';
import { initCompletion, startCompletion, isComplete, claimRank } from './completion.js';
import { loadStats, backfillOnce, totalPacks, watchStats } from './stats.js';
import { initStatsView, enterStats, renderStats } from './statsview.js';
import { watchVersion } from './version.js';

const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 86;

const STATUS_LABEL = {
  live: 'En direct',
  paused: 'En pause',
  error: 'Indisponible',
};

/* ── navigation ────────────────────────────────────────────────────────── */

function showView(name) {
  for (const panel of document.querySelectorAll('[data-view-panel]')) {
    const active = panel.dataset.viewPanel === name;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  }
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('is-active', tab.dataset.view === name);
  }
  if (name === 'collection') renderGrid();
  if (name === 'opening') refreshOpening();
  if (name === 'stats') enterStats();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── tableau de bord ───────────────────────────────────────────────────── */

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function setText(selector, value) {
  for (const el of document.querySelectorAll(selector)) el.textContent = value;
}

function renderDashboard() {
  const { cards } = getCards();
  const ownedIds = Object.keys(state.owned);
  const full = state.boosters >= CONFIG.maxStock;

  // jauge + compte à rebours
  const remaining = msToNextBooster();
  const progress = full ? 1 : 1 - remaining / CONFIG.boosterMs;
  const gauge = document.querySelector('[data-gauge]');
  if (gauge) {
    gauge.style.strokeDasharray = String(GAUGE_CIRCUMFERENCE);
    gauge.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - progress));
  }
  setText('[data-countdown]', full ? 'PLEIN' : formatClock(remaining));
  setText(
    '[data-gauge-caption]',
    full ? 'ouvre un booster pour relancer le compte' : 'avant le prochain booster'
  );

  setText('[data-stock]', `${state.boosters}`);
  // Une sauvegarde antérieure peut dépasser le plafond : afficher « 29/12 »
  // donnerait l'impression d'un bug, on retire alors le dénominateur.
  setText('[data-stock-max]', state.boosters > CONFIG.maxStock ? '' : `/${CONFIG.maxStock}`);
  setText('[data-total-earned]', String(state.earned));
  setText('[data-owned-count]', String(ownedIds.length));

  // pastille boosters
  const pill = document.querySelector('[data-pill]');
  pill?.classList.toggle('has-packs', state.boosters > 0);
  setText('[data-pill-count]', String(state.boosters));
  setText('[data-pill-plural]', state.boosters > 1 ? 's' : '');

  // bouton d'appel de la vue stream
  const cta = document.querySelector('[data-open-cta]');
  if (cta) {
    cta.disabled = state.boosters === 0;
    cta.textContent =
      state.boosters > 0
        ? `Ouvrir ${state.boosters} booster${state.boosters > 1 ? 's' : ''}`
        : 'Aucun booster disponible';
  }

  // complétion
  const pct = Math.round((ownedIds.length / cards.length) * 100);
  const bar = document.querySelector('[data-completion-bar]');
  if (bar) bar.style.width = `${pct}%`;
  setText('[data-completion-pct]', `${pct}%`);

  for (const rarity of RARITIES) {
    const pool = getCards().byRarity[rarity];
    const have = pool.filter((c) => state.owned[c.id]).length;
    setText(`[data-legend-count="${rarity}"]`, `${have}/${pool.length}`);
  }

  // son
  const soundBtn = document.querySelector('[data-sound]');
  soundBtn?.setAttribute('aria-pressed', String(state.sound));
}

function renderStatus() {
  const status = playerStatus();
  const dot = document.querySelector('[data-status-dot]');
  if (dot) dot.dataset.state = status;
  setText('[data-status-label]', STATUS_LABEL[status] ?? status);
}

/* ── toast ─────────────────────────────────────────────────────────────── */

let toastTimer = null;
/** Ce que fait le bouton du bandeau, remplacé à chaque message. */
let toastAction = () => {};

/**
 * `persist` garde le bandeau à l'écran : une nouvelle version disponible ne
 * doit pas disparaître au bout de neuf secondes comme une notification de
 * booster.
 */
function showToast(text, actionLabel, onAction, { persist = false } = {}) {
  const toast = document.querySelector('[data-toast]');
  const textEl = document.querySelector('[data-toast-text]');
  const action = document.querySelector('[data-toast-action]');
  if (!toast || !textEl) return;

  textEl.textContent = text;
  if (action) action.textContent = actionLabel;
  toastAction = onAction ?? (() => {});
  toast.hidden = false;
  toast.classList.remove('is-leaving');

  clearTimeout(toastTimer);
  if (persist) return;

  toastTimer = setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => {
      toast.hidden = true;
    }, 350);
  }, 9000);
}

/** Crédite les boosters d'accueil et le fait savoir. */
function welcome() {
  const given = claimWelcome(CONFIG.welcomeBoosters);
  if (!given) return;
  commit('welcome');
  refreshOpening();
  showToast(`Bienvenue — ${given} boosters offerts pour commencer.`, 'Ouvrir', () =>
    showView('opening')
  );
}

/* ── démarrage ─────────────────────────────────────────────────────────── */

async function main() {
  try {
    await Promise.all([loadCards(), loadStreamers()]);
  } catch (err) {
    document.querySelector('main').innerHTML = `
      <section class="view is-active">
        <h2 class="section-title">Chargement impossible</h2>
        <p style="color:var(--txt-dim);margin-top:1rem">
          ${err.message}. Le site doit être servi en HTTP :
          <code>npx serve -l 8080</code> à la racine du dossier.
        </p>
      </section>`;
    return;
  }

  initLightbox();
  initCompletion(showView);
  initCollection();
  initStatsView();
  initOpening();
  initStreamerPicker(setChannel);

  for (const el of document.querySelectorAll('[data-view], [data-goto]')) {
    el.addEventListener('click', () => showView(el.dataset.view ?? el.dataset.goto));
  }

  // Échap ferme la modale du dessus. Les <dialog> le font nativement, mais on
  // ne s'en remet pas à ça seul : selon le contexte d'affichage, la touche
  // arrive à la page sans déclencher la fermeture native.
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = [...document.querySelectorAll('dialog[open]')];
    open.at(-1)?.close();
  });

  document.querySelector('[data-sound]')?.addEventListener('click', () => {
    toggleSound();
    renderDashboard();
  });

  document.querySelector('[data-reset]')?.addEventListener('click', () => {
    if (!confirm('Effacer toute ta progression (boosters et cartes) ?')) return;
    reset();
    welcome();
    renderGrid();
    refreshOpening();
  });

  // La grille ne se reconstruit que quand la collection a bougé ET qu'elle est
  // à l'écran : les sauvegardes périodiques ne doivent pas recréer 255 nœuds.
  const GRID_REASONS = new Set(['init', 'grant', 'reset']);
  subscribe((_, reason) => {
    renderDashboard();
    if (!GRID_REASONS.has(reason)) return;
    if (!document.querySelector('[data-view-panel="collection"]')?.hidden) renderGrid();
  });

  onTick(() => {
    renderStatus();
    renderDashboard();
  });
  onBoosterEarned((n) => {
    sfx.booster();
    refreshOpening();
    showToast(
      n > 1 ? `${n} boosters sont arrivés pendant ton absence.` : 'Un booster vient de tomber.',
      'Ouvrir',
      () => showView('opening')
    );
  });

  // Les statistiques ne bloquent rien : on les charge à côté, et la fiche
  // s'en passe si elles n'arrivent pas.
  document.querySelector('[data-toast-action]')?.addEventListener('click', () => toastAction());

  // Une page laissée ouverte des heures doit pouvoir apprendre qu'une nouvelle
  // version est en ligne. On propose, on n'impose pas : recharger d'autorité
  // en pleine ouverture de booster serait pire que le mal.
  watchVersion((deployed) => {
    showToast(
      `Une nouvelle version du site est en ligne (${deployed}).`,
      'Recharger',
      () => location.reload(),
      { persist: true }
    );
  });

  // Compteur communautaire. Entièrement facultatif : s'il ne répond pas, la
  // bande reste masquée et rien d'autre ne bouge.
  const renderTally = (packs) => {
    const tally = document.querySelector('[data-tally]');
    if (!tally || typeof packs !== 'number') return;
    setText('[data-tally-count]', new Intl.NumberFormat('fr-FR').format(packs));
    tally.hidden = false;
    tally.classList.remove('is-bumping');
    void tally.offsetWidth;
    tally.classList.add('is-bumping');
  };

  loadStats().then(() => {
    renderTally(totalPacks());
    syncStatsSort();
    renderStats();
    backfillOnce();
    watchStats(renderTally);

    // Les albums terminés avant l'ouverture du classement prennent leur rang en
    // silence, sans cérémonie : ils l'ont déjà eue. Sans eux, le palmarès
    // sacrerait « première » une personne qui ne l'est pas.
    if (state.completed && state.completionRank === null && isComplete()) claimRank();
  });

  initPlayer();
  renderStatus();
  welcome();
  startCooldown();

  // Console de test en local, pour ne pas avoir à attendre le cooldown.
  if (['localhost', '127.0.0.1', ''].includes(location.hostname)) {
    window.zb = {
      state,
      /** Crédite des boosters sans attendre. */
      addBoosters(n = 1) {
        state.boosters += n;
        state.earned += n;
        commit('debug');
        refreshOpening();
        return state.boosters;
      },
      /** Recule le cooldown de n minutes, comme si le temps avait passé. */
      advance(minutes = 15) {
        state.cooldownAt -= minutes * 60000;
        commit('debug');
        return msToNextBooster();
      },
      reset,
      /** Rejoue la cérémonie de complétion sur la dernière carte obtenue. */
      celebrate() {
        state.completed = false;
        return startCompletion(state.order.at(-1));
      },
      /** Le player Twitch, pour lancer la lecture sans viser le bouton. */
      get player() {
        return getPlayer();
      },
    };
    console.info('[zevent-booster] console de test : zb.addBoosters(3), zb.advance(30), zb.reset()');
  }
}

main();
