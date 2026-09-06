/** Tous les réglages du jeu au même endroit. */
export const CONFIG = {
  /** Chaîne Twitch par défaut, quand le viewer n'en a pas encore choisi une. */
  channel: 'zevent',

  /** Intervalle du cooldown : un booster de plus toutes les 15 minutes. */
  boosterMs: 15 * 60 * 1000,

  /**
   * Boosters offerts à la première visite : de quoi ouvrir tout de suite et
   * comprendre le jeu, sans attendre le premier cooldown.
   */
  welcomeBoosters: 10,

  /**
   * Dernière ligne droite. Le ZEvent 2026 se termine le 7 septembre à 1 h du
   * matin : la soirée accélère le cooldown, et l'accueil passe à 15 boosters
   * jusqu'à la fin. Après quoi tout revient au rythme normal, sans qu'on ait
   * à toucher au code — les bornes sont dans le calendrier.
   *
   * Les instants portent leur décalage horaire (+02:00, heure d'été de Paris) :
   * l'événement se termine au même moment pour tout le monde, et le rythme ne
   * dépend donc pas du fuseau réglé sur la machine du visiteur.
   */
  rush: {
    phases: [
      { from: '2026-09-06T22:00:00+02:00', boosterMs: 10 * 60 * 1000, label: '10 minutes' },
      { from: '2026-09-07T00:00:00+02:00', boosterMs: 5 * 60 * 1000, label: '5 minutes' },
    ],
    /** Fin de l'événement : retour au rythme et à l'accueil habituels. */
    until: '2026-09-07T01:00:00+02:00',
    /** Accueil renforcé, dès maintenant et jusqu'à la fin. */
    welcomeBoosters: 15,
  },

  /**
   * Plafond de boosters en attente. Le cooldown tourne en temps réel, site
   * fermé compris ; sans plafond, revenir après trois jours d'absence donnerait
   * de quoi compléter la collection d'un coup. À 24, on peut s'absenter six
   * heures sans rien perdre — deux heures au rythme de la dernière soirée.
   * Mettre `Infinity` pour retirer la limite.
   *
   * Une sauvegarde déjà au-dessus du plafond garde ses boosters : on cesse
   * simplement d'en ajouter tant qu'elle n'est pas redescendue.
   */
  maxStock: 24,

  /** Composition d'un booster : 3 classiques, 1 rare, 1 slot « chance ». */
  pack: {
    slots: ['common', 'common', 'common', 'rare', 'hit'],
    /** Probabilité qu'une épique tombe sur le slot chance. */
    epicChance: 0.12,
    /** Nombre de boosters sans épique après lequel une épique est garantie. */
    epicPity: 15,
    /** Probabilité de privilégier une carte non possédée à rareté égale. */
    newBias: 0.6,
    /**
     * Chance qu'un slot ordinaire monte d'un cran. C'est ce qui rend un
     * booster « gros » possible : deux épiques dans le même paquet arrivent
     * environ une fois par collection complète.
     */
    upgrade: { common: 0.08, rare: 0.05 },
  },

  /** Clé de sauvegarde locale. */
  storageKey: 'zevent-booster.v1',
};

/* ── rythme du moment ──────────────────────────────────────────────────── */

const RUSH_PHASES = CONFIG.rush.phases
  .map((phase) => ({ ...phase, at: Date.parse(phase.from) }))
  .sort((a, b) => a.at - b.at);
const RUSH_END = Date.parse(CONFIG.rush.until);

/**
 * La phase d'accélération en cours, ou null en dehors : avant la première
 * borne, et définitivement une fois l'événement terminé.
 */
export function activeRush(now = Date.now()) {
  if (now >= RUSH_END) return null;
  let current = null;
  for (const phase of RUSH_PHASES) if (now >= phase.at) current = phase;
  return current && { ...current, endsAt: RUSH_END };
}

/** Intervalle du cooldown à cet instant. */
export function currentBoosterMs(now = Date.now()) {
  return activeRush(now)?.boosterMs ?? CONFIG.boosterMs;
}

/** Ce qu'on offre à un nouveau venu à cet instant. */
export function currentWelcome(now = Date.now()) {
  return now < RUSH_END ? CONFIG.rush.welcomeBoosters : CONFIG.welcomeBoosters;
}

/** « 15 minutes », pour les phrases qui annoncent le rythme. */
export function rhythmLabel(now = Date.now()) {
  return activeRush(now)?.label ?? '15 minutes';
}

export const RARITIES = ['common', 'rare', 'epic'];

export const RARITY_LABEL = {
  common: 'Classique',
  rare: 'Rare',
  epic: 'Épique',
};
