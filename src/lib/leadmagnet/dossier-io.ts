/** Export et reprise d'un dossier de conception.
 *
 * Règles non négociables :
 * - une reprise ne rétablit JAMAIS une autorité : preuve/statut NDA, rôle Standex,
 *   notes internes, revues, offres ou fichiers réputés transmis côté serveur ;
 * - le binaire 3D n'est pas dans le JSON : il est listé pour réimport explicite.
 */
import { z } from "zod";
import { createDossier, type DesignDossier } from "./dossier";
import { EMPTY_CABLING } from "./cabling";
import { parseWorkshopConfig } from "@/lib/standex/magnetic-workshop";
import { isKnownSensorId } from "@/lib/standex/sensor-catalog";
import { DEFAULT_TERMINATION } from "./connectors";

export const EXPORT_FORMAT = "standex-design-dossier";
export const EXPORT_VERSION = 2;

export interface DossierExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  /** Binaires non inclus : à réimporter à la main sur le poste qui reprend le dossier. */
  binariesToReimport: { kind: "glb"; fileName: string; assetKey: string }[];
  dossier: unknown;
}

export function buildDossierExport(
  d: DesignDossier,
  now = new Date().toISOString(),
): DossierExport {
  const { internalNotes: _internal, ...rest } = d;
  void _internal;
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now,
    binariesToReimport: d.workshopAsset
      ? [
          {
            kind: "glb",
            fileName: d.workshopAsset.fileName,
            assetKey: d.workshopAsset.assetKey,
          },
        ]
      : [],
    dossier: {
      ...rest,
      // Une pièce jointe n'est jamais réputée transmise après un aller-retour fichier.
      attachments: d.attachments.map((a) => ({ ...a, transferred: false, storagePath: null })),
    },
  };
}

export const EXPORT_BINARY_NOTICE =
  "Le fichier 3D n'est pas inclus dans ce JSON : il reste sur le poste d'origine. " +
  "Après reprise, réimportez le même GLB pour retrouver le montage.";

const point = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const pose = z
  .object({ cycleT: z.number().finite().min(0).max(1), label: z.string() })
  .nullable();

const cabling = z.object({
  sensorEndpoint: point.nullable().catch(null),
  connectionEndpoint: point.nullable().catch(null),
  waypoints: z.array(point).catch([]),
  statePaths: z
    .array(
      z.object({
        stateId: z.string(),
        label: z.string(),
        points: z.array(point),
        pose: pose.catch(null).default(null),
      }),
    )
    .catch([]),
  declaredMotionStates: z.array(z.object({ id: z.string(), label: z.string() })).catch([]),
  motionCoverageConfirmed: z.boolean().catch(false),
  serviceReserveMm: z.number().finite().min(0).catch(0),
  terminationMm: z.number().finite().min(0).catch(0),
  toleranceMm: z.number().finite().min(0).catch(0),
  surplusHousingMm: z.number().finite().min(0).catch(0),
  minBendRadiusMm: z.number().finite().positive().nullable().catch(null),
  lengthChoice: z
    .enum(["undecided", "standard_to_confirm", "custom_to_confirm"])
    .catch("undecided"),
});

/** Montage : les seules formes connues sont acceptées. Toute autre forme est refusée. */
const mountingSchema = z.union([
  z.object({ kind: z.literal("pcb_smd") }),
  z.object({ kind: z.literal("pcb_through_hole") }),
  z.object({ kind: z.literal("screw") }),
  z.object({ kind: z.literal("press_fit"), holeDiameterMm: z.number().finite().positive() }),
  z.object({ kind: z.literal("other"), description: z.string() }),
  z.object({ kind: z.literal("undecided") }),
]);

/** Volume annuel : discriminant explicite, entier sûr non négatif, jamais arrondi. */
const annualVolumeSchema = z.union([
  z.object({
    kind: z.literal("known"),
    sensorsPerYear: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
  z.object({ kind: z.literal("unknown") }),
]);

const businessSchema = z.object({
  projectPhase: z.enum(["exploration", "design", "prototype", "industrialisation", "unknown"]),
  seriesStartDate: z.string().nullable(),
  samplesNeededBy: z.string().nullable(),
  annualVolume: annualVolumeSchema,
  seriesDurationYears: z.number().finite().nonnegative().nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactCompany: z.string().nullable(),
});

/** Encombrement : une dimension négative ou non finie n'est pas une donnée exploitable. */
const envelopeSchema = z.object({
  lengthMm: z.number().finite().nonnegative().nullable(),
  widthMm: z.number().finite().nonnegative().nullable(),
  heightMm: z.number().finite().nonnegative().nullable(),
});


const connectorSpec = z.object({
  manufacturer: z.string(),
  mpn: z.string(),
  mating: z.string().nullable().catch(null),
  gender: z.enum(["male", "female", "unknown"]).catch("unknown"),
  positions: z.number().int().positive().nullable().catch(null),
  pinout: z.string().nullable().catch(null),
  wireGauge: z.string().nullable().catch(null),
  cable: z.string().nullable().catch(null),
  conditions: z.string().nullable().catch(null),
});

const termination = z.union([
  z.object({ kind: z.literal("bare_leads") }),
  z.object({
    kind: z.literal("unqualified_connector"),
    spec: connectorSpec,
    status: z.literal("to_verify_by_rnd"),
  }),
  z.object({
    kind: z.literal("free_reference"),
    text: z.string(),
    status: z.literal("to_verify_by_rnd"),
  }),
]);

const requirement = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  unit: z.string().nullable().catch(null),
  state: z.enum(["confirmed", "hypothesis", "unknown"]).catch("unknown"),
  source: z.enum(["user", "import", "assistant", "rnd"]).catch("import"),
  note: z.string().optional(),
});

