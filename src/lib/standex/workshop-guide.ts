import { guideSelectionFor, hasGuideData, type GuideRange } from "./activation-guide";
import type { WorkshopConfig } from "./magnetic-workshop";
import { documentedMagnetAngleDeg } from "./mounting/profiles";
import {
  effectivePublishedRegistry,
  nominalSensitivityRowsFor,
  type PublishedApproach,
} from "./magnetics/registries";

/** Read the exact guide row actually SELECTED: variant stored in the project and
 *  approach actually drawn. No implicit fall back to the first printed row: when
 *  the stored variant publishes nothing for this approach, there is no range. */
export function workshopGuideRange(c: WorkshopConfig): GuideRange | null {
  if (!c.guideReference) return null;
  const selection = guideSelectionFor(c.sensorId, c.magnetModel, c.geometry, c.guideReference);
  return selection && selection.reference === c.guideReference ? selection.range : null;
}


/** Pose only: temperature and nearby metal are separate application conditions. */
export function onDocumentedPosition(c: WorkshopConfig): boolean {
  return c.machine === null && c.motion === "approach" && c.lateralShift === 0 &&
    c.magnetTilt === 0 && c.sensorAngle === 0 &&
    (c.magnetAngle - documentedMagnetAngleDeg(c.geometry, c.sensorId)) % 360 === 0 &&
    c.magnetization === "axial" && c.polarity === 1;
}

// i18n-canonical: translated at display/export time.
export const GUIDE_SIMULATION_NOTE = "Animation fondée sur la plage du guide Standex. Les colonnes « up » et « to » ne définissent pas à elles seules les seuils de fermeture et de réouverture de votre montage.";

/** Message générique, réservé aux capteurs que la brochure documente : la plage
 *  existe mais la position choisie n'est pas celle du guide. */
export const ILLUSTRATIVE_NOTE =
  "Simulation illustrative — distance non caractérisée, à valider par essais";

/** Message NOMMÉ quand le guide intégré ne publie rien pour cette famille : la
 *  fiche produit du capteur existe, mais les distances de CE couple ne sont pas
 *  publiées. Aucune plage d'une autre famille n'est transférée, et rien ne
 *  suggère que la position ait été modifiée. */
export const GUIDE_UNPUBLISHED_NOTE =
  "Fiche produit disponible pour ce capteur, mais les distances de ce couple ne sont pas publiées dans le guide d'activation intégré (édition 10/2025). La simulation reste illustrative, à valider par essais avec Standex.";

/** Mention honnête à afficher pour une simulation illustrative. */
export function illustrativeNoteFor(c: WorkshopConfig): string {
  return hasGuideData(c.sensorId) ? ILLUSTRATIVE_NOTE : GUIDE_UNPUBLISHED_NOTE;
}

/** Note du récapitulatif d'essai : quand la ligne du guide est enregistrée, on
 *  rappelle la prudence réelle (bornes « up »/« to » ≠ seuils du montage)
 *  plutôt que « distance non caractérisée », qui contredirait la plage. */
export function reviewIllustrativeNote(sensorId: string, hasGuideFact: boolean): string {
  return hasGuideFact ? GUIDE_SIMULATION_NOTE : hasGuideData(sensorId) ? ILLUSTRATIVE_NOTE : GUIDE_UNPUBLISHED_NOTE;
}

/** Source RÉELLE de la commutation illustrative, identifiable à l'écran et dans
 *  le résumé :
 *  - `nominal` : ligne NOMINALE (typique) publiée de la classe choisie, pour ce
 *    couple et cette approche — fermeture / réouverture de la ligne, sans
 *    interpolation ni classe inventée ;
 *  - `guide` : plage du guide explicitement choisie (repères de lecture
 *    « up »/« to », jamais des seuils) ;
 *  - `none` : aucune donnée exploitable → repli générique 15 / 18 mm, et la
 *    sensibilité ne change rien à la scène.
 *  Dans tous les cas : couverture, qualification et verdict restent non validés
 *  pour une machine importée. */
export type IllustrationSource =
  | {
      kind: "nominal";
      bounds: { nearMm: number; farMm: number };
      sensitivityClass: string;
      sensorReference: string;
      approach: string;
      rowId: string;
      sourceRef: string;
    }
  | { kind: "guide"; bounds: { nearMm: number; farMm: number }; reference: string }
  | { kind: "none"; bounds: null };

export function illustrationSourceFor(
  c: WorkshopConfig,
  guideMarks: { nearMm: number; farMm: number } | null,
  guideReference: string | null,
  registry = effectivePublishedRegistry(),
): IllustrationSource {
  const row = c.sensitivity
    ? nominalSensitivityRowsFor(c.sensorId, c.magnetModel, c.geometry as PublishedApproach, registry).find(
        (r) => r.sensitivityClass === c.sensitivity,
      )
    : undefined;
  if (
    row &&
    Number.isFinite(row.pullInMm) &&
    Number.isFinite(row.dropOutMm) &&
    row.pullInMm > 0 &&
    row.dropOutMm > row.pullInMm
  )
    return {
      kind: "nominal",
      bounds: { nearMm: row.pullInMm, farMm: row.dropOutMm },
      sensitivityClass: row.sensitivityClass,
      sensorReference: row.sensorReference,
      approach: row.approachId,
      rowId: row.id,
      sourceRef: row.provenance?.sourceRef ?? "",
    };
  if (guideMarks && guideReference) return { kind: "guide", bounds: guideMarks, reference: guideReference };
  return { kind: "none", bounds: null };
}
