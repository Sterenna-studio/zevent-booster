/**
 * Sélecteur de chaîne : le ZEvent, ce sont ~340 chaînes en parallèle, pas
 * seulement twitch.tv/zevent. Le viewer choisit qui il regarde, le compteur
 * tourne pareil.
 *
 * Le plateau est servi en statique (data/streamers.json) : l'API de zevent.fr
 * ne renvoie pas d'en-tête CORS, un appel direct depuis la page est bloqué.
 * Le fichier est régénéré à chaque déploiement — voir tools/fetch-streamers.mjs.
 * Le statut « en direct » n'en vient donc pas : c'est le player Twitch qui fait
 * foi, et c'est lui qui conditionne le compteur.
 */
import { CONFIG } from './config.js';
import { state, commit } from './state.js';

let roster = [];
let byLogin = new Map();

const dialog = document.querySelector('[data-channel-picker]');
const listEl = document.querySelector('[data-channel-list]');
const searchEl = document.querySelector('[data-channel-search]');
const countEl = document.querySelector('[data-channel-count]');
const currentEl = document.querySelector('[data-current-channel]');

const escapeAttr = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** La chaîne effectivement regardée : le choix du viewer, sinon le défaut. */
export function currentChannel() {
  return state.channel || CONFIG.channel;
}

export async function loadStreamers() {
  try {
    const res = await fetch('data/streamers.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    roster = data.streamers ?? [];
  } catch {
    // Sans le plateau, le site reste jouable sur la chaîne par défaut.
    roster = [{ login: CONFIG.channel, display: 'ZEVENT', avatar: null, location: 'Officielle', main: true }];
  }
  byLogin = new Map(roster.map((s) => [s.login, s]));
  return roster;
}

/** Vignette : l'avatar Twitch, ou l'initiale si l'image manque ou tombe. */
function avatarHtml(entry, cls) {
  const initial = escapeAttr((entry.display || entry.login).charAt(0).toUpperCase());
  if (!entry.avatar) return `<span class="${cls} ${cls}--letter">${initial}</span>`;
  return `<img class="${cls}" src="${escapeAttr(entry.avatar)}" alt="" loading="lazy" decoding="async"
    onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls} ${cls}--letter',textContent:'${initial}'}))" />`;
}

export function renderCurrentChannel() {
  if (!currentEl) return;
  const login = currentChannel();
  const entry = byLogin.get(login) ?? { login, display: login, avatar: null, location: '' };
  currentEl.innerHTML = `
    ${avatarHtml(entry, 'chan__avatar')}
    <span class="chan__names">
      <strong>${escapeAttr(entry.display)}</strong>
      <span class="chan__login">twitch.tv/${escapeAttr(entry.login)}</span>
    </span>`;
}

function renderList(query = '') {
  if (!listEl) return;
  const q = query
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  const norm = (s) =>
    String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');

  const matches = q ? roster.filter((s) => norm(s.display).includes(q) || norm(s.login).includes(q)) : roster;
  const active = currentChannel();

  listEl.innerHTML = matches
    .map(
      (s) => `
      <button type="button" class="chan-row${s.login === active ? ' is-active' : ''}" data-pick="${escapeAttr(s.login)}">
        ${avatarHtml(s, 'chan-row__avatar')}
        <span class="chan-row__name">${escapeAttr(s.display)}</span>
        <span class="chan-row__tag${s.main ? ' is-main' : ''}">${escapeAttr(s.location)}</span>
      </button>`
    )
    .join('');

  if (countEl) {
    countEl.textContent = q
      ? `${matches.length} chaîne${matches.length > 1 ? 's' : ''} trouvée${matches.length > 1 ? 's' : ''}`
      : `${roster.length} chaînes du plateau`;
  }
}

/**
 * Change de chaîne. `apply` est fourni par le module Twitch : il pilote le
 * player. On sépare pour que ce module n'ait pas à connaître l'embed.
 */
export function initStreamerPicker(apply) {
  renderCurrentChannel();
  renderList();

  document.querySelector('[data-open-channels]')?.addEventListener('click', () => {
    renderList(searchEl?.value ?? '');
    dialog?.showModal();
    searchEl?.focus();
  });

  searchEl?.addEventListener('input', () => renderList(searchEl.value));

  listEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-pick]');
    if (!btn) return;
    state.channel = btn.dataset.pick;
    commit('channel');
    renderCurrentChannel();
    apply(state.channel);
    dialog?.close();
  });

  document.querySelector('[data-channel-close]')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
