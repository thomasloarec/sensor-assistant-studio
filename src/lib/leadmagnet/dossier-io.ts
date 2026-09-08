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

const cabling = z.object({
  sensorEndpoint: point.nullable().catch(null),
  connectionEndpoint: point.nullable().catch(null),
  waypoints: z.array(point).catch([]),
  statePaths: z
    .array(z.object({ stateId: z.string(), label: z.string(), points: z.array(point) }))
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

const dossierSchema = z.object({
  title: z.string().catch("Dossier repris"),
  requirements: z.array(requirement).catch([]),
  mounting: z.unknown().catch(null),
  envelope: z
    .object({
      lengthMm: z.number().finite().nullable().catch(null),
      widthMm: z.number().finite().nullable().catch(null),
      heightMm: z.number().finite().nullable().catch(null),
    })
    .catch({ lengthMm: null, widthMm: null, heightMm: null }),
  workshop: z.unknown().catch(null),
  workshopSource: z.enum(["none", "example", "user_asset"]).catch("none"),
  selectedSensorId: z.string().nullable().catch(null),
  workshopSensorId: z.string().nullable().catch(null),
  freeConstraints: z.string().catch(""),
  openQuestions: z.array(z.string()).catch([]),
  cabling: cabling.catch(EMPTY_CABLING),
  termination: termination.catch(() => DEFAULT_TERMINATION),
  business: z.unknown().catch(null),
});

export type DossierImport =
  | { ok: true; dossier: DesignDossier; notices: string[] }
  | { ok: false; reason: string };

/** Reprise d'un fichier exporté : aucune autorité n'est restaurée. */
export function parseDossierExport(raw: unknown, now = new Date().toISOString()): DossierImport {
  const envelope = z
    .object({ format: z.literal(EXPORT_FORMAT), version: z.number(), dossier: z.unknown() })
    .safeParse(raw);
  if (!envelope.success)
    return { ok: false, reason: "Ce fichier n'est pas un export de dossier de conception." };
  const parsed = dossierSchema.safeParse(envelope.data.dossier);
  if (!parsed.success) return { ok: false, reason: "Le contenu de ce fichier est illisible." };
  const data = parsed.data;
  const base = createDossier(now);
  const notices: string[] = [
    "Reprise locale : ni NDA en vigueur, ni rôle Standex, ni revue, ni offre, ni notes internes ne sont rétablis.",
  ];
  if (data.workshopSource === "user_asset")
    notices.push("Réimportez le fichier GLB d'origine pour retrouver le montage 3D.");

  const mounting = base.mounting;
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
    mounting:
      data.mounting && typeof data.mounting === "object" && "kind" in data.mounting
        ? (data.mounting as DesignDossier["mounting"])
        : mounting,
    envelope: data.envelope,
    workshop: (data.workshop as DesignDossier["workshop"]) ?? null,
    workshopSource: data.workshop ? data.workshopSource : "none",
    // Le binaire n'est pas dans le JSON : pas d'ID sans fichier.
    workshopAsset: null,
    selectedSensorId: data.selectedSensorId,
    workshopSensorId: data.workshopSensorId,
    sensorSyncConfirmed: false,
    cabling: { ...EMPTY_CABLING, ...data.cabling },
    termination: data.termination,
    freeConstraints: data.freeConstraints,
    openQuestions: data.openQuestions,
    business:
      data.business && typeof data.business === "object"
        ? { ...base.business, ...(data.business as Partial<DesignDossier["business"]>) }
        : base.business,
    // Autorités volontairement remises à zéro.
    attachments: [],
    internalNotes: [],
  };
  return { ok: true, dossier, notices };
}
