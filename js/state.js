/**
 * Sauvegarde locale + petit bus d'événements.
 * Toute la progression tient dans un seul objet sérialisé dans localStorage.
 */
import { CONFIG } from './config.js';

const EMPTY = {
  /**
   * Horodatage à partir duquel le cooldown court. Il avance par tranches
   * entières de `boosterMs`, si bien que le reste donne directement le temps
   * restant avant le prochain booster.
   */
  cooldownAt: 0,
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
  /** Chaîne Twitch choisie par le viewer (null = celle par défaut). */
  channel: null,
  /** Les boosters d'accueil ont-ils déjà été crédités ? */
  welcomed: false,
  /** La cérémonie de complétion a-t-elle déjà eu lieu ? */
  completed: false,
  /** La collection existante a-t-elle déjà été déclarée aux statistiques ? */
  statsBackfilled: false,
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

/* ── cooldown ──────────────────────────────────────────────────────────── */

const atCap = () => state.boosters >= CONFIG.maxStock;

/**
 * Convertit le temps écoulé en boosters. Le cooldown court en temps réel, site
 * fermé compris : au retour, on crédite d'un coup ce qui s'est accumulé.
 *
 * Tant que le stock est plein, le cooldown est gelé — comme une jauge
 * d'énergie : il repart quand on a ouvert quelque chose. Renvoie le nombre de
 * boosters crédités.
 */
export function tickCooldown(now = Date.now()) {
  // Première visite, ou horloge remise en arrière : on (re)part de maintenant.
  if (!state.cooldownAt || state.cooldownAt > now) {
    state.cooldownAt = now;
    return 0;
  }

  if (atCap()) {
    state.cooldownAt = now;
    return 0;
  }

  const due = Math.floor((now - state.cooldownAt) / CONFIG.boosterMs);
  if (due <= 0) return 0;

  const room = CONFIG.maxStock - state.boosters;
  const gained = Math.min(due, room);
  state.cooldownAt += due * CONFIG.boosterMs;
  state.boosters += gained;
  state.earned += gained;
  return gained;
}

/** Millisecondes restantes avant le prochain booster. */
export function msToNextBooster(now = Date.now()) {
  if (atCap()) return 0;
  return Math.max(0, CONFIG.boosterMs - (now - state.cooldownAt));
}

/* ── mutations ─────────────────────────────────────────────────────────── */

export function consumeBooster() {
  if (state.boosters <= 0) return false;
  const wasFull = atCap();
  state.boosters -= 1;
  // Le cooldown était gelé stock plein : il redémarre à cet instant.
  if (wasFull) state.cooldownAt = Date.now();
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

/**
 * Crédite les boosters d'accueil à la première visite. Après un reset le
 * drapeau repart à false : recommencer, c'est recommencer pour de bon.
 * Renvoie le nombre offert, 0 si c'était déjà fait.
 */
export function claimWelcome(amount) {
  if (state.welcomed || amount <= 0) return 0;
  state.welcomed = true;
  state.boosters += amount;
  state.earned += amount;
  return amount;
}

export function reset() {
  Object.assign(state, EMPTY, {
    owned: {},
    order: [],
    // Préférences et chaîne choisie ne font pas partie de la progression.
    sound: state.sound,
    channel: state.channel,
    // Ce drapeau non plus : sans lui, chaque « recommencer » redéclarerait
    // toute la collection aux statistiques et gonflerait les compteurs.
    statsBackfilled: state.statsBackfilled,
    cooldownAt: Date.now(),
  });
  commit('reset');
}
