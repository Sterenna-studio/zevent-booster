/**
 * Zoom plein écran sur une Kard : clic droit depuis la grille, le bandeau, la
 * fiche ou la carte en cours de révélation.
 *
 * La carte est affichée aussi grande que la source le permet sans bouillie :
 * les artworks font 620 px de large, le CSS plafonne donc la hauteur pour
 * rester proche du 1:1. Voir le README pour les régénérer plus grands.
 */
import { RARITY_LABEL } from './config.js';
import { getCards } from './cards.js';
import { ownedCount } from './state.js';
import { bindTilt } from './tilt.js';

const dialog = document.querySelector('[data-lightbox]');
const body = document.querySelector('[data-lightbox-body]');

const escapeAttr = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Ouvre le zoom sur une carte. Accepte un id ou l'objet carte — pendant une
 * révélation, on a l'objet sous la main et pas besoin de repasser par l'index.
 */
export function openLightbox(cardOrId) {
  if (!dialog || !body) return;
  const card = typeof cardOrId === 'string' ? getCards().byId.get(cardOrId) : cardOrId;
  if (!card) return;

  const count = ownedCount(card.id);

  body.innerHTML = `
    <div class="lightbox__card tilt" data-rarity="${card.rarity}" data-tilt>
      <div class="tilt__inner" data-tilt-inner>
        <img src="${card.image}" alt="${escapeAttr(card.name)}" decoding="async" />
        <div class="tilt__holo" data-holo></div>
      </div>
    </div>
    <p class="lightbox__caption">
      <span class="lightbox__num">#${escapeAttr(card.number)}</span>
      <strong>${escapeAttr(card.name)}</strong>
      <span class="lightbox__rarity"><i class="dot dot--${card.rarity}"></i>${RARITY_LABEL[card.rarity]}</span>
      ${count > 1 ? `<span class="lightbox__dupes">×${count}</span>` : ''}
    </p>`;

  bindTilt(body.querySelector('[data-tilt]'), { amplitude: 14 });
  dialog.showModal();
}

/**
 * Branche le clic droit sur un conteneur. `resolve` reçoit l'élément cliqué et
 * renvoie la carte (ou son id), ou rien si le zoom n'a pas lieu d'être — par
 * exemple sur une carte encore face cachée, qu'on ne va pas déflorer.
 */
export function bindZoom(container, selector, resolve) {
  container?.addEventListener('contextmenu', (event) => {
    const el = selector ? event.target.closest(selector) : container;
    if (!el) return;
    const card = resolve(el);
    if (!card) return;
    event.preventDefault();
    openLightbox(card);
  });
}

export function initLightbox() {
  document.querySelector('[data-lightbox-close]')?.addEventListener('click', () => dialog.close());
  // Clic n'importe où en dehors de la carte : on ferme.
  dialog?.addEventListener('click', (event) => {
    if (!event.target.closest('.lightbox__card')) dialog.close();
  });
}
