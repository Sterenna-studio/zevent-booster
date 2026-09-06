/**
 * Compteur de tirages partagé — Worker Cloudflare + base D1.
 *
 * Deux routes, montées sur le domaine du site pour rester en même origine
 * (ni CORS ni requête préliminaire) :
 *
 *   POST /zevent-booster/api/pulls   { cards: [id…], mode?: "backfill" }
 *   GET  /zevent-booster/api/stats   { total, cards: { id: tirages } }
 *
 * Ce qui est stocké : un compteur par carte, et un budget horaire par IP
 * *hachée* pour l'anti-abus. Aucune IP en clair, aucun identifiant de
 * visiteur, aucun cookie.
 *
 * Les chiffres sont indicatifs par construction : l'endpoint est public, donc
 * gonflable. Le budget horaire borne les dégâts, il ne les empêche pas.
 */

/** Taille d'un booster : une requête normale ne peut pas envoyer plus. */
const PACK_SIZE = 5;
/** Plafond d'une reprise de sauvegarde existante (une fois par navigateur). */
const BACKFILL_MAX = 2000;
/**
 * Budget de tirages par IP et par heure. Assez large pour une reprise suivie
 * d'une session normale, assez serré pour qu'un script n'inonde pas la base.
 */
const HOURLY_BUDGET = 2500;

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers ?? {}) },
  });

/**
 * Empreinte de l'IP, salée : elle sert uniquement de clé de budget et ne
 * permet pas de remonter à l'adresse.
 */
async function ipKey(request, salt) {
  const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Consomme `amount` tirages sur le budget horaire. Renvoie false si le budget
 * est épuisé — l'appelant répond alors 429 sans rien écrire.
 */
async function takeBudget(db, key, amount) {
  const hour = Math.floor(Date.now() / 3_600_000);
  const row = await db.prepare('SELECT hour, pulls FROM ip_budget WHERE ip_hash = ?').bind(key).first();

  const used = row && row.hour === hour ? row.pulls : 0;
  if (used + amount > HOURLY_BUDGET) return false;

  await db
    .prepare(
      `INSERT INTO ip_budget (ip_hash, hour, pulls) VALUES (?, ?, ?)
       ON CONFLICT(ip_hash) DO UPDATE SET
         pulls = CASE WHEN ip_budget.hour = excluded.hour THEN ip_budget.pulls + excluded.pulls ELSE excluded.pulls END,
         hour  = excluded.hour`
    )
    .bind(key, hour, amount)
    .run();

  return true;
}

async function handlePulls(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'corps illisible' }, { status: 400 });
  }

  const cards = Array.isArray(body?.cards) ? body.cards : null;
  if (!cards || !cards.length) return json({ error: 'aucune carte' }, { status: 400 });

  const backfill = body.mode === 'backfill';
  const max = backfill ? BACKFILL_MAX : PACK_SIZE;
  if (cards.length > max) return json({ error: 'lot trop grand' }, { status: 400 });

  // Les identifiants viennent du client : on ne garde que ce qui a la forme
  // d'un id de carte, pour ne pas laisser polluer la table.
  const clean = cards.filter((id) => typeof id === 'string' && /^[a-z0-9]{15,32}$/.test(id));
  if (!clean.length) return json({ error: 'identifiants invalides' }, { status: 400 });

  const key = await ipKey(request, env.IP_SALT ?? 'zevent');
  if (!(await takeBudget(env.DB, key, clean.length))) {
    return json({ error: 'budget horaire atteint' }, { status: 429 });
  }

  // Regroupé : une même carte peut tomber deux fois dans le même paquet.
  const counts = new Map();
  for (const id of clean) counts.set(id, (counts.get(id) ?? 0) + 1);

  const stmt = env.DB.prepare(
    `INSERT INTO card_pulls (card_id, pulls) VALUES (?, ?)
     ON CONFLICT(card_id) DO UPDATE SET pulls = card_pulls.pulls + excluded.pulls`
  );
  await env.DB.batch([...counts].map(([id, n]) => stmt.bind(id, n)));

  return new Response(null, { status: 204 });
}

async function handleStats(env) {
  const { results } = await env.DB.prepare('SELECT card_id, pulls FROM card_pulls').all();

  const cards = {};
  let total = 0;
  for (const row of results) {
    cards[row.card_id] = row.pulls;
    total += row.pulls;
  }

  return json(
    { total, cards },
    {
      headers: {
        // Mis en cache au bord : la fraîcheur à la minute suffit largement.
        'cache-control': 'public, max-age=60',
        // Lecture publique assumée : ces compteurs n'ont rien de confidentiel,
        // et l'ouvrir permet de travailler l'affichage depuis un poste local.
        // Le POST, lui, reste sans en-tête CORS.
        'access-control-allow-origin': '*',
      },
    }
  );
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname.endsWith('/api/pulls')) {
      return handlePulls(request, env);
    }
    if (request.method === 'GET' && pathname.endsWith('/api/stats')) {
      return handleStats(env);
    }
    return json({ error: 'route inconnue' }, { status: 404 });
  },
};
