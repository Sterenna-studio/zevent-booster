/**
 * Page « Stats » : ce que le site a distribué depuis la mise en place des
 * compteurs, et où le joueur se situe dedans.
 *
 * Comme partout ailleurs, ces chiffres sont un ornement : si l'API se tait, la
 * page le dit et le reste du site continue. Rien ici n'est dans le chemin du
 * jeu.
 *
 * Les valeurs se rafraîchissent toutes les 5 minutes, et seulement quand la
 * page est réellement sous les yeux de quelqu'un — un onglet en arrière-plan
 * n'a personne à informer.
 */
import { getCards } from './cards.js';
import { RARITY_LABEL } from './config.js';
import { state, openedBoosters } from './state.js';
import { loadStats, snapshot, statsAge } from './stats.js';
import { openCard } from './collection.js';

/** Cadence demandée pour les valeurs de cette page. */
const REFRESH_MS = 5 * 60 * 1000;
/** En deçà, les chiffres en mémoire sont assez frais pour être réaffichés tels quels. */
const STALE_MS = 60 * 1000;
/** Rafraîchissement de la seule ligne « actualisé il y a… ». */
const AGE_TICK_MS = 30 * 1000;

const RARITIES = ['common', 'rare', 'epic'];
/** Nombre de Kards dans chaque palmarès. */
const RANK_SIZE = 8;

const panel = document.querySelector('[data-view-panel="stats"]');
const body = document.querySelector('[data-stats-body]');
const offline = document.querySelector('[data-stats-offline]');
const ageEl = document.querySelector('[data-stats-age]');

const nb = new Intl.NumberFormat('fr-FR');
const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1).replace('.', ',')} %` : '—');

const escapeAttr = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** « il y a 4 min ». Au-delà d'un jour, la précision n'apporte plus rien. */
function ago(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return `il y a ${j} jour${j > 1 ? 's' : ''}`;
}

/* ── blocs ─────────────────────────────────────────────────────────────── */

function keyFigures(data) {
  const { cards } = getCards();
  const distinctes = Object.values(data.cards).filter((n) => n > 0).length;

  const figures = [
    [nb.format(data.packs), 'boosters ouverts'],
    [nb.format(data.total), 'Kards distribuées'],
    [nb.format(data.completions), `album${data.completions > 1 ? 's' : ''} complété${data.completions > 1 ? 's' : ''}`],
    [`${distinctes}/${cards.length}`, 'Kards déjà tombées'],
  ];

  return figures
    .map(
      ([value, label]) => `
      <div class="stat-card">
        <strong>${value}</strong>
        <span>${label}</span>
      </div>`
    )
    .join('');
}

function rarityTable(data) {
  const { byRarity } = getCards();

  const rows = RARITIES.map((rarity) => {
    const pool = byRarity[rarity];
    let pulls = 0;
    for (const card of pool) pulls += data.cards[card.id] ?? 0;
    const moyenne = pool.length ? pulls / pool.length : 0;
    return `
      <tr>
        <th scope="row"><i class="dot dot--${rarity}"></i>${RARITY_LABEL[rarity]}</th>
        <td>${nb.format(pulls)}</td>
        <td>${pct(pulls, data.total)}</td>
        <td>${nb.format(Math.round(moyenne))}</td>
      </tr>`;
  }).join('');

  return `
    <table class="stats-table">
      <thead>
        <tr><th scope="col">Rareté</th><th scope="col">Tirages</th><th scope="col">Part</th><th scope="col">Par Kard</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="stats-note">« Par Kard » est la moyenne : c'est elle qui dit combien une carte de cette
      rareté tombe, quand on la compare à ses sœurs.</p>`;
}

function mine(data) {
  const { cards } = getCards();
  const owned = Object.keys(state.owned).length;
  const doublons = Object.values(state.owned).reduce((n, c) => n + c, 0) - owned;
  const ouverts = openedBoosters();

  const lines = [
    ['Collection', `${owned}/${cards.length} · ${pct(owned, cards.length)}`],
    ['Boosters ouverts', nb.format(ouverts)],
    ['Doublons', nb.format(doublons)],
    ['Part des tirages du site', ouverts && data.packs ? pct(ouverts, data.packs) : '—'],
  ];

  if (state.completionRank) {
    lines.push(['Rang de complétion', `${nb.format(state.completionRank)}${state.completionRank === 1 ? 're' : 'e'}`]);
  }

  return `
    <dl class="stats-defs">
      ${lines.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
    </dl>
    <p class="stats-note">Cette colonne ne sort pas d'internet : elle est lue dans ta sauvegarde locale.</p>`;
}

