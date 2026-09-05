/** Chargement du manifeste de cartes + index par rareté. */
import { RARITIES } from './config.js';

let manifest = null;

export async function loadCards() {
  if (manifest) return manifest;
  const res = await fetch('data/cards.json');
  if (!res.ok) throw new Error(`Manifeste introuvable (HTTP ${res.status})`);
  const data = await res.json();

  const byId = new Map(data.cards.map((c) => [c.id, c]));
  const byRarity = Object.fromEntries(RARITIES.map((r) => [r, data.cards.filter((c) => c.rarity === r)]));

  manifest = { event: data.event, cards: data.cards, byId, byRarity };
  return manifest;
}

export function getCards() {
  if (!manifest) throw new Error('loadCards() doit être appelé avant getCards()');
  return manifest;
}
