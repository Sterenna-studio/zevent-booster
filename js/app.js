/** Point d'entrée : navigation entre les vues, tableau de bord, câblage global. */
import { CONFIG, RARITIES } from './config.js';
import { loadCards, getCards } from './cards.js';
import { state, subscribe, commit, reset, addWatchTime, msToNextBooster } from './state.js';
import { initPlayer, onTick, onBoosterEarned, watchStatus } from './twitch.js';
import { initCollection, renderGrid } from './collection.js';
import { initOpening, refreshOpening } from './opening.js';
import { sfx, toggleSound } from './audio.js';

const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 86;

const STATUS_LABEL = {
  live: 'En direct',
  paused: 'En pause',
  hidden: 'Arrière-plan',
  afk: 'AFK',
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── tableau de bord ───────────────────────────────────────────────────── */

function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

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

  // jauge + compte à rebours
  const remaining = msToNextBooster();
  const progress = 1 - remaining / CONFIG.boosterMs;
  const gauge = document.querySelector('[data-gauge]');
  if (gauge) {
    gauge.style.strokeDasharray = String(GAUGE_CIRCUMFERENCE);
    gauge.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - progress));
  }
  setText('[data-countdown]', formatClock(remaining));
  setText('[data-total-watched]', formatDuration(state.watchedMs));
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
  const status = watchStatus();
  const dot = document.querySelector('[data-status-dot]');
  if (dot) dot.dataset.state = status;
  setText('[data-status-label]', STATUS_LABEL[status] ?? status);
}

/* ── démarrage ─────────────────────────────────────────────────────────── */

async function main() {
  try {
    await loadCards();
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

  initCollection();
  initOpening();

  for (const el of document.querySelectorAll('[data-view], [data-goto]')) {
    el.addEventListener('click', () => showView(el.dataset.view ?? el.dataset.goto));
  }

  document.querySelector('[data-sound]')?.addEventListener('click', () => {
    toggleSound();
    renderDashboard();
  });

  document.querySelector('[data-reset]')?.addEventListener('click', () => {
    if (!confirm('Effacer toute ta progression (temps, boosters et cartes) ?')) return;
    reset();
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
  onBoosterEarned(() => {
    sfx.booster();
    refreshOpening();
  });

  initPlayer();
  renderStatus();

  // Console de test en local : le ZEvent n'est en direct que quatre jours par an,
  // il faut bien pouvoir vérifier l'ouverture le reste du temps.
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
      /** Avance le compteur de visionnage de n minutes. */
      addMinutes(n = 10) {
        const gained = addWatchTime(n * 60000);
        commit('debug');
        refreshOpening();
        return { gained, boosters: state.boosters };
      },
      reset,
    };
    console.info('[zevent-booster] console de test : zb.addBoosters(3), zb.addMinutes(10), zb.reset()');
  }

  // Sauvegarde de sécurité si l'onglet se ferme en plein visionnage.
  window.addEventListener('pagehide', () => commit('unload'));
}

main();
