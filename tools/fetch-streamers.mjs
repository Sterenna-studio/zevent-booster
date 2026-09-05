/**
 * Récupère le plateau du ZEvent depuis https://zevent.fr/api/ et écrit
 * data/streamers.json.
 *
 * Pourquoi un fichier statique plutôt qu'un fetch depuis le navigateur :
 * l'API ne renvoie aucun en-tête Access-Control-Allow-Origin, un appel direct
 * depuis la page est donc bloqué par CORS. Le fichier est régénéré à chaque
 * déploiement (voir .github/workflows/deploy-ovh.yml).
 *
 * On ne garde que ce qui est stable — identité de la chaîne. Le statut « en
 * direct » n'est volontairement pas figé ici : c'est le player Twitch qui fait
 * foi côté site, et lui est à jour.
 *
 *   node tools/fetch-streamers.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'streamers.json');
const API = 'https://zevent.fr/api/';

/** Chaîne officielle de l'événement, toujours proposée en premier. */
const MAIN = {
  login: 'zevent',
  display: 'ZEVENT',
  avatar: null,
  location: 'Officielle',
  main: true,
};

const res = await fetch(API, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } });
if (!res.ok) throw new Error(`API ZEvent : HTTP ${res.status}`);
const data = await res.json();

if (!Array.isArray(data.live) || !data.live.length) {
  throw new Error('API ZEvent : aucun streamer dans la réponse');
}

const streamers = data.live
  .filter((s) => s.twitch)
  .map((s) => ({
    login: s.twitch,
    display: s.display || s.twitch,
    avatar: s.profileUrl ?? null,
    // "LAN" = sur place à Montpellier, "Online" = en distanciel.
    location: s.location === 'LAN' ? 'Sur place' : 'À distance',
  }))
  .sort((a, b) => a.display.localeCompare(b.display, 'fr', { sensitivity: 'base' }));

// La chaîne officielle est parfois déjà dans le plateau : on évite le doublon.
const roster = [MAIN, ...streamers.filter((s) => s.login.toLowerCase() !== MAIN.login)];

fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: API,
      streamers: roster,
    },
    null,
    2
  )
);

console.log(`${roster.length} chaînes → ${path.relative(ROOT, OUT)}`);
