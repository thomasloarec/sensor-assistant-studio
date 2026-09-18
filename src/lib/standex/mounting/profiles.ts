import { transverseApproach } from "../housing-pose";
import { isShapeIncompatible } from "../shape-compatibility";
import {
  effectivePublishedRegistry,
  publishedMagnetFamily,
  publishedReference,
  publishedRegistryRevision,
  registryRevisionLabel,
} from "../magnetics/registries";
import type { PublishedRegistry } from "../magnetics/registries";
import type { Provenance } from "../magnetics/types";
import type { Vec3 } from "./geometry";

/** Niveau de preuve d'un profil de montage. `schematic` = gabarit géométrique
 * explicitement schématique : les datums de mesure ne sont PAS caractérisés,
 * donc ce n'est jamais une validation d'un montage importé. */
export type Evidence = "published_typical" | "schematic" | "uncharacterised";

/**
 * Qualification d'une distance publiée.
 *
 * La qualification porte sur le COUPLE complet réellement saisi au registre :
 * famille, référence de variante, classe de sensibilité, aimant, approche et
 * source. Une ligne présente au registre publié provient d'un tableau explicite
 * « Max Pull-in / Min Drop-out » ; ce n'est pas une valeur fictive et elle n'est
 * pas effacée au prétexte qu'aucune calibration physique n'existe.
 *
 * À ne pas confondre avec les nouvelles colonnes « up / to » de la brochure,
 * encore en attente de qualification Standex : celles-là ne sont pas au registre
 * et n'alimentent donc rien.
 *
 * Aucun seuil n'est jamais emprunté à un autre capteur ou à un autre aimant :
 * l'identité (famille, aimant, approche, classe) est exacte.
 */
export const sourceQualified = (
  sensorFamily: string,
  sensitivityClass: string,
  magnetId: string,
  approachId: string,
  registry?: PublishedRegistry,
): boolean =>
  publishedReference(sensorFamily, sensitivityClass, magnetId, approachId, registry) !== null;
/** Existe-t-il au moins une ligne publiée pour cette famille et cette approche ? */
export const approachQualified = (
  sensorFamily: string,
  approachId: string,
  registry: PublishedRegistry = effectivePublishedRegistry(),
): boolean =>
  registry.rows.some((r) => r.sensorFamily === sensorFamily && r.approachId === approachId);


/**
 * Localisation géométrique de l'approche dans le repère capteur.
 * `axis_documented` : la source publiée donne un axe d'approche exploitable
 * comme gabarit SCHÉMATIQUE (datums non caractérisés).
 * `not_located` : l'approche existe dans le registre et ses DISTANCES sont
 * documentées, mais aucune trajectoire ni pose n'est définie (D2 et lobes
 * latéraux notamment). Ces lignes ne produisent jamais de volume de détection
 * ni de verdict géométrique ; elles restent lisibles comme documentation.
 */
export type Localisation = "axis_documented" | "not_located";

export interface MountingProfile {
  id: string;
  sensorFamily: string;
  /** Identifiant de table publiée, après résolution d'alias. */
  magnetId: string;
  approachId: string;
  classes: string[];
  /** Axe d'approche dans le repère capteur, unitaire, ou null si non localisé. */
  axis: Vec3 | null;
  /** Plan de référence du gabarit, pour l'affichage, ou null si non localisé. */
  referencePlane: "XZ" | "YZ" | null;
  /** Orientation relative documentée de l'aimant (0 en latéral, 180° en frontal). */
  relativeRotationDeg: Vec3;
  localisation: Localisation;
  /** Les distances publiées existent pour toute ligne présente au registre. */
  distancesDocumented: true;
  evidence: Evidence;
  /** Le gabarit reste schématique tant que les datums ne sont pas caractérisés. */
  geometry: "schematic" | "characterised";
  datumCharacterised: false;
  revision: string;
  provenance: Provenance;
}
/** Profil dont l'axe est défini : seul cas où une géométrie 3D est calculable. */
export type LocatedProfile = MountingProfile & { axis: Vec3; referencePlane: "XZ" | "YZ" };
export const locatedProfile = (p: MountingProfile | null): LocatedProfile | null =>
  p && p.axis && p.referencePlane ? (p as LocatedProfile) : null;

/**
 * Orientation RELATIVE documentée de l'aimant dans le repère capteur, par
 * approche. Les approches latérales D1 et D3 placent les deux corps parallèles
 * et orientés dans le même sens : rotation nulle. L'approche FRONTALE F1 des
 * fiches MK36/MK37/MK38 met les deux collerettes EN VIS-À-VIS : le boîtier
 * capteur porte sa collerette vers +X, donc un aimant placé en +X ne peut lui
 * faire face qu'en tournant de 180° autour de Y. Ce n'est pas une tolérance
 * choisie : c'est le dessin de la page 2 des fiches.
 */
