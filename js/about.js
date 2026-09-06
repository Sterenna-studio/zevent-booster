/**
 * Page À propos : ce que ce site est, ce qu'il n'est pas, et surtout les gens
 * à qui il doit d'exister.
 *
 * La liste des artistes est construite à partir des Kards elles-mêmes — les
 * crédits ne peuvent donc pas se désynchroniser des cartes qu'ils accompagnent.
 */
import { getCards } from './cards.js';
import { networkLinks } from './networks.js';

const host = document.querySelector('[data-artists]');
const countEl = document.querySelector('[data-artists-count]');

const escapeAttr = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const collator = new Intl.Collator('fr', { sensitivity: 'base' });

/** Un artiste, ses Kards, ses liens. */
function artistCard({ artist, cards }) {
  const numbers = cards
    .map((c) => `<button type="button" class="credit__kard" data-about-card="${escapeAttr(c.id)}">#${escapeAttr(c.number)}</button>`)
    .join('');

  const links = networkLinks(artist, 'credit');

  return `
    <article class="credit">
      <h4 class="credit__name">${escapeAttr(artist.name)}</h4>
      ${artist.bio ? `<p class="credit__bio">${escapeAttr(artist.bio)}</p>` : ''}
      <p class="credit__kards">${numbers}</p>
      ${links ? `<div class="credit__links">${links}</div>` : ''}
    </article>`;
}

export function renderAbout() {
  if (!host) return;

  // Un artiste peut avoir signé plusieurs Kards : on regroupe par nom.
  const byArtist = new Map();
  for (const card of getCards().cards) {
    if (!card.artist) continue;
    const key = card.artist.name;
    if (!byArtist.has(key)) byArtist.set(key, { artist: card.artist, cards: [] });
    byArtist.get(key).cards.push(card);
  }

  const list = [...byArtist.values()].sort((a, b) => collator.compare(a.artist.name, b.artist.name));

  host.innerHTML = list.map(artistCard).join('');
  if (countEl) countEl.textContent = String(list.length);
}

export function initAbout(openCard) {
  renderAbout();
  // Le numéro d'une Kard ouvre sa fiche : depuis les crédits, on doit pouvoir
  // aller voir ce dont on parle.
  host?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-about-card]');
    if (btn) openCard(btn.dataset.aboutCard);
  });
}
