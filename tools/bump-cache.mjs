#!/usr/bin/env node
/**
 * Estampille un ?v=<N> identique sur tous les imports locaux (.js) et sur les
 * <script src> / <link href> de index.html, pour que le navigateur recharge
 * les modules après un déploiement.
 *
 * La version DOIT être la même partout : deux URL différentes pour un même
 * module, c'est deux instances chargées, et les singletons (l'état, le
 * manifeste de cartes) se dédoublent.
 *
 *   node tools/bump-cache.mjs        # incrémente la version trouvée
 *   node tools/bump-cache.mjs 42     # force une version
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.github', 'assets', 'data']);
const EXTS = new Set(['.js', '.html']);

// import/from './module.js'  (chemins locaux uniquement)
const IMPORT_RE = /((?:from|import)\s*\(?\s*['"])(\.\.?\/[^'"?]+\.js)(?:\?v=\d+)?(['"])/g;
// <script src="js/app.js">, <link href="css/style.css">
const ASSET_RE = /((?:src|href)=")((?:js|css)\/[^"?]+\.(?:js|css))(?:\?v=\d+)?(")/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.has(extname(name))) out.push(full);
  }
  return out;
}

const files = walk(ROOT);

const arg = process.argv[2];
let version = Number.parseInt(arg ?? '', 10);
if (!Number.isFinite(version)) {
  let max = 0;
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\?v=(\d+)/g)) {
      max = Math.max(max, Number.parseInt(m[1], 10));
    }
  }
  version = max + 1;
}

let changed = 0;
let stamped = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const stamp = (_, pre, path, post) => {
    stamped++;
    return `${pre}${path}?v=${version}${post}`;
  };
  const next = src.replace(IMPORT_RE, stamp).replace(ASSET_RE, stamp);
  if (next !== src) {
    writeFileSync(file, next);
    changed++;
  }
}

console.log(`version ${version} · ${stamped} références estampillées dans ${changed} fichiers`);
