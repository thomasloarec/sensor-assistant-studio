/** Soumission : instantané immuable, statut réel uniquement après succès backend. */
import { dossierHash, toClientDto, type ClientDossierDto, type DesignDossier } from "./dossier";
import type { ConsentRecord } from "./privacy";
import type { NdaState } from "./nda";
import { ndaAllowsConfidentialTransfer } from "./nda";

export interface SubmissionSnapshot {
  dossierId: string;
  revision: number;
  hash: string;
  createdAt: string;
  dto: ClientDossierDto;
  transferredFiles: { id: string; fileName: string }[];
  consents: ConsentRecord[];
  ndaStatus: NdaState["status"];
  reviewAcknowledged: boolean;
}

export interface SubmissionInput {
  dossier: DesignDossier;
  nda: NdaState;
  consents: ConsentRecord[];
  reviewAcknowledged: boolean;
  additionalConstraints: string;
}

export type SubmissionCheck = { ok: true } | { ok: false; problems: string[] };

export function checkSubmission(input: SubmissionInput): SubmissionCheck {
  const problems: string[] = [];
  if (!input.reviewAcknowledged) problems.push("Confirmez la relecture du résumé technique.");
  if (!input.dossier.business.contactEmail?.trim())
    problems.push("Renseignez un contact pour le retour Standex.");
  if (!ndaAllowsConfidentialTransfer(input.nda))
    problems.push(
      "NDA requis : aucun transfert confidentiel n'est possible sans preuve vérifiée d'un NDA en vigueur.",
    );
  if (!input.consents.some((c) => c.kind === "supabase_dossier"))
    problems.push("Consentement d'envoi du dossier non recueilli.");
  return problems.length ? { ok: false, problems } : { ok: true };
}

export async function buildSnapshot(
  input: SubmissionInput,
  now = new Date().toISOString(),
): Promise<SubmissionSnapshot> {
  const dto = toClientDto({
    ...input.dossier,
    freeConstraints: [input.dossier.freeConstraints, input.additionalConstraints]
      .filter((s) => s.trim())
      .join("\n"),
  });
  return Object.freeze({
    dossierId: input.dossier.id,
    revision: input.dossier.revision,
    hash: await dossierHash(dto),
    createdAt: now,
    dto,
    // Seuls les fichiers réellement transférés sont listés : un ID local ne suffit pas.
    transferredFiles: input.dossier.attachments
      .filter((a) => a.transferred && a.storagePath)
      .map((a) => ({ id: a.id, fileName: a.fileName })),
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
  ].join("\n");
}
