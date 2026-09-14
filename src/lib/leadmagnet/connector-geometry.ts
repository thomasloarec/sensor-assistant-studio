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
  height: HousingGeometryDimension;
  depth: HousingGeometryDimension;
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
 * Famille XH (JST) — seul le pas (2,5 mm, déjà dans connector-library.ts) a
 * pu être confirmé lors de cette revue. La largeur, la hauteur et la
 * profondeur du boîtier XHP n'ont pas pu être relevées avec certitude sur
 * https://www.jst-mfg.com/product/pdf/eng/eXH.pdf : elles restent donc
 * marquées `dimensionsToVerify: true`. La largeur ci-dessous est calculée
 * (positions × pas), pas mesurée ; la hauteur/profondeur sont des ordres de
 * grandeur indicatifs, à confirmer par la R&D avant tout usage.
 */
const XH_SOURCE = "https://www.jst-mfg.com/product/pdf/eng/eXH.pdf";
const XH_PITCH_MM = 2.5;
/** Ordres de grandeur non confirmés — à vérifier avant tout usage réel. */
const XH_UNVERIFIED_HEIGHT_MM = 11.5;
const XH_UNVERIFIED_DEPTH_MM = 6.5;

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
    // Largeur dérivée : 2 positions × 2,5 mm de pas, non relevée sur la fiche.
    width: { valueMm: 2 * XH_PITCH_MM, sourceUrl: XH_SOURCE, sourcePage: 3 },
    height: { valueMm: XH_UNVERIFIED_HEIGHT_MM, sourceUrl: XH_SOURCE, sourcePage: 3 },
    depth: { valueMm: XH_UNVERIFIED_DEPTH_MM, sourceUrl: XH_SOURCE, sourcePage: 3 },
    dimensionsToVerify: true,
  },
  {
    housingMpn: "XHP-3",
    // Largeur dérivée : 3 positions × 2,5 mm de pas, non relevée sur la fiche.
    width: { valueMm: 3 * XH_PITCH_MM, sourceUrl: XH_SOURCE, sourcePage: 3 },
    height: { valueMm: XH_UNVERIFIED_HEIGHT_MM, sourceUrl: XH_SOURCE, sourcePage: 3 },
    depth: { valueMm: XH_UNVERIFIED_DEPTH_MM, sourceUrl: XH_SOURCE, sourcePage: 3 },
    dimensionsToVerify: true,
  },
];

export function geometryByHousingId(housingMpn: string): HousingGeometry | null {
  return HOUSING_GEOMETRY.find((g) => g.housingMpn === housingMpn) ?? null;
}
