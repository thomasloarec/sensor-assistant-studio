/** Soumission : instantané immuable, statut réel uniquement après succès backend. */
import { dossierHash, toClientDto, type ClientDossierDto, type DesignDossier } from "./dossier";
import type { ConsentBinding, ConsentRecord } from "./privacy";
import { INITIAL_PRIVACY, hasBoundConsent } from "./privacy";
import type { NdaState } from "./nda";
import { ndaAllowsConfidentialTransfer } from "./nda";
import { estimateCableLength, uncoveredMotionStates } from "./cabling";
import { connectorSummaryLines } from "./connectors";

function cablingSummary(dossier: DesignDossier): string[] {
  const e = estimateCableLength(dossier.cabling);
  const uncovered = uncoveredMotionStates(dossier.cabling);
  return [
    `- Longueur nécessaire : ${e.requiredMm === null ? "inconnue (trajet incomplet ou invalide)" : e.requiredMm.toFixed(1) + " mm"}`,
    `- Plus long trajet mesuré : ${e.longestPathMm === null ? "inconnu" : e.longestPathMm.toFixed(1) + " mm"}`,
    `- Réserve de service : ${dossier.cabling.serviceReserveMm} mm — terminaison : ${dossier.cabling.terminationMm} mm`,
    `- Tolérance fournisseur : ±${dossier.cabling.toleranceMm} mm — surplus logeable : ${dossier.cabling.surplusHousingMm} mm`,
    `- Rayon de courbure mini : ${dossier.cabling.minBendRadiusMm ?? "inconnu"} mm`,
    `- États de mouvement couverts : ${dossier.cabling.declaredMotionStates.length - uncovered.length}/${dossier.cabling.declaredMotionStates.length}` +
      (dossier.cabling.motionCoverageConfirmed
        ? " (couverture confirmée)"
        : " (couverture non confirmée)"),
    `- Choix de longueur : ${
      dossier.cabling.lengthChoice === "standard_to_confirm"
        ? "longueur catalogue, à confirmer"
        : dossier.cabling.lengthChoice === "custom_to_confirm"
          ? "longueur sur mesure, à confirmer"
          : "non décidé"
    }`,
    "- Aucune longueur n'est approuvée ici : la R&D Standex vérifie.",
  ];
}

export interface SubmissionSnapshot {
  dossierId: string;
  revision: number;
  hash: string;
  createdAt: string;
  dto: ClientDossierDto;
  transferredFiles: { id: string; fileName: string; path: string; sha256: string }[];
  consents: ConsentRecord[];
  ndaStatus: NdaState["status"];
  reviewAcknowledged: boolean;
  /** Contexte serveur réellement visé par cet envoi. */
  binding: ConsentBinding;
}

export interface SubmissionInput {
  dossier: DesignDossier;
  nda: NdaState;
  consents: ConsentRecord[];
  reviewAcknowledged: boolean;
  additionalConstraints: string;
  /** Dossier serveur visé (null tant qu'aucun n'existe). */
  serverDossierId?: string | null;
  /** Révision serveur visée : celle que le serveur créera. */
  serverRevision?: number;
}

/** DTO réellement envoyé : contraintes complémentaires incluses. */
export function submissionDto(input: SubmissionInput): ClientDossierDto {
  return toClientDto({
    ...input.dossier,
    freeConstraints: [input.dossier.freeConstraints, input.additionalConstraints]
      .filter((s) => s.trim())
      .join("\n"),
  });
}

/** Empreintes des fichiers réellement transférés, triées : ni plus, ni moins. */
export function transferredDigests(dossier: DesignDossier): string[] {
  return dossier.attachments
    .filter((a) => a.transferred && a.storagePath && a.sha256)
    .map((a) => (a.sha256 as string).toLowerCase())
    .sort();
}

/** Ce à quoi le consentement doit être lié pour être valable MAINTENANT. */
export async function submissionBinding(input: SubmissionInput): Promise<ConsentBinding> {
  return {
    serverDossierId: input.serverDossierId ?? null,
    revision: input.serverRevision ?? input.dossier.revision,
    contentHash: await dossierHash(submissionDto(input)),
    fileDigests: transferredDigests(input.dossier),
  };
}

export type SubmissionCheck = { ok: true } | { ok: false; problems: string[] };

