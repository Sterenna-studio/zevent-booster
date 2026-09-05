/** Vue ouverture : déchirure du paquet, retournement des 5 Kards, bandeau récap. */
import { RARITY_LABEL } from './config.js';
import { state, consumeBooster, grant, commit, msToNextBooster } from './state.js';
import { rollPack } from './packs.js';
import { sfx } from './audio.js';
import { openCard } from './collection.js';

const root = document.querySelector('.opening');
const scenes = {
  empty: document.querySelector('[data-scene="empty"]'),
  ready: document.querySelector('[data-scene="ready"]'),
  reveal: document.querySelector('[data-scene="reveal"]'),
};
const packBtn = document.querySelector('[data-open-pack]');
const deckEl = document.querySelector('[data-deck]');
const trayEl = document.querySelector('[data-tray]');
const flashEl = document.querySelector('[data-flash]');
const hintEl = document.querySelector('[data-reveal-hint]');
const actionsEl = document.querySelector('[data-reveal-actions]');
const readyCount = document.querySelector('[data-ready-count]');
const emptyEta = document.querySelector('[data-empty-eta]');
const captionEl = document.querySelector('[data-reveal-caption]');

/** Cartes du booster en cours, et index de celle qui est sur le dessus. */
let queue = [];
let cursor = 0;
let busy = false;
/** La carte du dessus est-elle déjà retournée ? */
let shown = false;
/** index → la carte était-elle une première (pour le tampon du bandeau). */
const revealed = new Map();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function showScene(name) {
  for (const [key, el] of Object.entries(scenes)) {
    if (el) el.hidden = key !== name;
  }
  root?.setAttribute('data-stage', name);
}

/** Affiche la bonne scène selon l'état — sauf si une ouverture est en cours. */
export function refreshOpening() {
  if (busy || queue.length) return;

  if (state.boosters > 0) {
    if (readyCount) readyCount.textContent = String(state.boosters);
    showScene('ready');
  } else {
    if (emptyEta) emptyEta.textContent = formatEta(msToNextBooster());
    showScene('empty');
  }
}

function formatEta(ms) {
  const min = Math.ceil(ms / 60000);
  return min <= 1 ? 'moins d’une minute' : `${min} minutes`;
}

/* ── ouverture ─────────────────────────────────────────────────────────── */

async function openPack() {
  if (busy || !consumeBooster()) return;
  busy = true;

  const { cards, epicDrawn } = rollPack();
  state.sinceEpic = epicDrawn ? 0 : state.sinceEpic + 1;
  commit('open');

  sfx.tear();
  packBtn?.classList.add('is-tearing');
  await wait(450);
  packBtn?.classList.remove('is-tearing');

  queue = cards;
  cursor = 0;
  shown = false;
  revealed.clear();
  hideCaption();
  if (trayEl) trayEl.replaceChildren();
  if (actionsEl) actionsEl.hidden = true;
  showScene('reveal');
  buildDeck();
  updateHint();
  busy = false;
}

function buildDeck() {
  if (!deckEl) return;
  deckEl.removeAttribute('data-aura');
  deckEl.replaceChildren();

  queue.forEach((card, i) => {
    const flipper = document.createElement('div');
    flipper.className = 'flipper';
    flipper.dataset.index = String(i);
    flipper.style.zIndex = String(queue.length - i);
    flipper.style.transform = `translate(${i * 4}px, ${i * -5}px)`;
    flipper.innerHTML = `
      <div class="flipper__face flipper__face--back"><span>Z</span></div>
      <div class="flipper__face flipper__face--front">
        <img src="${card.image}" alt="" decoding="async" />
      </div>`;
    deckEl.append(flipper);
  });
}

function updateHint() {
  if (!hintEl) return;
  const left = queue.length - cursor;
  if (!left) {
    hintEl.textContent = '';
  } else if (shown) {
    hintEl.textContent = left > 1 ? `Clique pour la suivante · ${left - 1} restante${left > 2 ? 's' : ''}` : 'Clique pour terminer';
  } else {
    hintEl.textContent = `Clique pour retourner la carte · ${left} restante${left > 1 ? 's' : ''}`;
  }
}

/**
 * Un clic = une action, et une seule carte à l'écran à la fois :
 *   - carte face cachée   → on la retourne et on l'enregistre ;
 *   - carte déjà révélée  → elle rejoint le bandeau et la suivante se retourne.
 */
async function advance() {
  if (busy || cursor >= queue.length) return;
  busy = true;

  if (shown) {
    await dismissCurrent();
    cursor += 1;
    if (cursor >= queue.length) {
      updateHint();
      busy = false;
      finishPack();
      return;
    }
  }

  await revealCurrent();
  busy = false;
}

