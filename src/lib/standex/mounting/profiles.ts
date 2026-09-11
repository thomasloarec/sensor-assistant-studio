import { PUBLISHED_REGISTRY, publishedReference } from "../magnetics/registries";
import type { PublishedRegistry } from "../magnetics/registries";
import type { Provenance } from "../magnetics/types";
import type { Vec3 } from "./geometry";

/** Niveau de preuve d'un profil de montage. `schematic` = gabarit géométrique
 * explicitement schématique : les datums de mesure ne sont PAS caractérisés,
 * donc ce n'est jamais une validation d'un montage importé. */
export type Evidence = "published_typical" | "schematic" | "uncharacterised";

/** Alias contrôlés : identifiant catalogue appairé ↔ identifiant de la table publiée. */
export const MAGNET_ALIASES: Record<string, string> = { "4003004003": "M02", M02: "M02" };
export const magnetAlias = (id: string): string | null => MAGNET_ALIASES[id] ?? null;

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
      evidence: "published_typical",
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
  const magnetId = magnetAlias(magnetModel);
  if (!magnetId) return null;
  return (
    profiles.find(
      (p) =>
        p.sensorFamily === sensorId && p.magnetId === magnetId && p.approachId === approachId,
    ) ?? null
  );
}
/** Distances publiées [enclenchement, relâchement] en mm, ou null. Jamais extrapolées. */
export function thresholdsFor(
  profile: MountingProfile,
  sensitivityClass: string,
  registry?: PublishedRegistry,
): readonly [number, number] | null {
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
