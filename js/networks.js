/**
 * Réseaux des artistes : pictogrammes, libellés, et le rendu d'une liste de
 * liens. Partagé entre la fiche d'une Kard et la page À propos — les deux
 * créditent les mêmes personnes, elles doivent le faire de la même façon.
 */

const ICON = {
  website: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/>',
  instagram:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1.1" fill="currentColor"/>',
  twitch: '<path d="M4 4h16v10l-4 4h-3l-3 3H8v-3H4z"/><path d="M11 8v4M15 8v4"/>',
  tiktok: '<path d="M14 4v10.5a3.5 3.5 0 1 1-3-3.46"/><path d="M14 4c.6 2.5 2.2 3.9 4.5 4.1"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.5l5 2.5-5 2.5z"/>',
  x: '<path d="M4 4l16 16M20 4L4 20"/>',
  bluesky:
    '<path d="M12 11c-2-4-6-6.5-7.5-5.5S3.5 11 5 12.5c1 1 3 1 4 .5-1.5 1-2 3 0 4.5 1.5 1 3-1.5 3-3.5 0 2 1.5 4.5 3 3.5 2-1.5 1.5-3.5 0-4.5 1 .5 3 .5 4-.5 1.5-1.5 2-6.5.5-7.5S14 7 12 11z"/>',
};

const LABEL = {
  website: 'Site',
  instagram: 'Instagram',
  twitch: 'Twitch',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  bluesky: 'Bluesky',
};

const escapeAttr = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Les liens d'un artiste, en HTML. `cls` préfixe les classes pour que chaque
 * page garde sa mise en forme.
 */
export function networkLinks(artist, cls) {
  return (artist?.links ?? [])
    .filter((l) => l.url)
    .map(
      (l) => `
      <a class="${cls}__link" href="${escapeAttr(l.url)}" target="_blank" rel="noopener"
         title="${escapeAttr(LABEL[l.network] ?? l.network)} — ${escapeAttr(l.label ?? '')}">
        <svg viewBox="0 0 24 24" aria-hidden="true">${ICON[l.network] ?? ICON.website}</svg>
        ${escapeAttr(l.label || LABEL[l.network] || l.network)}
      </a>`
    )
    .join('');
}