/** Palmarès des Kards, par le haut ou par le bas. */
function ranking(data, direction) {
  const { cards } = getCards();
  const list = cards
    .map((card) => ({ card, pulls: data.cards[card.id] ?? 0 }))
    .sort((a, b) => (direction === 'top' ? b.pulls - a.pulls : a.pulls - b.pulls))
    .slice(0, RANK_SIZE);

  return list
    .map(
      ({ card, pulls }) => `
      <li>
        <button type="button" data-stats-card="${escapeAttr(card.id)}">
          <i class="dot dot--${card.rarity}"></i>
          <span class="stats-rank__num">#${escapeAttr(card.number)}</span>
          <span class="stats-rank__name">${escapeAttr(card.name)}</span>
          <span class="stats-rank__pulls">${nb.format(pulls)}</span>
        </button>
      </li>`
    )
    .join('');
}

function board(data) {
  const rows = data.board ?? [];
  if (!rows.length) {
    return `<p class="stats-empty">Personne n'a encore réuni les 255 Kards. La place de première est libre.</p>`;
  }

  return `
    <ol class="stats-board">
      ${rows
        .map(
          (row) => `
        <li${row.rank === 1 ? ' class="is-first"' : ''}>
          <span class="stats-board__rank">${nb.format(row.rank)}<sup>${row.rank === 1 ? 're' : 'e'}</sup></span>
          <span class="stats-board__packs">${nb.format(row.packs)} boosters</span>
          <span class="stats-board__at">${ago(Date.now() - row.at)}</span>
        </li>`
        )
        .join('')}
    </ol>
    <p class="stats-note">Aucun nom : le site ne sait pas qui vous êtes, seulement combien vous êtes.</p>`;
}

/* ── rendu ─────────────────────────────────────────────────────────────── */

function renderAge() {
  if (!ageEl) return;
  const age = statsAge();
  ageEl.textContent = age === null ? '' : `Actualisé ${ago(age)}, puis toutes les 5 minutes.`;
}

export function renderStats() {
  const data = snapshot();

  if (!data) {
    if (body) body.hidden = true;
    if (offline) offline.hidden = false;
    renderAge();
    return;
  }

  if (offline) offline.hidden = true;
  if (body) body.hidden = false;

  const set = (selector, html) => {
    const el = document.querySelector(selector);
    if (el) el.innerHTML = html;
  };

  set('[data-stats-keys]', keyFigures(data));
  set('[data-stats-rarity]', rarityTable(data));
  set('[data-stats-me]', mine(data));
  set('[data-stats-top]', ranking(data, 'top'));
  set('[data-stats-flop]', ranking(data, 'flop'));
  set('[data-stats-board]', board(data));
  renderAge();
}

/* ── cycle de vie ──────────────────────────────────────────────────────── */

const visible = () => panel && !panel.hidden && document.visibilityState === 'visible';

/** Recharge puis réaffiche. Silencieux en cas d'échec : `loadStats` garde la
 *  dernière réponse connue, la page continue de montrer des chiffres datés. */
async function refresh() {
  await loadStats();
  if (visible()) renderStats();
}

/** Appelé à chaque arrivée sur la page. */
export function enterStats() {
  renderStats();
  const age = statsAge();
  if (age === null || age > STALE_MS) refresh();
}

export function initStatsView() {
  // Un clic sur une ligne de palmarès ouvre la fiche de la Kard : c'est la même
  // carte que dans la collection, autant y mener.
  panel?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-stats-card]');
    if (btn) openCard(btn.dataset.statsCard);
  });

  setInterval(() => {
    if (visible()) refresh();
  }, REFRESH_MS);

  setInterval(() => {
    if (visible()) renderAge();
  }, AGE_TICK_MS);
}
