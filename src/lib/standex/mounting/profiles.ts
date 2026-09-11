import { PUBLISHED_REGISTRY, publishedReference } from "../magnetics/registries";
import type { PublishedRegistry } from "../magnetics/registries";
import type { Provenance } from "../magnetics/types";
import type { Vec3 } from "./geometry";

/** Niveau de preuve d'un profil de montage. `schematic` = gabarit géométrique
 * explicitement schématique : les datums de mesure ne sont PAS caractérisés,
 * donc ce n'est jamais une validation d'un montage importé. */
export type Evidence = "published_typical" | "schematic" | "uncharacterised";

/**
 * Couples (famille, approche) dont la lecture des colonnes « up / to » de la
 * source publiée est confirmée par docs/studio-v2/RAPPORT_CALIBRATION_MK03_2026-09-10.md.
 * Toute autre ligne du registre reste représentable mais ne fournit AUCUN seuil
 * au calcul : la qualification Standex des tables up/to est encore ouverte
 * (docs/STUDIO_V2_FEEDBACK_V2.md). Aucun alias entre identifiants d'aimants :
 * 4003004003 (cylindre Ø 4 × 19) et M02 (boîtier) sont deux lignes distinctes.
 */
export const QUALIFIED_APPROACHES: Readonly<Record<string, readonly string[]>> = {
  MK03: ["D1", "D3"],
};
export const approachQualified = (sensorFamily: string, approachId: string): boolean =>
  (QUALIFIED_APPROACHES[sensorFamily] ?? []).includes(approachId);

export interface MountingProfile {
  id: string;
  sensorFamily: string;
  /** Identifiant de table publiée, après résolution d'alias. */
  magnetId: string;
  approachId: string;
  classes: string[];
  /** Axe d'approche dans le repère capteur, unitaire. */
  axis: Vec3;
  /** Plan de référence du gabarit, pour l'affichage. */
  referencePlane: "XZ" | "YZ";
  evidence: Evidence;
  /** Le gabarit reste schématique tant que les datums ne sont pas caractérisés. */
  geometry: "schematic" | "characterised";
  datumCharacterised: false;
  revision: string;
  provenance: Provenance;
}
const AXES: Record<string, { axis: Vec3; plane: "XZ" | "YZ" }> = {
  D1: { axis: [0, 0, 1], plane: "XZ" },
  D3: { axis: [1, 0, 0], plane: "YZ" },
};
export function mountingProfiles(registry: PublishedRegistry = PUBLISHED_REGISTRY) {
  const byKey = new Map<string, MountingProfile>();
  for (const row of registry.rows) {
    const geo = AXES[row.approachId];
    if (!geo) continue;
    const id = [row.sensorFamily, row.magnetId, row.approachId].join("/");
    const existing = byKey.get(id);
    if (existing) {
      if (!existing.classes.includes(row.sensitivityClass))
        existing.classes.push(row.sensitivityClass);
      continue;
    }
    byKey.set(id, {
      id,
      sensorFamily: row.sensorFamily,
      magnetId: row.magnetId,
      approachId: row.approachId,
      classes: [row.sensitivityClass],
      axis: geo.axis,
      referencePlane: geo.plane,
      evidence: approachQualified(row.sensorFamily, row.approachId)
        ? "published_typical"
        : "uncharacterised",
      geometry: "schematic",
      datumCharacterised: false,
      revision: registry.version,
      provenance: row.provenance,
    });
  }
  for (const p of byKey.values()) p.classes.sort();
  return [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id));
}
export const PROFILES = mountingProfiles();

export function profileFor(
  sensorId: string,
  magnetModel: string,
  approachId: string,
  profiles: MountingProfile[] = PROFILES,
): MountingProfile | null {
  // Identité exacte : aucun repli d'un identifiant d'aimant vers un autre.
  return (
    profiles.find(
      (p) =>
        p.sensorFamily === sensorId && p.magnetId === magnetModel && p.approachId === approachId,
    ) ?? null
  );
}
/** Distances publiées [enclenchement, relâchement] en mm, ou null. Jamais extrapolées.
 * Refus net tant que la lecture up/to de la table n'est pas qualifiée. */
export function thresholdsFor(
  profile: MountingProfile,
  sensitivityClass: string,
  registry?: PublishedRegistry,
): readonly [number, number] | null {
  if (!approachQualified(profile.sensorFamily, profile.approachId)) return null;
  const row = publishedReference(
    profile.sensorFamily,
    sensitivityClass,
    profile.magnetId,
    profile.approachId,
    registry,
  );
  return row ? [row.pullInMm, row.dropOutMm] : null;
}
/** Comparaison des sensibilités pour un profil : sources concrètes uniquement. */
export function sensitivityComparison(
  profile: MountingProfile,
  registry?: PublishedRegistry,
): { sensitivityClass: string; pullInMm: number; dropOutMm: number; sourceRef: string }[] {
  if (!approachQualified(profile.sensorFamily, profile.approachId)) return [];
  return profile.classes
    .map((sensitivityClass) => {
      const row = publishedReference(
        profile.sensorFamily,
        sensitivityClass,
        profile.magnetId,
        profile.approachId,
        registry,
      );
      return row
        ? {
            sensitivityClass,
            pullInMm: row.pullInMm,
            dropOutMm: row.dropOutMm,
            sourceRef: row.provenance.sourceRef,
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.pullInMm - a.pullInMm);
}
