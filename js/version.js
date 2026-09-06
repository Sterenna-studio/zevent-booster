/**
 * Surveillance de version.
 *
 * Les en-têtes du serveur sont déjà corrects — HTML, JS et CSS arrivent en
 * `no-cache, must-revalidate`, donc un rechargement suffit à obtenir la
 * dernière version. Le trou est ailleurs : ce site est fait pour rester ouvert
 * des heures devant un stream, et un onglet qui ne recharge jamais continue de
 * tourner sur le code du matin.
 *
 * On compare donc périodiquement la version inscrite dans le <head> au
 * déploiement à celle publiée dans version.json. En cas d'écart, on le signale
 * — sans jamais recharger d'autorité : quelqu'un peut être en train d'ouvrir un
 * booster, et une page qui se recharge toute seule au mauvais moment est plus
 * agaçante qu'une version qui date d'une heure.
 */

/** Intervalle de vérification. Le fichier fait quelques dizaines d'octets. */
const CHECK_MS = 10 * 60 * 1000;

const running = document.querySelector('meta[name="app-version"]')?.content ?? 'dev';

let notified = false;

async function fetchDeployed() {
  try {
    // `no-store` : on veut la vérité du serveur, pas ce que le cache en pense.
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const { version } = await res.json();
    return version ?? null;
  } catch {
    return null;
  }
}

async function check(onOutdated) {
  // En développement la page n'est pas estampillée : rien à comparer.
  if (running === 'dev' || notified) return;

  const deployed = await fetchDeployed();
  if (!deployed || deployed === running) return;

  notified = true;
  onOutdated(deployed);
}

/**
 * Démarre la surveillance. `onOutdated` reçoit la version déployée et décide
 * quoi en faire — ici, proposer le rechargement.
 */
export function watchVersion(onOutdated) {
  setTimeout(() => check(onOutdated), 30_000);
  setInterval(() => check(onOutdated), CHECK_MS);

  // Au retour sur l'onglet : c'est le moment où l'on est le plus susceptible
  // d'avoir manqué un déploiement, et le moins susceptible de déranger.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check(onOutdated);
  });
}

export function runningVersion() {
  return running;
}