const APPROACH_RELATIVE_ROTATION: Record<string, Vec3> = {
  D1: [0, 0, 0],
  D3: [0, 0, 0],
  F1: [0, 180, 0],
};
/** Orientation relative documentée d'une approche. Les approches sans dessin de
 * pose retombent sur des axes parallèles, jamais sur une rotation inventée. */
export const documentedRelativeRotation = (approachId: string, sensorId = ""): Vec3 =>
  [...(transverseApproach(approachId, sensorId) ? [0, 0, 0] : APPROACH_RELATIVE_ROTATION[approachId] ?? [0, 0, 0])] as Vec3;
/** Angle de l'aimant, en degrés autour de Y, imposé par l'approche documentée. */
export const documentedMagnetAngleDeg = (approachId: string, sensorId = ""): number =>
  documentedRelativeRotation(approachId, sensorId)[1];

const AXES: Record<string, { axis: Vec3; plane: "XZ" | "YZ" }> = {
  D1: { axis: [0, 0, 1], plane: "XZ" },
  D3: { axis: [1, 0, 0], plane: "YZ" },
  // Approche FRONTALE des fiches MK36/MK37/MK38 : les deux collerettes se font
  // face, l'approche suit l'axe longitudinal des cylindres. La distance publiée
  // est mesurée entre les FACES ; la conversion vers un écart entre centres est
  // faite par `approachOffset`, jamais en reclassant la ligne en D1 ou D3.
  F1: { axis: [1, 0, 0], plane: "YZ" },
};

export function mountingProfiles(registry: PublishedRegistry = effectivePublishedRegistry()) {
  const byKey = new Map<string, MountingProfile>();
  for (const row of registry.rows) {
    /* Couple de FORMES incompatibles au sens de la règle d'application : aucun
       profil n'est produit, donc aucune géométrie ni aucun seuil. La ligne reste
       lisible dans l'annuaire des données de détection, marquée exclue. */
    if (isShapeIncompatible(row.sensorFamily, row.magnetId)) continue;
    // Toutes les autres lignes du registre sont représentées : familles, classes
    // et approches. L'absence d'axe documenté ne supprime pas la ligne, elle la
    // marque comme non localisée.
    const geo = AXES[row.approachId] ?? null;
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
      axis: geo ? geo.axis : null,
      referencePlane: geo ? geo.plane : null,
      relativeRotationDeg: documentedRelativeRotation(row.approachId),
      localisation: geo ? "axis_documented" : "not_located",
      distancesDocumented: true,
      evidence:
        geo && approachQualified(row.sensorFamily, row.approachId)
          ? "published_typical"
          : "uncharacterised",
      geometry: "schematic",
      datumCharacterised: false,
      revision: registryRevisionLabel(registry),
      provenance: row.provenance,
    });
  }
  for (const p of byKey.values()) p.classes.sort();
  return [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id));
}
/* Profils EFFECTIFS : reconstruits dès que le jeu de distances change (saisie
   Standex appliquée, retour au jeu compilé). Un tableau figé au chargement du
   module empêcherait une combinaison fraîchement complétée — MK22, MK26… —
   d'obtenir un profil, donc toute détection. Le cache est indexé sur la
   révision du registre : jamais servi périmé. */
let profileCache: { revision: number; profiles: MountingProfile[] } | null = null;
export function currentMountingProfiles(): MountingProfile[] {
  const revision = publishedRegistryRevision();
  if (profileCache === null || profileCache.revision !== revision)
    profileCache = { revision, profiles: mountingProfiles() };
  return profileCache.profiles;
}

export function profileFor(
  sensorId: string,
  magnetModel: string,
  approachId: string,
  profiles: MountingProfile[] = currentMountingProfiles(),
): MountingProfile | null {
  // Identité exacte, à une seule exception documentée : les variantes d'une même
  // famille d'aimant publiée (M21P/1 et M21P/2 pour la famille « M21/P(1,2) »)
  // lisent la ligne de leur famille. Ce n'est PAS un repli d'un aimant vers un
  // autre : la fiche désigne explicitement la même famille. L'identifiant réel
  // du couple et le boîtier rendu ne sont pas modifiés ici.
  const family = publishedMagnetFamily(magnetModel);
  return (
    profiles.find(
      (p) =>
        p.sensorFamily === sensorId &&
        publishedMagnetFamily(p.magnetId) === family &&
        p.approachId === approachId,
    ) ?? null
  );
}
/** Distances publiées [enclenchement, relâchement] en mm, ou null. Jamais extrapolées.
 * La ligne du registre EST la qualification ; seule la localisation de l'approche
 * conditionne encore l'usage géométrique. */
