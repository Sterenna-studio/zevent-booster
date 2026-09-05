/** Tous les réglages du jeu au même endroit. */
export const CONFIG = {
  /** Chaîne Twitch suivie par le compteur. */
  channel: 'zevent',

  /** Temps de visionnage compté nécessaire pour gagner un booster. */
  boosterMs: 10 * 60 * 1000,

  /** Composition d'un booster : 3 classiques, 1 rare, 1 slot « chance ». */
  pack: {
    slots: ['common', 'common', 'common', 'rare', 'hit'],
    /** Probabilité qu'une épique tombe sur le slot chance. */
    epicChance: 0.12,
    /** Nombre de boosters sans épique après lequel une épique est garantie. */
    epicPity: 15,
    /** Probabilité de privilégier une carte non possédée à rareté égale. */
    newBias: 0.6,
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
