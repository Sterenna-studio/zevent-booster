/** Tous les réglages du jeu au même endroit. */
export const CONFIG = {
  /** Chaîne Twitch par défaut, quand le viewer n'en a pas encore choisi une. */
  channel: 'zevent',

  /** Temps de visionnage compté nécessaire pour gagner un booster. */
  boosterMs: 10 * 60 * 1000,

  /**
   * Boosters offerts à la première visite : de quoi ouvrir tout de suite et
   * comprendre le jeu, sans attendre dix minutes devant un écran vide.
   */
  welcomeBoosters: 10,

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

  /** Anti-AFK : au bout de ce temps compté sans interaction, on demande confirmation. */
  afk: {
    afterMs: 25 * 60 * 1000,
    graceMs: 90 * 1000,
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
