/**
 * Télécharge les artworks des 255 cartes depuis le CDN MemoryKard vers assets/cards/,
 * et produit data/cards.json (le manifeste consommé par le site).
 *
 * Les visuels sont utilisés avec l'autorisation de l'auteur.
 * Relançable : les fichiers déjà présents et non vides sont ignorés.
 *
 *   node tools/fetch-artworks.mjs [--width 620] [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'cards');
const RAW = path.join(ROOT, 'data', 'cards.raw.json');
const MANIFEST = path.join(ROOT, 'data', 'cards.json');

const argv = process.argv.slice(2);
const width = Number(argv[argv.indexOf('--width') + 1]) || 620;
const force = argv.includes('--force');
const CONCURRENCY = 6;

/**
 * Passe par le redimensionneur Cloudflare du CDN plutôt que de tirer l'original.
 * L'hôte est conservé tel quel : les 25 cartes épiques sont servies depuis
 * s3.memorykard.maximebaudoin.fr, les autres depuis s3.memorykard.com.
 */
const cdn = (url) =>
  url.replace(
    /^(https:\/\/[^/]+)\/(card-models\/.*)$/,
    `$1/cdn-cgi/image/width=${width},quality=82,format=webp,fit=cover/$2`
  );

const slug = (s) =>
  s
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'kard';

const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
fs.mkdirSync(OUT_DIR, { recursive: true });

const cards = raw.map((c) => {
  const file = `${String(c.number).padStart(3, '0')}-${slug(c.name)}.webp`;
  return {
    id: c.id,
    number: c.number,
    name: c.name,
    rarity: c.rarity.toLowerCase(),
    image: `assets/cards/${file}`,
    _src: cdn(c.url),
    _file: path.join(OUT_DIR, file),
  };
});

let done = 0;
let skipped = 0;
const failed = [];

async function grab(card) {
  const stat = fs.existsSync(card._file) && fs.statSync(card._file);
  if (!force && stat && stat.size > 1024) {
    skipped++;
    return;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(card._src, {
        headers: { 'user-agent': 'Mozilla/5.0', accept: 'image/webp,image/*' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) throw new Error(`trop petit (${buf.length}o)`);
      fs.writeFileSync(card._file, buf);
      done++;
      return;
    } catch (err) {
      if (attempt === 3) failed.push(`#${card.number} ${card.name} — ${err.message} — ${card._src}`);
      else await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

const queue = [...cards];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const card = queue.shift();
      await grab(card);
      const n = done + skipped + failed.length;
      if (n % 25 === 0) process.stdout.write(`  ${n}/${cards.length}\n`);
    }
  })
);

fs.writeFileSync(
  MANIFEST,
  JSON.stringify(
    {
      event: {
        slug: 'zevent-x-littlebigwhale',
        name: 'ZEVENT X LITTLEBIGWHALE',
        venue: 'Montpellier, FRANCE',
        startDate: '2026-09-03',
        endDate: '2026-09-06',
        donationUrl: 'https://zevent.fr/don/littlebigwhale',
        sourceUrl: 'https://www.memorykard.com/galerie/zevent-x-littlebigwhale',
      },
      cards: cards.map(({ _src, _file, ...card }) => card),
    },
    null,
    2
  )
);

console.log(`téléchargées ${done} · déjà là ${skipped} · échecs ${failed.length}`);
if (failed.length) console.log(failed.join('\n'));
console.log(`manifeste → ${path.relative(ROOT, MANIFEST)} (${cards.length} cartes)`);
