/** Vue collection : grille filtrable/triable + fiche détaillée d'une Kard. */
import { RARITY_LABEL } from './config.js';
import { getCards } from './cards.js';
import { state, ownedCount } from './state.js';
import { bindTilt } from './tilt.js';
import { openLightbox, bindZoom } from './lightbox.js';

const RARITY_RANK = { common: 0, rare: 1, epic: 2 };

const grid = document.querySelector('[data-grid]');
const emptyMsg = document.querySelector('[data-grid-empty]');
const modal = document.querySelector('[data-card-modal]');
const modalBody = document.querySelector('[data-modal-body]');

const filters = { rarity: 'all', owned: 'all', sort: 'rarity-asc' };

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

/* ── grille ────────────────────────────────────────────────────────────── */

function sortCards(cards) {
  const list = [...cards];
  switch (filters.sort) {
    case 'rarity-desc':
      return list.sort(
        (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || collator.compare(a.number, b.number)
      );
    case 'number-asc':
      return list.sort((a, b) => collator.compare(a.number, b.number));
    case 'name-asc':
      return list.sort((a, b) => collator.compare(a.name, b.name));
    case 'recent': {
      // Les dernières obtenues d'abord, puis tout ce qui n'est pas encore tombé.
      const rank = new Map(state.order.map((id, i) => [id, i]));
      return list.sort((a, b) => (rank.get(b.id) ?? -1) - (rank.get(a.id) ?? -1));
    }
    default:
      return list.sort(
        (a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || collator.compare(a.number, b.number)
      );
  }
}

function cardNode(card) {
  const count = ownedCount(card.id);
  const owned = count > 0;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `kard ${owned ? 'kard--owned' : 'kard--locked'}`;
  btn.dataset.rarity = card.rarity;
  btn.dataset.cardId = card.id;
  btn.setAttribute(
    'aria-label',
    owned ? `${card.name}, ${RARITY_LABEL[card.rarity]}` : `Kard ${card.number} non débloquée`
  );

  btn.innerHTML = `
    <span class="kard__frame">
      <img src="${card.image}" alt="${owned ? escapeAttr(card.name) : ''}" loading="lazy" decoding="async" />
      ${
        owned
          ? count > 1
            ? `<span class="kard__dupes">×${count}</span>`
            : ''
          : `<span class="kard__lock"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>`
      }
    </span>
    <span class="kard__meta">
      <span class="kard__num">#${escapeAttr(card.number)}</span>
      <span class="kard__name">${owned ? escapeAttr(card.name) : '???'}</span>
    </span>`;

  return btn;
}

const escapeAttr = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderGrid() {
  if (!grid) return;
  const { cards } = getCards();

  const visible = sortCards(
    cards.filter((card) => {
      if (filters.rarity !== 'all' && card.rarity !== filters.rarity) return false;
      const owned = ownedCount(card.id) > 0;
      if (filters.owned === 'owned' && !owned) return false;
      if (filters.owned === 'missing' && owned) return false;
      return true;
    })
  );

  const frag = document.createDocumentFragment();
  for (const card of visible) frag.append(cardNode(card));
  grid.replaceChildren(frag);
  if (emptyMsg) emptyMsg.hidden = visible.length > 0;
}

/* ── fiche détaillée ───────────────────────────────────────────────────── */

export function openCard(cardId) {
  const card = getCards().byId.get(cardId);
  if (!card || !modal || !modalBody) return;

  const count = ownedCount(card.id);
  const owned = count > 0;

  modalBody.innerHTML = `
    <div class="tilt" data-rarity="${card.rarity}" data-tilt>
      <div class="tilt__inner" data-tilt-inner>
        <img src="${card.image}" alt="${escapeAttr(card.name)}" ${owned ? '' : 'style="filter:grayscale(1) brightness(.2)"'} />
        <div class="tilt__holo" data-holo></div>
      </div>
    </div>
    <div class="card-modal__info">
      <p class="card-modal__num">KARD #${escapeAttr(card.number)}</p>
      <h3>${owned ? escapeAttr(card.name) : 'Kard verrouillée'}</h3>
      <span class="badge" data-rarity="${card.rarity}">
        <i class="dot dot--${card.rarity}"></i>${RARITY_LABEL[card.rarity]}
      </span>
      <dl class="card-modal__facts">
        <div><dt>Exemplaires</dt> <dd><b>${count}</b></dd></div>
        <div><dt>Statut</dt> <dd><b>${owned ? (count > 1 ? `${count - 1} doublon${count > 2 ? 's' : ''}` : 'Unique') : 'Pas encore tombée'}</b></dd></div>
      </dl>
    </div>`;

  modalBody.dataset.cardId = card.id;
  bindTilt(modalBody.querySelector('[data-tilt]'));
  modal.showModal();
}

/* ── câblage des contrôles ─────────────────────────────────────────────── */

export function initCollection() {
  for (const btn of document.querySelectorAll('[data-filter-rarity]')) {
    btn.addEventListener('click', () => {
      filters.rarity = btn.dataset.filterRarity;
      for (const other of document.querySelectorAll('[data-filter-rarity]')) {
        other.classList.toggle('is-active', other === btn);
      }
      renderGrid();
    });
  }

  const ownedBtn = document.querySelector('[data-filter-owned]');
  const OWNED_CYCLE = [
    ['all', 'Toutes'],
    ['owned', 'Possédées'],
    ['missing', 'Manquantes'],
  ];
  ownedBtn?.addEventListener('click', () => {
    const idx = OWNED_CYCLE.findIndex(([value]) => value === filters.owned);
    const [value, label] = OWNED_CYCLE[(idx + 1) % OWNED_CYCLE.length];
    filters.owned = value;
    ownedBtn.textContent = label;
    ownedBtn.classList.toggle('is-active', value !== 'all');
    renderGrid();
  });

  document.querySelector('[data-sort]')?.addEventListener('change', (event) => {
    filters.sort = event.target.value;
    renderGrid();
  });

  grid?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-card-id]');
    if (btn) openCard(btn.dataset.cardId);
  });

  bindZoom(grid, '[data-card-id]', (el) => el.dataset.cardId);
  // Sur tactile le clic droit n'existe pas : la carte de la fiche sert de porte.
  modalBody?.addEventListener('click', (event) => {
    const tilt = event.target.closest('[data-tilt]');
    if (tilt) openLightbox(modalBody.dataset.cardId);
  });

  document.querySelector('[data-modal-close]')?.addEventListener('click', () => modal.close());
  // Clic sur le fond (hors panneau) : on ferme.
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) modal.close();
  });
}
