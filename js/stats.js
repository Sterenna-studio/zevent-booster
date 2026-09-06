/**
 * Statistiques partagées : combien de fois chaque Kard est tombée chez
 * l'ensemble des visiteurs.
 *
 * Tout est facultatif et silencieux. Si l'API ne répond pas, le site
 * fonctionne exactement comme avant : c'est un site statique d'abord, la
 * statistique n'est qu'un ornement. Aucun appel ne bloque le jeu.
 *
 * Ce qui part du navigateur : des identifiants de cartes, rien d'autre. Pas de
 * cookie, pas d'identifiant de visiteur, pas de compte.
 */
import { state, commit } from './state.js';
import { getCards } from './cards.js';

/**
 * L'API est servie sur le même chemin que le site. On remonte au dossier
 * courant pour supporter aussi bien /zevent-booster/ que /zevent-booster.
 */
function apiBase() {
  let dir = location.pathname;
  if (!dir.endsWith('/')) {
    dir = /\.[a-z0-9]+$/i.test(dir) ? dir.replace(/[^/]*$/, '') : `${dir}/`;
  }
  return `${dir}api/`;
}

/**
 * En local il n'y a pas de Worker : on lit la production pour pouvoir
 * travailler l'affichage, mais on n'écrit jamais — hors de question de gonfler
 * les compteurs réels depuis un poste de développement.
 */
const LOCAL = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const BASE = LOCAL ? 'https://nitro.sterenna.fr/zevent-booster/api/' : apiBase();
const READ_ONLY = LOCAL;

/** Plafond accepté par le Worker pour une reprise de sauvegarde. */
const BACKFILL_MAX = 2000;

/** { total, cards: { id: tirages } }, ou null tant qu'on n'a rien. */
let data = null;

export function statsReady() {
  return data !== null;
}

/** Boosters ouverts sur le site, tous visiteurs confondus. */
export function totalPacks() {
  return data?.packs ?? null;
}

/**
 * Tirages bruts d'une carte, sans mise en perspective. Zéro est une valeur qui
 * a un sens ici — une carte jamais tombée nulle part est justement ce qu'on
 * cherche en triant par rareté réelle. `null` veut dire « on ne sait pas ».
 */
export function pullsOf(cardId) {
  return data ? (data.cards[cardId] ?? 0) : null;
}

export async function loadStats() {
  try {
    const res = await fetch(`${BASE}stats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch {
    // On garde les données précédentes plutôt que de vider l'affichage : une
    // coupure passagère ne doit pas faire disparaître le compteur déjà à l'écran.
    if (data === null) data = null;
  }
  return data;
}

/** Intervalle de rafraîchissement du compteur communautaire. */
const REFRESH_MS = 2 * 60 * 1000;

/**
 * Rafraîchit les compteurs de temps en temps et prévient à chaque changement.
 * Rien ici ne doit pouvoir casser la page : `loadStats` avale déjà ses erreurs,
 * et le rappel est protégé.
 */
export function watchStats(onChange) {
  let last = data?.packs ?? null;

  const tick = async () => {
    // Inutile d'interroger un onglet que personne ne regarde.
    if (document.visibilityState !== 'visible') return;
    await loadStats();
    const packs = data?.packs ?? null;
    if (packs === null || packs === last) return;
    last = packs;
    try {
      onChange(packs);
    } catch {
      /* un compteur d'affichage ne fait pas tomber le site */
    }
  };

  setInterval(tick, REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}

/** Envoi silencieux, sans attente ni reprise sur échec. */
function post(body) {
  if (READ_ONLY) return;
  fetch(`${BASE}pulls`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

/** Déclare les cartes d'un booster qui vient d'être ouvert. */
export function reportPack(cards) {
  if (!cards?.length) return;
  post({ cards: cards.map((c) => c.id) });
}

/**
 * Reprend une fois, et une seule, la collection déjà constituée. Le drapeau
 * survit à la réinitialisation de la progression — sinon chaque « recommencer »
 * renverrait tout une deuxième fois et fausserait durablement les compteurs.
 */
export function backfillOnce() {
  if (READ_ONLY || state.statsBackfilled) return;

  const cards = [];
  for (const [id, count] of Object.entries(state.owned)) {
    for (let i = 0; i < count && cards.length < BACKFILL_MAX; i++) cards.push(id);
  }

  state.statsBackfilled = true;
  commit('backfill');
  if (cards.length) post({ mode: 'backfill', cards });
}

/**
 * Volume minimal avant de comparer une carte à ses sœurs. Sans ce garde-fou,
 * une épique tombée une seule fois passait pour « tombant souvent » : la
 * moyenne de sa rareté était encore plus basse qu'elle. On exige donc à la
 * fois une moyenne installée et un échantillon propre à la carte.
 */
const LUCK_MIN_AVERAGE = 8;
const LUCK_MIN_PULLS = 5;

/**
 * Chiffres d'une carte, ou null si l'API est muette ou la carte jamais tombée.
 * `luck` compare sa fréquence à la moyenne de sa rareté : au-dessus de 1 elle
 * sort plus souvent que ses sœurs, en dessous elle se fait désirer. Il reste à
 * null tant qu'on n'a pas de quoi l'affirmer.
 */
export function cardStats(cardId) {
  if (!data || !data.total) return null;
  const pulls = data.cards[cardId] ?? 0;
  if (!pulls) return null;

  const card = getCards().byId.get(cardId);
  const pool = getCards().byRarity[card.rarity];

  let rarityTotal = 0;
  for (const c of pool) rarityTotal += data.cards[c.id] ?? 0;
  const moyenne = rarityTotal / pool.length;

  const comparable = moyenne >= LUCK_MIN_AVERAGE && pulls >= LUCK_MIN_PULLS;

  return {
    pulls,
    share: pulls / data.total,
    luck: comparable ? pulls / moyenne : null,
  };
}
