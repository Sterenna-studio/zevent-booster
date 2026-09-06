/**
 * Interroge l'API GraphQL Analytics de Cloudflare et résume le trafic réel de
 * https://nitro.sterenna.fr/zevent-booster/.
 *
 * Pourquoi passer par Cloudflare : le site est statique et n'embarque aucune
 * balise de mesure. Le proxy, lui, voit et compte déjà tout — sans rien ajouter
 * sur la page ni cookie chez le visiteur.
 *
 * Un point de lecture important : une visite qui ouvre la Collection déclenche
 * ~290 requêtes (les 255 artworks). Le nombre de requêtes ne dit donc rien de la
 * fréquentation. On ne compte comme « page vue » que les réponses HTML.
 *
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ZONE_ID=… node tools/traffic.mjs [jours]
 */
// Un jeton dédié en lecture seule est préférable : le jeton généraliste de
// l'organisation sert au DNS et au cache, inutile de l'élargir pour lire des
// statistiques. On l'accepte quand même en repli s'il porte déjà le droit.
const TOKEN = process.env.CLOUDFLARE_ANALYTICS_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
const ZONE = process.env.CLOUDFLARE_ZONE_ID;
const HOST = process.env.TRAFFIC_HOST ?? 'nitro.sterenna.fr';
const PREFIX = process.env.TRAFFIC_PREFIX ?? '/zevent-booster';
const DAYS = Math.min(Math.max(Number(process.argv[2]) || 7, 1), 30);

if (!TOKEN || !ZONE) {
  console.error(
    'Il manque un jeton (CLOUDFLARE_ANALYTICS_TOKEN ou CLOUDFLARE_API_TOKEN) et/ou CLOUDFLARE_ZONE_ID.'
  );
  process.exit(1);
}

const until = new Date();
const since = new Date(until.getTime() - DAYS * 86400_000);
const iso = (d) => d.toISOString().split('.')[0] + 'Z';

async function gql(query, variables) {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors?.length) {
    const msg = body.errors.map((e) => e.message).join(' · ');
    throw new Error(msg);
  }
  return body.data;
}

/**
 * Le plan Free refuse une fenêtre de plus d'un jour sur le jeu de données
 * détaillé (« cannot request a time range wider than 1d »). On interroge donc
 * un jour à la fois et on agrège nous-mêmes.
 */
const QUERY_DAY = `
query ($zone: String!, $since: Time!, $until: Time!, $host: String!, $page: String!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      toutes: httpRequestsAdaptiveGroups(
        limit: 1
        filter: { datetime_geq: $since, datetime_lt: $until, clientRequestHTTPHost: $host }
      ) {
        count
      }
      pages: httpRequestsAdaptiveGroups(
        limit: 60
        orderBy: [count_DESC]
        filter: { datetime_geq: $since, datetime_lt: $until, clientRequestHTTPHost: $host, edgeResponseContentTypeName: "html" }
      ) {
        count
        dimensions { clientRequestPath }
      }
      pays: httpRequestsAdaptiveGroups(
        limit: 10
        orderBy: [count_DESC]
        filter: { datetime_geq: $since, datetime_lt: $until, clientRequestHTTPHost: $host, clientRequestPath: $page }
      ) {
        count
        dimensions { clientCountryName }
      }
    }
  }
}`;

/** Repli quand le jeu de données « adaptive » n'est pas ouvert au jeton. */
const QUERY_SIMPLE = `
query ($zone: String!, $since: Date!, $until: Date!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      httpRequests1dGroups(limit: 30, filter: { date_geq: $since, date_leq: $until }, orderBy: [date_ASC]) {
        dimensions { date }
        sum { pageViews requests }
        uniq { uniques }
      }
    }
  }
}`;

const n = (v) => new Intl.NumberFormat('fr-FR').format(v);
const lines = [];
const say = (s = '') => {
  lines.push(s);
  console.log(s);
};

