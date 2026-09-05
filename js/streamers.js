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
/** Chaînes réellement proposées : celles en direct, ou tout le plateau à défaut. */
let listed = [];
let generatedAt = null;
/** Vrai quand plus personne ne diffusait au dernier rafraîchissement. */
let showingAll = false;

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
    generatedAt = data.generatedAt ? new Date(data.generatedAt) : null;
  } catch {
    // Sans le plateau, le site reste jouable sur la chaîne par défaut.
    roster = [
      { login: CONFIG.channel, display: 'ZEVENT', avatar: null, location: 'Officielle', online: true, main: true },
    ];
    generatedAt = null;
  }
  byLogin = new Map(roster.map((s) => [s.login, s]));

  // On ne propose que ce qui diffuse. Hors événement plus personne n'est en
  // direct : plutôt qu'une liste vide, on montre tout le plateau en le disant.
  const live = roster.filter((s) => s.online);
  showingAll = live.length <= 1;
  listed = showingAll ? roster : live;

  return roster;
}

/** « il y a 4 min », pour dire honnêtement l'âge de la photo du plateau. */
function freshness() {
  if (!generatedAt) return '';
  const min = Math.max(0, Math.round((Date.now() - generatedAt.getTime()) / 60000));
  if (min < 1) return " · à l'instant";
  if (min < 60) return ` · il y a ${min} min`;
  const h = Math.round(min / 60);
  return ` · il y a ${h} h`;
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

  const matches = q ? listed.filter((s) => norm(s.display).includes(q) || norm(s.login).includes(q)) : listed;
  const active = currentChannel();
  const viewers = new Intl.NumberFormat('fr-FR');

  listEl.innerHTML = matches
    .map(
      (s) => `
      <button type="button" class="chan-row${s.login === active ? ' is-active' : ''}" data-pick="${escapeAttr(s.login)}">
        ${avatarHtml(s, 'chan-row__avatar')}
        <span class="chan-row__name">${escapeAttr(s.display)}</span>
        ${s.viewers ? `<span class="chan-row__viewers">${viewers.format(s.viewers)}</span>` : ''}
        <span class="chan-row__tag${s.main ? ' is-main' : ''}">${escapeAttr(s.location)}</span>
      </button>`
    )
    .join('');

  if (countEl) {
    if (q) {
      countEl.textContent = `${matches.length} chaîne${matches.length > 1 ? 's' : ''} trouvée${matches.length > 1 ? 's' : ''}`;
    } else if (showingAll) {
      countEl.textContent = `aucune chaîne en direct — plateau complet, ${listed.length} chaînes`;
    } else {
      countEl.textContent = `${listed.length} chaînes en direct${freshness()}`;
    }
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
