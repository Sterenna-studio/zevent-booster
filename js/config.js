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
   * Plafond de boosters en attente. Le cooldown tourne en temps réel, site
   * fermé compris ; sans plafond, revenir après trois jours d'absence donnerait
   * de quoi compléter la collection d'un coup. À 24, on peut s'absenter six
   * heures sans rien perdre. Mettre `Infinity` pour retirer la limite.
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

export const RARITIES = ['common', 'rare', 'epic'];

export const RARITY_LABEL = {
  common: 'Classique',
  rare: 'Rare',
  epic: 'Épique',
};
