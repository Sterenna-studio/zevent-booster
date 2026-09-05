/**
 * Cooldown des boosters : un de plus toutes les `boosterMs`, en temps réel.
 *
 * Le décompte ne dépend ni du player, ni de la visibilité de l'onglet, ni
 * d'une preuve de présence : il court même site fermé, et l'écart accumulé est
 * crédité au retour. C'est `state.tickCooldown()` qui fait le calcul à partir
 * des horodatages, si bien qu'un onglet mis en veille par le navigateur ne
 * fausse rien — au réveil, il rattrape simplement son retard.
 */
import { tickCooldown, commit } from './state.js';

const TICK_MS = 1000;

const tickHandlers = new Set();
const boosterHandlers = new Set();

export const onTick = (fn) => tickHandlers.add(fn);
export const onBoosterEarned = (fn) => boosterHandlers.add(fn);

function loop() {
  const gained = tickCooldown();
  if (gained > 0) {
    for (const fn of boosterHandlers) fn(gained);
    commit('booster');
  }
  for (const fn of tickHandlers) fn();
}

export function startCooldown() {
  // Un premier tour tout de suite : au chargement, il y a souvent déjà des
  // boosters en attente depuis la dernière visite.
  const gained = tickCooldown();
  if (gained > 0) for (const fn of boosterHandlers) fn(gained);
  commit('cooldown-init');

  setInterval(loop, TICK_MS);

  // Sauvegarde immédiate quand l'onglet part en arrière-plan ou se ferme :
  // c'est `cooldownAt` qu'il ne faut pas perdre.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') commit('tick-save');
  });
  window.addEventListener('pagehide', () => commit('unload'));
}
