/**
 * Cérémonie de complétion : quand la 255ᵉ Kard tombe, l'album se remplit sous
 * les yeux du joueur, une seule case reste vide — celle qu'il vient d'obtenir —
 * et c'est lui qui la pose.
 *
 * Le basculement n'a lieu qu'à la fin du booster en cours, pas à l'instant du
 * tirage : les cartes ne sont créditées qu'au moment où on les retourne, et
 * couper la révélation en cours ferait perdre celles qui restent dans le paquet.
 */
import { getCards } from './cards.js';
import { state, commit, openedBoosters } from './state.js';
import { renderGrid, setMaskedCard } from './collection.js';
import { sfx } from './audio.js';
import { registerCompletion } from './stats.js';

const bar = document.querySelector('[data-place-bar]');
const placeBtn = document.querySelector('[data-place-card]');
const dialog = document.querySelector('[data-bravo]');
const grid = document.querySelector('[data-grid]');

/** Injecté par app.js : la cérémonie doit pouvoir amener le joueur sur l'album. */
let showView = () => {};

/** La collection est-elle complète ? */
export function isComplete() {
  return Object.keys(state.owned).length >= getCards().cards.length;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Éclats projetés depuis un élément, repris de la révélation des épiques. */
const SHARD_COLORS = ['#3af340', '#ff4d8d', '#ffffff', '#c77ab0'];

function burst(host, count = 26) {
  const shards = document.createElement('div');
  shards.className = 'shards';
  for (let i = 0; i < count; i++) {
    const shard = document.createElement('i');
    shard.className = 'shard';
    shard.style.setProperty('--shard-angle', `${(360 / count) * i + (Math.random() * 12 - 6)}deg`);
    shard.style.setProperty('--shard-dist', `${150 + Math.random() * 170}px`);
    shard.style.setProperty('--shard-dur', `${0.7 + Math.random() * 0.5}s`);
    shard.style.setProperty('--shard-delay', `${Math.random() * 0.1}s`);
    shard.style.setProperty('--shard-color', SHARD_COLORS[i % SHARD_COLORS.length]);
    shards.append(shard);
  }
  host.append(shards);
  setTimeout(() => shards.remove(), 1600);
}

/* ── déroulé ───────────────────────────────────────────────────────────── */

let lastCardId = null;

/**
 * Lance la cérémonie pour la carte qui vient de compléter l'album.
 * Sans effet si l'album n'est pas réellement complet.
 */
export async function startCompletion(cardId) {
  if (!isComplete() || !grid) return;
  lastCardId = cardId ?? state.order.at(-1);

  showView('collection');
  await wait(350);

  // La dernière case reste vide : c'est le joueur qui la remplira.
  setMaskedCard(lastCardId);
  renderGrid();

  // Remplissage en cascade de tout l'album.
  grid.classList.add('is-filling');
  sfx.booster();

  const slot = grid.querySelector(`[data-card-id="${lastCardId}"]`);
  slot?.classList.add('kard--awaiting');

  // La cascade dure ~2 s pour 255 cartes ; on attend qu'elle passe.
  await wait(2400);
  grid.classList.remove('is-filling');

  slot?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await wait(500);

  if (bar) bar.hidden = false;
}

/* ── rang d'arrivée ────────────────────────────────────────────────────── */

/**
 * Prend son ticket dans le classement des albums complétés, une fois pour
 * toutes. Le rang obtenu est gardé en local : il ne se redemande pas, sinon
 * chaque nouvelle partie prendrait une place de plus.
 */
export async function claimRank() {
  if (state.completionRank !== null) return state.completionRank;

  const packs = openedBoosters();
  const rank = await registerCompletion(packs);
  if (rank === null) return null;

  state.completionRank = rank;
  state.completionPacks = packs;
  commit('completed');
  return rank;
}

/**
 * Écrit le rang dans la fenêtre de félicitations. Muet tant qu'on ne l'a pas :
 * mieux vaut un « Bravo » sans classement qu'un classement inventé.
 */
function renderRank() {
  const el = dialog?.querySelector('[data-bravo-rank]');
  if (!el) return;

  const rank = state.completionRank;
  if (!rank) {
    el.hidden = true;
    return;
  }

  const packs = state.completionPacks || openedBoosters();
  const nb = new Intl.NumberFormat('fr-FR');
  const first = rank === 1;

  el.classList.toggle('is-first', first);
  el.innerHTML = `
    <span class="bravo__rank-badge">${nb.format(rank)}<sup>${first ? 're' : 'e'}</sup></span>
    <span class="bravo__rank-text">
      ${
        first
          ? 'Tu es la <b>toute première personne</b> à compléter la collection.'
          : `Tu es la <b>${nb.format(rank)}<sup>${first ? 're' : 'e'}</sup> personne</b> à compléter la collection.`
      }
      <em>Il t'aura fallu ${nb.format(packs)} booster${packs > 1 ? 's' : ''} pour y arriver.</em>
    </span>`;
  el.hidden = false;
}

/** Le joueur pose la dernière carte. */
async function placeLast() {
  if (!lastCardId) return;
  if (bar) bar.hidden = true;

  setMaskedCard(null);
  renderGrid();

  const slot = grid?.querySelector(`[data-card-id="${lastCardId}"]`);
  if (slot) {
    slot.classList.add('kard--placed');
    slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const frame = slot.querySelector('.kard__frame');
    if (frame) burst(frame);
  }

  sfx.reveal('epic');
  document.body.classList.add('is-quaking');
  setTimeout(() => document.body.classList.remove('is-quaking'), 500);

  // La demande de rang part pendant l'animation : le temps réseau se cache
  // derrière l'éclat au lieu de retarder la fenêtre.
  const ranking = claimRank();

  await wait(1100);

  state.completed = true;
  commit('completed');

  // On lui laisse un instant de plus, pas davantage : un serveur muet ne doit
  // pas retenir le « Bravo ». S'il répond après coup, la ligne s'ajoute.
  await Promise.race([ranking, wait(1500)]);
  openBravo();
  ranking.then(() => renderRank()).catch(() => {});
}

function openBravo() {
  if (!dialog) return;
  const total = getCards().cards.length;
  const stat = dialog.querySelector('[data-bravo-stats]');
  if (stat) {
    const packs = state.completionPacks || openedBoosters();
    stat.textContent = `${total} Kards réunies · ${packs} boosters ouverts en tout.`;
  }
  renderRank();
  dialog.showModal();
}

export function initCompletion(showViewFn) {
  showView = showViewFn;
  placeBtn?.addEventListener('click', placeLast);
  document.querySelector('[data-bravo-close]')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
