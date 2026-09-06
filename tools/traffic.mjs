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
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE = process.env.CLOUDFLARE_ZONE_ID;
const HOST = process.env.TRAFFIC_HOST ?? 'nitro.sterenna.fr';
const PREFIX = process.env.TRAFFIC_PREFIX ?? '/zevent-booster';
const DAYS = Math.min(Math.max(Number(process.argv[2]) || 7, 1), 30);

if (!TOKEN || !ZONE) {
  console.error('Il manque CLOUDFLARE_API_TOKEN et/ou CLOUDFLARE_ZONE_ID.');
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

const FILTER = `{
  datetime_geq: $since, datetime_leq: $until,
  clientRequestHTTPHost: $host
}`;

const QUERY = `
query ($zone: String!, $since: Time!, $until: Time!, $host: String!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      toutes: httpRequestsAdaptiveGroups(limit: 1, filter: ${FILTER}) {
        count
        sum { edgeResponseBytes }
      }
      pages: httpRequestsAdaptiveGroups(
        limit: 40
        orderBy: [count_DESC]
        filter: { datetime_geq: $since, datetime_leq: $until, clientRequestHTTPHost: $host, edgeResponseContentTypeName: "html" }
      ) {
        count
        dimensions { clientRequestPath }
      }
      parJour: httpRequestsAdaptiveGroups(
        limit: 40
        orderBy: [date_ASC]
        filter: { datetime_geq: $since, datetime_leq: $until, clientRequestHTTPHost: $host, edgeResponseContentTypeName: "html" }
      ) {
        count
        dimensions { date }
      }
      pays: httpRequestsAdaptiveGroups(
        limit: 8
        orderBy: [count_DESC]
        filter: { datetime_geq: $since, datetime_leq: $until, clientRequestHTTPHost: $host, edgeResponseContentTypeName: "html" }
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
  const data = await gql(QUERY, { zone: ZONE, since: iso(since), until: iso(until), host: HOST });
  const z = data.viewer.zones[0];
  if (!z) throw new Error(`zone ${ZONE} introuvable pour ce jeton`);

  const pages = z.pages.filter((p) => p.dimensions.clientRequestPath.startsWith(PREFIX));
  const vues = pages.reduce((t, p) => t + p.count, 0);
  const jours = z.parJour;

  say(`# Trafic ${HOST}${PREFIX} — ${DAYS} derniers jours`);
  say();
  say(`**${n(vues)} pages vues** sur ${PREFIX} (réponses HTML uniquement).`);
  say(`Toutes requêtes de l'hôte, images comprises : ${n(z.toutes[0]?.count ?? 0)}.`);
  say();

  if (jours.length) {
    say('## Par jour (HTML, tout l’hôte)');
    say();
    const max = Math.max(...jours.map((d) => d.count), 1);
    for (const d of jours) {
      const bar = '█'.repeat(Math.max(1, Math.round((d.count / max) * 30)));
      say(`${d.dimensions.date}  ${String(d.count).padStart(6)}  ${bar}`);
    }
    say();
  }

  if (pages.length) {
    say('## Pages les plus vues');
    say();
    for (const p of pages.slice(0, 12)) {
      say(`${String(p.count).padStart(6)}  ${p.dimensions.clientRequestPath}`);
    }
    say();
  }

  if (z.pays?.length) {
    say('## Pays');
    say();
    for (const c of z.pays) say(`${String(c.count).padStart(6)}  ${c.dimensions.clientCountryName}`);
    say();
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
    say('Vérifier que le jeton porte « Zone Analytics: Read » sur sterenna.fr.');
    process.exitCode = 1;
  }
}

// Rend le résumé lisible directement dans l'onglet Actions.
if (process.env.GITHUB_STEP_SUMMARY) {
  const fs = await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}