export function thresholdsFor(
  profile: MountingProfile,
  sensitivityClass: string,
  registry?: PublishedRegistry,
): readonly [number, number] | null {
  // Une distance documentée ne devient un seuil géométrique que si l'approche
  // possède un axe : sinon elle reste une lecture documentaire.
  if (profile.localisation !== "axis_documented") return null;
  // Deuxième verrou de la règle de forme : même un profil transmis directement
  // ne peut pas produire de seuil sur un couple de formes incompatibles.
  if (isShapeIncompatible(profile.sensorFamily, profile.magnetId)) return null;
  const row = publishedReference(
    profile.sensorFamily,
    sensitivityClass,
    profile.magnetId,
    profile.approachId,
    registry,
  );
  if (!row) return null;
  // Le moteur ne modélise QUE le contact normalement ouvert. Les modèles 1B et
  // 1C publiés par les fiches restent lisibles comme documentation
  // (`documentedDistances`), mais ils n'alimentent aucun seuil simulé.
  if (row.contactForm !== "1A") return null;
  return [row.pullInMm, row.dropOutMm];
}
/** Le contact publié de cette ligne est-il celui que le moteur modélise (1A) ? */
export function simulatedContactForm(
  profile: MountingProfile,
  sensitivityClass: string,
  registry?: PublishedRegistry,
): boolean {
  const row = publishedReference(
    profile.sensorFamily,
    sensitivityClass,
    profile.magnetId,
    profile.approachId,
    registry,
  );
  return row === null || row.contactForm === "1A";
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

export interface DocumentedDistance {
  sensitivityClass: string;
  pullInMm: number;
  dropOutMm: number;
  sourceRef: string;
  /** Vrai seulement si l'approche est localisée : la distance est documentée
   * dans tous les cas, mais D2/D4/D5 ne fournissent aucune trajectoire. */
  usableForGeometry: boolean;
  localisation: Localisation;
}
/**
 * Lecture DOCUMENTAIRE du registre : toutes les classes publiées d'un profil,
 * quelles que soient la famille et l'approche (D1 à D5, lobes compris). Ces
 * valeurs sont des distances lues dans la source ; elles ne constituent ni une
 * trajectoire, ni une pose, ni un volume de détection quand l'approche n'est
 * pas localisée. Le calcul géométrique passe par `thresholdsFor`, jamais ici.
 */
export function documentedDistances(
  profile: MountingProfile,
  registry?: PublishedRegistry,
): DocumentedDistance[] {
  const usable = profile.localisation === "axis_documented";

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
            usableForGeometry: usable,
            localisation: profile.localisation,
          }
        : null;
    })
    .filter((x): x is DocumentedDistance => x !== null)
    .sort((a, b) => b.pullInMm - a.pullInMm);
}
export interface RegistryCoverage {
  revision: string;
  rows: number;
  families: string[];
  approaches: string[];
  magnets: string[];
  classes: string[];
  profiles: number;
  /** Profils dont l'axe d'approche est documenté (gabarit schématique). */
  locatedProfiles: number;
  /** Profils documentaires sans trajectoire ni pose définie. */
  unlocatedProfiles: number;
  /** Profils alimentant réellement le calcul géométrique. */
  calculableProfiles: number;
}
/** État réel de la couverture du registre : aucune restriction aux exemples MK03. */
export function registryCoverage(
  registry: PublishedRegistry = effectivePublishedRegistry(),
  profiles: MountingProfile[] = mountingProfiles(registry),
): RegistryCoverage {
  const uniq = (v: string[]) => [...new Set(v)].sort();
  return {
    revision: registryRevisionLabel(registry),
    rows: registry.rows.length,
    families: uniq(registry.rows.map((r) => r.sensorFamily)),
    approaches: uniq(registry.rows.map((r) => r.approachId)),
    magnets: uniq(registry.rows.map((r) => r.magnetId)),
    classes: uniq(registry.rows.map((r) => r.sensitivityClass)),
    profiles: profiles.length,
    locatedProfiles: profiles.filter((p) => p.localisation === "axis_documented").length,
    unlocatedProfiles: profiles.filter((p) => p.localisation === "not_located").length,
    calculableProfiles: profiles.filter(
      (p) => p.localisation === "axis_documented" && p.evidence === "published_typical",
    ).length,
  };
}