try {
  const parJour = [];
  const parPage = new Map();
  const parPays = new Map();
  const manquants = [];
  let requetesTotales = 0;

  // Une requête par journée calendaire UTC, du plus ancien au plus récent.
  // Des tranches glissantes de 24 h donneraient des étiquettes de date
  // trompeuses : « 05/09 » désignerait en fait hier midi → aujourd'hui midi.
  const minuit = new Date(until);
  minuit.setUTCHours(0, 0, 0, 0);

  for (let d = DAYS - 1; d >= 0; d--) {
    const from = new Date(minuit.getTime() - d * 86400_000);
    const to = new Date(Math.min(from.getTime() + 86400_000, until.getTime()));
    if (to <= from) continue;

    let z;
    try {
      const data = await gql(QUERY_DAY, {
        zone: ZONE,
        since: iso(from),
        until: iso(to),
        host: HOST,
        page: `${PREFIX}/`,
      });
      z = data.viewer.zones[0];
    } catch (dayErr) {
      // Le plan Free ne garde le détail que quelques jours : les plus anciens
      // peuvent refuser de répondre sans que le reste soit compromis.
      manquants.push(`${from.toISOString().slice(0, 10)} (${dayErr.message})`);
      continue;
    }
    if (!z) throw new Error(`zone ${ZONE} introuvable pour ce jeton`);

    requetesTotales += z.toutes[0]?.count ?? 0;

    let vuesDuJour = 0;
    for (const p of z.pages) {
      const path = p.dimensions.clientRequestPath;
      if (!path.startsWith(PREFIX)) continue;
      vuesDuJour += p.count;
      parPage.set(path, (parPage.get(path) ?? 0) + p.count);
    }
    for (const c of z.pays ?? []) {
      parPays.set(c.dimensions.clientCountryName, (parPays.get(c.dimensions.clientCountryName) ?? 0) + c.count);
    }
    parJour.push({ date: from.toISOString().slice(0, 10), count: vuesDuJour });
  }

  if (!parJour.length) throw new Error('aucun jour exploitable sur la fenêtre demandée');

  const vues = parJour.reduce((t, d) => t + d.count, 0);

  say(`# Trafic ${HOST}${PREFIX} — ${DAYS} derniers jours`);
  say();
  say(`**${n(vues)} pages vues** sur ${PREFIX} (réponses HTML uniquement).`);
  say(`Toutes requêtes de l'hôte sur la période, images comprises : ${n(requetesTotales)}.`);
  say();

  say('## Pages vues par jour');
  say();
  const max = Math.max(...parJour.map((d) => d.count), 1);
  for (const d of parJour) {
    const bar = '█'.repeat(Math.max(d.count ? 1 : 0, Math.round((d.count / max) * 30)));
    say(`${d.date}  ${String(d.count).padStart(6)}  ${bar}`);
  }
  say();

  if (parPage.size) {
    say('## Pages les plus vues');
    say();
    for (const [path, count] of [...parPage].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      say(`${String(count).padStart(6)}  ${path}`);
    }
    say();
  }

  if (parPays.size) {
    say('## Pays');
    say();
    for (const [pays, count] of [...parPays].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      say(`${String(count).padStart(6)}  ${pays}`);
    }
    say();
  }

  if (manquants.length) {
    say(`> Jours sans détail disponible : ${manquants.join(', ')}`);
  }
  say('> Cloudflare compte les requêtes vues par le proxy, robots inclus.');
  say('> C’est un ordre de grandeur fiable, pas une mesure de visiteurs uniques.');
} catch (err) {
  say(`# Trafic — le jeu de données détaillé a répondu : ${err.message}`);
  say();
  say('Repli sur les totaux quotidiens de la zone entière.');
  say();
  try {
    const day = (d) => d.toISOString().slice(0, 10);
    const data = await gql(QUERY_SIMPLE, { zone: ZONE, since: day(since), until: day(until) });
    const rows = data.viewer.zones[0]?.httpRequests1dGroups ?? [];
    if (!rows.length) say('Aucune donnée renvoyée.');
    for (const r of rows) {
      say(
        `${r.dimensions.date}  pages vues ${String(r.sum.pageViews).padStart(7)}` +
          `  visiteurs ${String(r.uniq.uniques).padStart(7)}  requêtes ${String(r.sum.requests).padStart(8)}`
      );
    }
    say();
    say('> Ces chiffres couvrent **toute la zone sterenna.fr**, pas seulement');
    say('> zevent-booster. Pour du détail par page il faut un jeton avec la');
    say('> permission « Account Analytics: Read » (jeu de données adaptive).');
  } catch (err2) {
    say(`Le repli a échoué aussi : ${err2.message}`);
    say();
    say('Le jeton doit porter « Zone → Analytics → Read » sur sterenna.fr.');
    say('Le plus propre : un jeton dédié en lecture seule, ajouté au repo sous');
    say('le nom CLOUDFLARE_ANALYTICS_TOKEN — ce script le prend en priorité.');
    process.exitCode = 1;
  }
}

// Rend le résumé lisible directement dans l'onglet Actions.
if (process.env.GITHUB_STEP_SUMMARY) {
  const fs = await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}
