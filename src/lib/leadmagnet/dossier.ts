/** Lead Magnet — dossier vivant partagé entre conversation, atelier 3D et revue.
 * Logique métier pure : aucun accès réseau, aucun stockage, aucune UI ici.
 */
import { isLocale, type Locale, t } from "@/lib/i18n/core";
import type { WorkshopConfig } from "@/lib/standex/magnetic-workshop";
import { EMPTY_CABLING, type CablingConfig } from "./cabling";
import { DEFAULT_TERMINATION, type Termination } from "./connectors";
import { freezeContextKey } from "../standex/design-freeze";

export type RequirementState = "confirmed" | "hypothesis" | "unknown";
export type RequirementSource = "user" | "import" | "assistant" | "rnd";

export interface Requirement {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  state: RequirementState;
  source: RequirementSource;
  note?: string;
}

/** Choix mécaniques explicites : jamais déduits d'une application. */
export type MountingChoice =
  | { kind: "pcb_smd" }
  | { kind: "pcb_through_hole" }
  | { kind: "screw" }
  | { kind: "press_fit"; holeDiameterMm: number }
  | { kind: "other"; description: string }
  | { kind: "undecided" };

export interface EnvelopeMm {
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
}

export type AnnualVolume = { kind: "known"; sensorsPerYear: number } | { kind: "unknown" };

export interface BusinessMeta {
  projectPhase: "exploration" | "design" | "prototype" | "industrialisation" | "unknown";
  seriesStartDate: string | null;
  samplesNeededBy: string | null;
  annualVolume: AnnualVolume;
  seriesDurationYears: number | null;
  contactName: string | null;
  contactEmail: string | null;
  contactCompany: string | null;
}

export interface Attachment {
  id: string;
  fileName: string;
  bytes: number;
  /** Une pièce jointe locale n'est transmise que lorsque le transfert a réussi. */
  transferred: boolean;
  storagePath: string | null;
  /** Empreinte SHA-256 des octets réellement relus puis déposés. */
  sha256: string | null;
  /** Type déclaré au préflight, contrôlé par le serveur. */
  mimeType?: string | null;
}


export type StorageMode = "memory" | "local-device";

export interface DesignDossier {
  /** Local technical study travels inside the existing revision DTO. No signature authority. */
  studioV2?: import("../standex/studio-dossier").StudioStudy | null;
  designFreeze?: import("../standex/design-freeze").DesignFreeze | null;
  id: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  storage: StorageMode;
  title: string;
  /** Langue dans laquelle le projet a réellement démarré.
   * Elle est capturée au démarrage effectif du projet, jamais au montage caché
   * de l'espace, et n'est plus modifiée si l'utilisateur change la langue de
   * l'interface ensuite. Les textes saisis restent dans leur langue d'origine.
   */
  sourceLocale: Locale;
  requirements: Requirement[];
  mounting: MountingChoice;
  envelope: EnvelopeMm;
  workshop: WorkshopConfig | null;
  /** Provenance explicite du montage 3D : jamais déduite de la présence d'un montage. */
  workshopSource: "none" | "example" | "user_asset";
  /** Ressource 3D réellement rattachée (clé locale + provenance), sans fichier fantôme. */
  workshopAsset: { assetKey: string; fileName: string; storage: StorageMode } | null;
  /** Gamme suivie (ce n'est PAS une référence commandable). */
  selectedSensorId: string | null;
  /** Le capteur affiché dans l'atelier ne suit la gamme choisie qu'après confirmation. */
  workshopSensorId: string | null;
  sensorSyncConfirmed: boolean;
  cabling: CablingConfig;
  termination: Termination;
  freeConstraints: string;
  openQuestions: string[];
  attachments: Attachment[];
  business: BusinessMeta;
  /** Notes Standex internes : jamais exportées vers le client. */
  internalNotes: { id: string; author: string; createdAt: string; body: string }[];
}

export const REQUIREMENT_ORDER = [
  "detection_goal",
  "states_motion",
  "mounting",
  "envelope",
  "electrical",
  "environment",
] as const;

export const REQUIREMENT_LABELS: Record<string, string> = {
  detection_goal: "Objectif de détection",
  states_motion: "États et mouvements à distinguer",
  mounting: "Montage mécanique",
  envelope: "Encombrement disponible",
  electrical: "Contraintes électriques",
  environment: "Environnement",
};

let counter = 0;
const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

export function createDossier(
  now = new Date().toISOString(),
  sourceLocale: Locale = "fr",
): DesignDossier {
  return {
    id: newId("dossier"),
    createdAt: now,
    updatedAt: now,
    revision: 1,
    storage: "memory",
    // Le titre par défaut est rédigé dans la langue de départ du projet.
    title: t("Nouveau projet d'exploration", isLocale(sourceLocale) ? sourceLocale : "fr"),
    sourceLocale: isLocale(sourceLocale) ? sourceLocale : "fr",
    requirements: REQUIREMENT_ORDER.map((key) => ({
      key,
      label: REQUIREMENT_LABELS[key]!,
      value: "",
      unit: null,
      state: "unknown" as const,
      source: "user" as const,
    })),
    mounting: { kind: "undecided" },
    envelope: { lengthMm: null, widthMm: null, heightMm: null },
    workshop: null,
    workshopSource: "none",
    workshopAsset: null,
    selectedSensorId: null,
    workshopSensorId: null,
    sensorSyncConfirmed: false,
    cabling: EMPTY_CABLING,
    termination: DEFAULT_TERMINATION,
    freeConstraints: "",
    openQuestions: [],
    attachments: [],
    business: {
      projectPhase: "exploration",
      seriesStartDate: null,
      samplesNeededBy: null,
      annualVolume: { kind: "unknown" },
      seriesDurationYears: null,
      contactName: null,
      contactEmail: null,
      contactCompany: null,
    },
    internalNotes: [],
  };
}