async function revealCurrent() {
  const card = queue[cursor];
  const flipper = deckEl?.querySelector(`.flipper[data-index="${cursor}"]`);
  if (!flipper) return;

  sfx.flip();
  flipper.style.transform = '';
  flipper.classList.add('is-flipped');
  await wait(340);

  // La carte n'entre dans la collection qu'au moment où elle est révélée :
  // le tampon « NOUVELLE » reflète donc l'état réel à cet instant.
  const isNew = grant(card.id);
  commit('grant');
  revealed.set(cursor, isNew);
  shown = true;

  deckEl?.setAttribute('data-aura', card.rarity);
  sfx.reveal(card.rarity);
  showCaption(card, isNew);

  if (card.rarity === 'epic') fireEpic();
  else flashFire();

  updateHint();
}

async function dismissCurrent() {
  const card = queue[cursor];
  const flipper = deckEl?.querySelector(`.flipper[data-index="${cursor}"]`);
  hideCaption();
  if (flipper) {
    flipper.classList.add('is-gone');
    addToTray(card, revealed.get(cursor) ?? false);
    await wait(400);
    flipper.remove();
  }
  deckEl?.removeAttribute('data-aura');
  document.querySelector('.rays')?.remove();
  shown = false;
}

function flashFire() {
  if (!flashEl) return;
  flashEl.classList.remove('is-firing');
  void flashEl.offsetWidth;
  flashEl.classList.add('is-firing');
}

function showCaption(card, isNew) {
  if (!captionEl) return;
  captionEl.dataset.rarity = card.rarity;
  captionEl.innerHTML = `
    <span class="reveal-caption__num">#${card.number}</span>
    <strong>${card.name}</strong>
    <span class="reveal-caption__rarity"><i class="dot dot--${card.rarity}"></i>${RARITY_LABEL[card.rarity]}</span>
    <span class="reveal-caption__flag ${isNew ? 'is-new' : ''}">${isNew ? 'NOUVELLE' : 'DOUBLON'}</span>`;
  captionEl.hidden = false;
}

function hideCaption() {
  if (captionEl) captionEl.hidden = true;
}

function fireEpic() {
  flashFire();

  document.body.classList.remove('is-quaking');
  void document.body.offsetWidth;
  document.body.classList.add('is-quaking');
  setTimeout(() => document.body.classList.remove('is-quaking'), 500);

  if (!document.querySelector('.rays')) {
    const rays = document.createElement('div');
    rays.className = 'rays';
    deckEl?.parentElement?.prepend(rays);
    requestAnimationFrame(() => rays.classList.add('is-on'));
  }
}

function addToTray(card, isNew) {
  if (!trayEl) return;
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'tray-card';
  node.dataset.rarity = card.rarity;
  node.dataset.cardId = card.id;
  node.title = `#${card.number} — ${card.name} (${RARITY_LABEL[card.rarity]})`;
  node.innerHTML = `
    <img src="${card.image}" alt="${card.name}" decoding="async" />
    <span class="tray-card__tag ${isNew ? 'tray-card__tag--new' : 'tray-card__tag--dupe'}">
      ${isNew ? 'NOUVELLE' : 'DOUBLON'}
    </span>`;
  trayEl.append(node);
}

function finishPack() {
  queue = [];
  cursor = 0;
  shown = false;
  revealed.clear();
  hideCaption();
  if (actionsEl) {
    actionsEl.hidden = false;
    const again = actionsEl.querySelector('[data-open-again]');
    if (again) {
      again.disabled = state.boosters === 0;
      again.textContent =
        state.boosters > 0 ? `Ouvrir un autre booster (${state.boosters})` : 'Plus de booster disponible';
    }
  }
  if (hintEl) hintEl.textContent = '';
}

/* ── câblage ───────────────────────────────────────────────────────────── */

export function initOpening() {
  packBtn?.addEventListener('click', openPack);
  document.querySelector('[data-reveal-stage]')?.addEventListener('click', advance);

  document.querySelector('[data-open-again]')?.addEventListener('click', () => {
    if (state.boosters > 0) {
      showScene('ready');
      if (readyCount) readyCount.textContent = String(state.boosters);
      openPack();
    }
  });

  trayEl?.addEventListener('click', (event) => {
    const node = event.target.closest('[data-card-id]');
    if (node) openCard(node.dataset.cardId);
  });

  // Barre d'espace / Entrée pour enchaîner les révélations sans viser à la souris.
  window.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    if (document.querySelector('dialog[open]')) return;
    if (scenes.reveal?.hidden === false && queue.length) {
      event.preventDefault();
      advance();
    }
  });
}
