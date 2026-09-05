/**
 * Sauvegarde locale + petit bus d'événements.
 * Toute la progression tient dans un seul objet sérialisé dans localStorage.
 */
import { CONFIG } from './config.js';

const EMPTY = {
  /** Millisecondes de visionnage effectivement comptées. */
  watchedMs: 0,
  /** Boosters gagnés mais pas encore ouverts. */
  boosters: 0,
  /** Total de boosters gagnés depuis le début (stat). */
  earned: 0,
  /** Boosters ouverts depuis la dernière épique (compteur de pitié). */
  sinceEpic: 0,
  /** { [cardId]: nombre d'exemplaires } */
  owned: {},
  /** Ordre d'obtention, pour le tri « récentes ». */
  order: [],
  /** Sons activés. */
  sound: true,
};

const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return { ...EMPTY, owned: {}, order: [] };
    const parsed = JSON.parse(raw);
    return { ...EMPTY, ...parsed, owned: { ...parsed.owned }, order: [...(parsed.order ?? [])] };
  } catch {
    // Sauvegarde corrompue ou stockage indisponible : on repart à zéro plutôt que de planter.
    return { ...EMPTY, owned: {}, order: [] };
  }
}

export const state = read();

function persist() {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
  } catch {
    /* mode privé, quota plein… : la session continue, elle ne sera juste pas sauvegardée */
  }
}

/** Notifie les vues et sauvegarde. `reason` permet de filtrer côté abonné. */
export function commit(reason = 'change') {
  persist();
  for (const fn of listeners) fn(state, reason);
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state, 'init');
  return () => listeners.delete(fn);
}

/* ── mutations ─────────────────────────────────────────────────────────── */

/** Ajoute du temps compté et convertit en boosters. Renvoie le nombre gagné. */
export function addWatchTime(ms) {
  const before = Math.floor(state.watchedMs / CONFIG.boosterMs);
  state.watchedMs += ms;
  const after = Math.floor(state.watchedMs / CONFIG.boosterMs);
  const gained = after - before;
  if (gained > 0) {
    state.boosters += gained;
    state.earned += gained;
  }
  return gained;
}

export function consumeBooster() {
  if (state.boosters <= 0) return false;
  state.boosters -= 1;
  return true;
}

/** Enregistre une carte tirée. Renvoie true si c'est un premier exemplaire. */
export function grant(cardId) {
  const isNew = !state.owned[cardId];
  state.owned[cardId] = (state.owned[cardId] ?? 0) + 1;
  if (isNew) state.order.push(cardId);
  return isNew;
}

export function ownedCount(cardId) {
  return state.owned[cardId] ?? 0;
}

export function reset() {
  Object.assign(state, EMPTY, { owned: {}, order: [], sound: state.sound });
  commit('reset');
}

/** Millisecondes restantes avant le prochain booster. */
export function msToNextBooster() {
  return CONFIG.boosterMs - (state.watchedMs % CONFIG.boosterMs);
}