export function requirement(d: DesignDossier, key: string): Requirement | null {
  return d.requirements.find((r) => r.key === key) ?? null;
}

/** Toute extraction automatique reste une hypothèse à confirmer. */
export function proposeRequirement(
  d: DesignDossier,
  key: string,
  patch: { value: string; unit?: string | null; source: RequirementSource; note?: string },
): DesignDossier {
  const state: RequirementState =
    patch.source === "user" ? (patch.value.trim() ? "confirmed" : "unknown") : "hypothesis";
  return setRequirement(d, key, { ...patch, state });
}

export function setRequirement(
  d: DesignDossier,
  key: string,
  patch: Partial<Requirement> & { value: string; source: RequirementSource },
): DesignDossier {
  const existing = requirement(d, key);
  const next: Requirement = {
    key,
    label: patch.label ?? existing?.label ?? REQUIREMENT_LABELS[key] ?? key,
    value: patch.value,
    unit: patch.unit ?? existing?.unit ?? null,
    state: patch.state ?? "hypothesis",
    source: patch.source,
    ...(patch.note !== undefined ? { note: patch.note } : {}),
  };
  if (!patch.value.trim()) next.state = "unknown";
  const requirements = existing
    ? d.requirements.map((r) => (r.key === key ? next : r))
    : [...d.requirements, next];
  return { ...d, requirements, updatedAt: new Date().toISOString() };
}

/** Confirmation explicite par l'utilisateur : seule voie vers `confirmed`. */
export function confirmRequirement(d: DesignDossier, key: string): DesignDossier {
  const existing = requirement(d, key);
  if (!existing || !existing.value.trim()) return d;
  return {
    ...d,
    requirements: d.requirements.map((r) =>
      r.key === key ? { ...r, state: "confirmed", source: "user" } : r,
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function confirmedRequirements(d: DesignDossier): Requirement[] {
  return d.requirements.filter((r) => r.state === "confirmed");
}
export function assumptions(d: DesignDossier): Requirement[] {
  return d.requirements.filter((r) => r.state === "hypothesis");
}
export function unknowns(d: DesignDossier): Requirement[] {
  return d.requirements.filter((r) => r.state === "unknown");
}

/** Un changement technique crée une révision (et périme revues/offres/échantillons). */
export function bumpRevision(d: DesignDossier): DesignDossier {
  return { ...d, revision: d.revision + 1, updatedAt: new Date().toISOString() };
}

export function parseAnnualVolume(raw: string): AnnualVolume | { error: string } {
  const value = raw.trim().toLowerCase();
  if (!value || value === "inconnu" || value === "unknown") return { kind: "unknown" };
  if (!/^\d+$/.test(value)) return { error: "Saisissez un nombre entier de capteurs par an." };
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) return { error: "Volume annuel invalide." };
  return { kind: "known", sensorsPerYear: n };
}

/** DTO client : les notes internes Standex ne sortent jamais d'ici. */
export type ClientDossierDto = Omit<DesignDossier, "internalNotes">;
export function toClientDto(d: DesignDossier): ClientDossierDto {
  const clone = { ...d };
  if (clone.designFreeze && clone.designFreeze.contextKey !== freezeContextKey(clone.workshop, clone.studioV2)) clone.designFreeze = null;
  delete (clone as Partial<DesignDossier>).internalNotes;
  return clone as ClientDossierDto;
}

/** Écriture décimale EXACTE d'un nombre, sans notation exponentielle.
 *
 * PostgreSQL développe `1e-7` en `0.0000001` quand il rend un `jsonb` en texte,
 * alors que JavaScript écrit `1e-7`. Le hash calculé ici et celui recalculé par
 * le serveur divergeaient donc dès qu'une coordonnée très petite (résidu normal
 * d'une rotation 3D) ou très grande apparaissait, et la soumission d'un vrai
 * montage d'atelier était refusée. On développe ici la même écriture que
 * PostgreSQL : aucun arrondi, aucun chiffre ajouté ou retiré, seule la notation
 * change. Le serveur reste l'autorité et le contrôle du hash reste actif.
 */
function plainNumber(n: number): string {
  if (!Number.isFinite(n)) return "null";
  const s = String(n);
  const m = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/i.exec(s);
  if (!m) return s;
  const [, sign, intPart, fracPart = "", expPart] = m;
  const digits = (intPart as string) + fracPart;
  const point = (intPart as string).length + Number(expPart);
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "number") return plainNumber(value);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}


export async function dossierHash(dto: ClientDossierDto): Promise<string> {
  const payload = stableStringify({ ...dto, updatedAt: undefined });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export { stableStringify, newId };
