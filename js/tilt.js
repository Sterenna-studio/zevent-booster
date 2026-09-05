/**
 * Inclinaison 3D d'une carte suivant le curseur, et déplacement du voile
 * holographique avec lui. Partagé par la fiche détaillée et le zoom.
 *
 * `root` porte `data-rarity` ; c'est le CSS qui décide d'afficher le voile ou
 * non selon la rareté.
 */
export function bindTilt(root, { amplitude = 22 } = {}) {
  if (!root) return;
  const inner = root.querySelector('[data-tilt-inner]');
  const holo = root.querySelector('[data-holo]');
  if (!inner) return;

  const move = (event) => {
    const rect = root.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    inner.style.transform = `rotateY(${(px - 0.5) * amplitude}deg) rotateX(${(0.5 - py) * amplitude}deg) scale(1.02)`;
    if (holo) holo.style.backgroundPosition = `${px * 100}% ${py * 100}%`;
  };

  const reset = () => {
    inner.style.transform = '';
  };

  root.addEventListener('pointermove', move);
  root.addEventListener('pointerleave', reset);
}
