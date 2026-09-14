/** Échelle graduée d'une vignette.
 *
 * Module partagé par le repli 2D (repère millimétrique du SVG) et par le rendu
 * 3D (projection orthographique). Le calcul est le même dans les deux cas : la
 * règle mesure une longueur RÉELLE en millimètres, elle n'est ni décorative ni
 * une fausse échelle 1:1, et aucune échelle commune n'est imposée au catalogue.
 */

/** Pas de graduation lisible : une valeur ronde proche du tiers du cadrage. */
export function niceScaleStep(span: number): number {
  const candidates = [0.5, 1, 2, 5, 10, 20, 50, 100];
  const target = span / 3;
  return candidates.reduce((best, v) =>
    Math.abs(v - target) < Math.abs(best - target) ? v : best,
  );
}

/**
 * Zoom d'une caméra orthographique de vignette, en PIXELS PAR MILLIMÈTRE.
 * Une petite référence est cadrée pour occuper une zone comparable à une grande
 * (`fitToView`), sans que ses cotes affichées changent pour autant.
 */
export function thumbnailZoom(span: number, opts: { pair: boolean; fitToView: boolean }): number {
  if (opts.pair) return 1.4;
  return opts.fitToView ? 80 / span : 2;
}

/**
 * Règle mesurée dans la projection orthographique : en projection
 * orthographique, `zoom` est exactement le nombre de pixels par millimètre dans
 * le plan de vue. La longueur en pixels vaut donc `pas × zoom`, et le pas est
 * réduit d'un cran tant que la règle dépasserait la largeur utile de la
 * vignette. La valeur affichée reste la longueur réellement tracée.
 */
export function projectedScaleBar(
  span: number,
  zoom: number,
  maxPx: number,
): { stepMm: number; lengthPx: number } {
  const candidates = [0.5, 1, 2, 5, 10, 20, 50, 100];
  let stepMm = niceScaleStep(span);
  while (stepMm * zoom > maxPx) {
    const smaller = candidates.filter((v) => v < stepMm).pop();
    if (smaller === undefined) break;
    stepMm = smaller;
  }
  return { stepMm, lengthPx: stepMm * zoom };
}
