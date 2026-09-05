/** Tirage d'un booster : composition des slots, chance d'épique, pitié, biais « nouvelle ». */
import { CONFIG } from './config.js';
import { getCards } from './cards.js';
import { state } from './state.js';

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * Tire une carte de la rareté demandée. Avec une probabilité `newBias`, on
 * privilégie une carte encore absente de la collection — assez pour que la
 * complétion avance, pas assez pour supprimer les doublons.
 */
function drawOne(rarity) {
  const pool = getCards().byRarity[rarity];
  if (Math.random() < CONFIG.pack.newBias) {
    const missing = pool.filter((c) => !state.owned[c.id]);
    if (missing.length) return pick(missing);
  }
  return pick(pool);
}

/**
 * Compose un booster. Ne touche pas à l'état : c'est l'appelant qui décide
 * quand créditer les cartes.
 */
export function rollPack() {
  const pityHit = state.sinceEpic >= CONFIG.pack.epicPity;
  let epicDrawn = false;

  const cards = CONFIG.pack.slots.map((slot) => {
    let rarity = slot;
    if (slot === 'hit') {
      const wantsEpic = pityHit || Math.random() < CONFIG.pack.epicChance;
      rarity = wantsEpic ? 'epic' : 'rare';
    }
    if (rarity === 'epic') epicDrawn = true;
    return drawOne(rarity);
  });

  return { cards, epicDrawn };
}
