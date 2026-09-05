/**
 * Récupère le plateau du ZEvent depuis https://zevent.fr/api/ et écrit
 * data/streamers.json.
 *
 * Pourquoi un fichier statique plutôt qu'un fetch depuis le navigateur :
 * l'API ne renvoie aucun en-tête Access-Control-Allow-Origin, un appel direct
 * depuis la page est donc bloqué par CORS.
 *
 * Le fichier porte le statut « en direct » et le nombre de viewers, qui servent
 * à n'afficher que les chaînes actives. C'est donc une photo datée : il est
 * régénéré à chaque déploiement ET toutes les dix minutes par le workflow
 * refresh-roster.yml. `generatedAt` permet à la page d'afficher sa fraîcheur.
 *
 *   node tools/fetch-streamers.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'streamers.json');
const API = 'https://zevent.fr/api/';

/**
 * Chaîne officielle de l'événement, toujours proposée en premier et jamais
 * filtrée : c'est le repli quand plus personne ne diffuse.
 */
const MAIN = {
  login: 'zevent',
  display: 'ZEVENT',
  avatar: null,
  location: 'Officielle',
  online: true,
  viewers: 0,
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
    online: Boolean(s.online),
    viewers: s.viewersAmount?.number ?? 0,
  }))
  // Les plus regardés d'abord : c'est l'ordre utile quand on cherche où aller.
  .sort((a, b) => b.viewers - a.viewers || a.display.localeCompare(b.display, 'fr', { sensitivity: 'base' }));

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

const live = roster.filter((s) => s.online).length;
console.log(`${roster.length} chaînes dont ${live} en direct → ${path.relative(ROOT, OUT)}`);
