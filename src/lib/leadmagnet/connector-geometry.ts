/** Cotes d'encombrement (mm) des boîtiers documentés dans connector-library.ts.
 *
 * Ce module ne fournit AUCUN brochage et n'est PAS un modèle CAO qualifié :
 * c'est une illustration d'encombrement pour aider à visualiser la taille du
 * boîtier femelle. Chaque cote porte sa source (URL + page) quand elle a été
 * relevée sur la fiche fabricant. Quand une cote n'a pas pu être confirmée à
 * la source, `dimensionsToVerify` vaut `true` et la largeur est alors dérivée
 * du nombre de positions × le pas documenté (jamais une valeur inventée).
 */

export interface HousingGeometryDimension {
  /** Valeur en millimètres. */
  valueMm: number;
  sourceUrl: string;
  sourcePage: number;
}

export interface HousingGeometry {
  housingMpn: string;
  /** Largeur hors-tout du boîtier (perpendiculaire au sens des voies). */
  width: HousingGeometryDimension;
  /** Hauteur du corps du boîtier, hors saillie inférieure. */
  height: HousingGeometryDimension;
  depth: HousingGeometryDimension;
  /**
   * Saillie sous le plan d'appui, relevée séparément sur le plan. La
   * décomposition est conservée : hauteur du corps + saillie = enveloppe.
   */
  lowerProtrusion?: HousingGeometryDimension;
  /**
   * `true` si une ou plusieurs cotes n'ont pas pu être confirmées sur la
   * fiche fabricant : la largeur est alors dérivée de `positions × pitchMm`
   * et la hauteur/profondeur sont des estimations grossières à ne jamais
   * traiter comme fiables. L'UI DOIT afficher cet avertissement.
   */
  dimensionsToVerify: boolean;
}

/** Famille PH (JST) — cotes lues sur la fiche fabricant. */
const PH_SOURCE = "https://www.jst-mfg.com/product/pdf/eng/ePH.pdf";
const PH_PAGE = 3;

/**
 * Famille XH (JST) — cotes de BOÎTIER relevées sur le plan « Housing » de la
 * fiche officielle, page 4 (les pages précédentes documentent les contacts,
 * pas les boîtiers) : XHP-2 B = 7,3 mm, XHP-3 B = 9,8 mm, profondeur 5,7 mm,
 * hauteur de corps 7,5 mm avec une saillie inférieure de 0,25 mm
 * (enveloppe 7,75 mm, décomposition conservée). Aucune largeur n'est plus
 * dérivée de positions × pas.
 */
const XH_SOURCE = "https://www.jst-mfg.com/product/pdf/eng/eXH.pdf";
const XH_PAGE = 4;
const XH_HEIGHT_MM = 7.5;
const XH_LOWER_PROTRUSION_MM = 0.25;
const XH_DEPTH_MM = 5.7;

export const HOUSING_GEOMETRY: readonly HousingGeometry[] = [
  {
    housingMpn: "PHR-2",
    width: { valueMm: 5.8, sourceUrl: PH_SOURCE, sourcePage: PH_PAGE },
    height: { valueMm: 6.85, sourceUrl: PH_SOURCE, sourcePage: PH_PAGE },
    depth: { valueMm: 4.5, sourceUrl: PH_SOURCE, sourcePage: PH_PAGE },
    dimensionsToVerify: false,
  },
  {
    housingMpn: "PHR-3",
    width: { valueMm: 7.8, sourceUrl: PH_SOURCE, sourcePage: PH_PAGE },
    height: { valueMm: 6.85, sourceUrl: PH_SOURCE, sourcePage: PH_PAGE },
    depth: { valueMm: 4.5, sourceUrl: PH_SOURCE, sourcePage: PH_PAGE },
    dimensionsToVerify: false,
  },
  {
    housingMpn: "XHP-2",
    // Cote B du plan « Housing », page 4 de la fiche officielle.
    width: { valueMm: 7.3, sourceUrl: XH_SOURCE, sourcePage: XH_PAGE },
    height: { valueMm: XH_HEIGHT_MM, sourceUrl: XH_SOURCE, sourcePage: XH_PAGE },
    depth: { valueMm: XH_DEPTH_MM, sourceUrl: XH_SOURCE, sourcePage: XH_PAGE },
    lowerProtrusion: {
      valueMm: XH_LOWER_PROTRUSION_MM,
      sourceUrl: XH_SOURCE,
      sourcePage: XH_PAGE,
    },
    dimensionsToVerify: false,
  },
  {
    housingMpn: "XHP-3",
    // Cote B du plan « Housing », page 4 de la fiche officielle.
    width: { valueMm: 9.8, sourceUrl: XH_SOURCE, sourcePage: XH_PAGE },
    height: { valueMm: XH_HEIGHT_MM, sourceUrl: XH_SOURCE, sourcePage: XH_PAGE },
    depth: { valueMm: XH_DEPTH_MM, sourceUrl: XH_SOURCE, sourcePage: XH_PAGE },
    lowerProtrusion: {
      valueMm: XH_LOWER_PROTRUSION_MM,
      sourceUrl: XH_SOURCE,
      sourcePage: XH_PAGE,
    },
    dimensionsToVerify: false,
  },
];

/** Hauteur d'enveloppe = corps + saillie inférieure éventuelle. */
export function envelopeHeightMm(g: HousingGeometry): number {
  return +(g.height.valueMm + (g.lowerProtrusion?.valueMm ?? 0)).toFixed(3);
}

export function geometryByHousingId(housingMpn: string): HousingGeometry | null {
  return HOUSING_GEOMETRY.find((g) => g.housingMpn === housingMpn) ?? null;
}