/** Un identifiant inconnu redevient « aucun choix » : le laisser passer ferait
 * retomber l'affichage sur un autre capteur du catalogue. */
const knownSensorId = z
  .string()
  .nullable()
  .catch(null)
  .transform((v) => (v !== null && isKnownSensorId(v) ? v : null));
const dossierSchema = z.object({
  title: z.string().catch("Dossier repris"),
  requirements: z.array(requirement).catch([]),
  // Ces quatre blocs sont validés strictement plus bas, avec un avis explicite si invalides.
  mounting: z.unknown(),
  envelope: z.unknown(),
  workshop: z.unknown(),
  business: z.unknown(),
  workshopSource: z.enum(["none", "example", "user_asset"]).catch("none"),
  selectedSensorId: knownSensorId,
  workshopSensorId: knownSensorId,
  freeConstraints: z.string().catch(""),
  openQuestions: z.array(z.string()).catch([]),
  cabling: cabling.catch(() => EMPTY_CABLING as unknown as z.infer<typeof cabling>),
  termination: termination.catch(() => DEFAULT_TERMINATION as z.infer<typeof termination>),
});


export type DossierImport =
  { ok: true; dossier: DesignDossier; notices: string[] } | { ok: false; reason: string };

/** Reprise d'un fichier exporté : aucune autorité n'est restaurée. */
/** Reprise d'un instantané RÉELLEMENT envoyé au serveur.
 * Le DTO serveur ne contient ni notes internes, ni rôles, ni fichiers : il est
 * validé exactement comme un fichier importé, jamais casté aveuglément.
 */
export function parseServerSnapshot(
  snapshot: unknown,
  now = new Date().toISOString(),
): DossierImport {
  return parseDossierExport(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: now,
      binariesToReimport: [],
      dossier: snapshot,
    },
    now,
  );
}

export function parseDossierExport(raw: unknown, now = new Date().toISOString()): DossierImport {
  const envelope = z
    .object({ format: z.literal(EXPORT_FORMAT), version: z.number(), dossier: z.unknown() })
    .safeParse(raw);
  if (!envelope.success)
    return { ok: false, reason: "Ce fichier n'est pas un export de dossier de conception." };
  if (!Number.isInteger(envelope.data.version) || envelope.data.version > EXPORT_VERSION)
    return {
      ok: false,
      reason:
        "Ce fichier vient d'une version plus récente de l'outil : il n'est pas repris, pour ne rien inventer.",
    };
  const parsed = dossierSchema.safeParse(envelope.data.dossier);
  if (!parsed.success) return { ok: false, reason: "Le contenu de ce fichier est illisible." };
  const data = parsed.data;
  const base = createDossier(now);
  const notices: string[] = [
    "Reprise locale : ni NDA en vigueur, ni rôle Standex, ni revue, ni offre, ni notes internes ne sont rétablis.",
  ];

  // Montage : forme inconnue = remise à « à décider », jamais une donnée inventée.
  const mounting = mountingSchema.safeParse(data.mounting);
  if (!mounting.success)
    notices.push(
      "Le montage mécanique du fichier n'est pas exploitable : il est remis à « à décider ».",
    );

  const env = envelopeSchema.safeParse(data.envelope);
  if (!env.success)
    notices.push(
      "L'encombrement du fichier est invalide (valeur négative ou non numérique) : il est remis à inconnu.",
    );

  const business = businessSchema.safeParse(data.business);
  if (!business.success)
    notices.push(
      "Les informations projet du fichier sont invalides : elles sont remises à inconnu, et un volume inconnu n'est pas zéro.",
    );

  const workshop =
    data.workshop === null || data.workshop === undefined
      ? null
      : parseWorkshopConfig(data.workshop);
  if (data.workshop && !workshop)
    notices.push("Le montage 3D du fichier est invalide : il n'est pas repris.");
  if (workshop && data.workshopSource === "user_asset")
    notices.push("Réimportez le fichier GLB d'origine pour retrouver le montage 3D.");

  const dossier: DesignDossier = {
    ...base,
    title: data.title,
    requirements: data.requirements.length
      ? data.requirements.map((r) => ({
          key: r.key,
          label: r.label,
          value: r.value,
          unit: r.unit,
          state: r.state,
          source: r.source,
          ...(r.note !== undefined ? { note: r.note } : {}),
        }))
      : base.requirements,
    mounting: mounting.success ? mounting.data : base.mounting,
    envelope: env.success ? env.data : base.envelope,
    workshop,
    workshopSource: workshop ? data.workshopSource : "none",
    // Le binaire n'est pas dans le JSON : pas d'ID sans fichier.
    workshopAsset: null,
    selectedSensorId: data.selectedSensorId,
    workshopSensorId: data.workshopSensorId,
    sensorSyncConfirmed: false,
    cabling: { ...EMPTY_CABLING, ...data.cabling },
    termination: data.termination,
    freeConstraints: data.freeConstraints,
    openQuestions: data.openQuestions,
    business: business.success ? business.data : base.business,
    // Autorités volontairement remises à zéro.
    attachments: [],
    internalNotes: [],
  };
  return { ok: true, dossier, notices };

}
