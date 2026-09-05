/**
 * Récupère les artistes crédités sur les cartes épiques et les injecte dans
 * data/cards.raw.json (champ `artist`), d'où fetch-artworks.mjs les reprend
 * pour le manifeste.
 *
 * Les données vivent dans le payload RSC de la page galerie, sérialisées avec
 * des guillemets échappés (\"). On découpe donc l'objet à la main par
 * équilibrage d'accolades avant de le parser.
 *
 *   node tools/fetch-artists.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'cards.raw.json');
const PAGE = 'https://www.memorykard.com/galerie/zevent-x-littlebigwhale';

const res = await fetch(PAGE, {
  headers: {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  },
});
if (!res.ok) throw new Error(`Galerie : HTTP ${res.status}`);

// Next échappe quelques caractères en \uXXXX dans le payload : on les rend
// d'abord littéraux pour que les regex ci-dessous ne butent pas dessus.
const html = (await res.text()).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
  String.fromCharCode(parseInt(h, 16))
);

/** Sous-chaîne { … } équilibrée démarrant à `start`. */
function braceSlice(s, start) {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

const unescape = (s) => s.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

const CARD = /\{\\"id\\":\\"([a-z0-9]{15,})\\",\\"number\\":\\"([^\\]*)\\"/g;
const KEY = '\\"artist\\":';

const artists = new Map();
const failed = [];

for (const m of html.matchAll(CARD)) {
  const [, id, number] = m;
  if (artists.has(id)) continue;

  const record = html.slice(m.index, m.index + 6000);
  const at = record.indexOf(KEY);
  if (at < 0) continue;

  const after = record.slice(at + KEY.length);
  // La grande majorité des cartes n'a pas d'artiste crédité.
  if (!after.startsWith('{')) continue;

  const raw = braceSlice(after, 0);
  if (!raw) continue;
  try {
    const artist = JSON.parse(unescape(raw));
    artists.set(id, {
      name: artist.name,
      bio: artist.bio || null,
      profileUrl: artist.profileUrl || null,
      links: (artist.links ?? []).map(({ network, label, url }) => ({ network, label, url })),
    });
  } catch (err) {
    failed.push(`#${number} — ${err.message}`);
  }
}

const cards = JSON.parse(fs.readFileSync(RAW, 'utf8'));
let attached = 0;
for (const card of cards) {
  const artist = artists.get(card.id);
  if (artist) {
    card.artist = artist;
    attached++;
  } else {
    delete card.artist;
  }
}
fs.writeFileSync(RAW, JSON.stringify(cards, null, 2));

console.log(`${artists.size} artistes trouvés · ${attached} rattachés à une carte`);
if (failed.length) console.log('échecs :\n' + failed.join('\n'));