export async function checkSubmission(input: SubmissionInput): Promise<SubmissionCheck> {
  const problems: string[] = [];
  if (!input.reviewAcknowledged) problems.push("Confirmez la relecture du résumé technique.");
  if (!input.dossier.business.contactEmail?.trim())
    problems.push("Renseignez un contact pour le retour Standex.");
  if (!ndaAllowsConfidentialTransfer(input.nda))
    problems.push(
      "NDA requis : aucun transfert confidentiel n'est possible sans preuve vérifiée d'un NDA en vigueur.",
    );
  const binding = await submissionBinding(input);
  if (!input.consents.some((c) => c.kind === "supabase_dossier"))
    problems.push("Consentement d'envoi du dossier non recueilli.");
  else if (!hasBoundConsent({ ...INITIAL_PRIVACY, consents: input.consents }, "supabase_dossier", binding))
    problems.push(
      "Le contenu, le dossier visé ou les fichiers ont changé depuis votre accord : relisez le résumé et confirmez à nouveau.",
    );
  return problems.length ? { ok: false, problems } : { ok: true };
}


/** Gel PROFOND : un instantané ne doit pas suivre les modifications ultérieures. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export async function buildSnapshot(
  input: SubmissionInput,
  now = new Date().toISOString(),
): Promise<SubmissionSnapshot> {
  const dto: ClientDossierDto = toClientDto({
    ...input.dossier,
    freeConstraints: [input.dossier.freeConstraints, input.additionalConstraints]
      .filter((s) => s.trim())
      .join("\n"),
  });
  // Copie détachée AVANT gel : plus aucun lien avec l'état vivant du dossier.
  const detached = structuredClone(dto);
  return deepFreeze({
    dossierId: input.dossier.id,
    revision: input.dossier.revision,
    hash: await dossierHash(dto),
    createdAt: now,
    dto: detached,
    // Seuls les fichiers réellement transférés sont listés : un ID local ne suffit pas.
    transferredFiles: input.dossier.attachments
      .filter((a) => a.transferred && a.storagePath)
      .map((a) => ({ id: a.id, fileName: a.fileName, path: a.storagePath as string })),
    consents: input.consents,
    ndaStatus: input.nda.status,
    reviewAcknowledged: input.reviewAcknowledged,
  });
}

export type SubmissionOutcome =
  | { status: "submitted"; submissionId: string; at: string }
  | { status: "not_submitted"; reason: string };

export interface SubmissionBackend {
  available: boolean;
  submit?: (snapshot: SubmissionSnapshot) => Promise<{ id: string; at: string }>;
}

export async function submit(
  input: SubmissionInput,
  backend: SubmissionBackend,
): Promise<SubmissionOutcome> {
  const check = checkSubmission(input);
  if (!check.ok) return { status: "not_submitted", reason: check.problems.join(" ") };
  if (!backend.available || !backend.submit)
    return {
      status: "not_submitted",
      reason:
        "La liaison avec l'équipe Standex n'est pas encore activée : votre dossier n'a pas été envoyé. " +
        "Il reste intact dans cet onglet et vous pouvez l'exporter.",
    };
  try {
    const result = await backend.submit(await buildSnapshot(input));
    return { status: "submitted", submissionId: result.id, at: result.at };
  } catch (error) {
    return {
      status: "not_submitted",
      reason: error instanceof Error ? error.message : "Échec de l'envoi.",
    };
  }
}

export function technicalSummary(dossier: DesignDossier): string {
  const line = (r: { label: string; value: string; unit: string | null; state: string }) =>
    `- ${r.label} : ${r.value || "inconnu"}${r.unit ? " " + r.unit : ""} (${
      r.state === "confirmed" ? "confirmé" : r.state === "hypothesis" ? "hypothèse" : "inconnu"
    })`;
  const volume =
    dossier.business.annualVolume.kind === "known"
      ? `${dossier.business.annualVolume.sensorsPerYear} capteurs/an`
      : "inconnu";
  return [
    `# ${dossier.title} — révision ${dossier.revision}`,
    "",
    "## Exigences",
    ...dossier.requirements.map(line),
    "",
    "## Contraintes libres",
    dossier.freeConstraints || "—",
    "",
    "## Contexte projet",
    `- Phase : ${dossier.business.projectPhase}`,
    `- Volume annuel : ${volume}`,
    `- Démarrage série : ${dossier.business.seriesStartDate ?? "inconnu"}`,
    `- Échantillons utiles avant : ${dossier.business.samplesNeededBy ?? "inconnu"}`,
    `- Durée série : ${dossier.business.seriesDurationYears ?? "inconnu"} ans`,
    "",
    "## Câblage",
    ...cablingSummary(dossier),
    "",
    "## Terminaison",
    ...connectorSummaryLines(dossier.termination).map((l) => `- ${l}`),
  ].join("\n");
}
