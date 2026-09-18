import { isPcbSensor } from "./product-presentation";
import { workshopGuideRange, GUIDE_SIMULATION_NOTE, illustrativeNoteFor } from "../standex/workshop-guide";
import { guideIllustrativeMarks, ACTIVATION_GUIDE } from "../standex/activation-guide";
import { toClientDto, stableStringify, REQUIREMENT_LABELS, type DesignDossier } from "./dossier";
import { technicalSummary } from "./submission";
import {
  projectIdentity,
  PROVISIONAL_REFERENCE_NOTE,
  SHORT_ALIAS_LABEL,
  UNIQUE_ID_LABEL,
  LOCAL_DRAFT_ID_LABEL,
} from "./project-reference";
import { VARIABLE_FIELDS } from "./nda-docx";
import { type TestedVerdict } from "./tested-pairs";
import { simulateMounting } from "../standex/mounting/simulate";
import { scenePoseSampler } from "../standex/mounting/bridge";

// i18n-canonical: same observed-cycle verdict as the result screen.
const cycleMessage = (verdict: TestedVerdict) => verdict === "expected"
  ? "Détection prévue dans ce montage"
  : verdict === "none" ? "Pas de détection sur ce cycle — rapprochez l'aimant ou changez de couple"
  : verdict === "undocumented" ? "Position non documentée — Standex peut la mesurer pour vous"
  : "Distances non publiées pour ce couple — Standex peut les mesurer";

export interface ReportSection {
  id: number;
  title: string;
  entries: { label: string; value: string }[];
}

/** Readable report; the full data is embedded as JSON in the same PDF. */
export function projectReportSections(
  d: DesignDossier,
  nda: Record<string, unknown> = {},
  tr = (s: string) => s,
  /** Identifiant serveur du projet, null tant que rien n'est enregistré. */
  serverDossierId: string | null = null,
): ReportSection[] {
  const sections: ReportSection[] = [];
  const unknown = tr("Non défini pour le moment");
  const value = (v: unknown) => (v === null || v === undefined || v === "" ? unknown : String(v));
  const add = (title: string, entries: { label: string; value: string }[]) =>
    sections.push({ id: sections.length + 1, title: tr(title), entries });
  const entry = (label: string, v: unknown) => ({ label: tr(label), value: value(v) });
  add("Votre projet", [{ label: d.title, value: technicalSummary(d, tr).replace(/^#+\s*/gm, "") }]);
  add("Coordonnées et contexte", [
    entry("Nom", d.business.contactName),
    entry("Entreprise", d.business.contactCompany),
    entry("E-mail professionnel", d.business.contactEmail),
    entry("Numéro de téléphone", d.business.contactPhone),
    entry("Ville du site", d.business.siteCity),
    entry("Pays du site", d.business.siteCountry),
  ]);
  const w = d.workshop;
  if (w) {
    const guide = workshopGuideRange(w);
    const mounting = toClientDto(d).guidedMounting;
    const computed = mounting?.computed;
    const sim = mounting ? simulateMounting(mounting, undefined, undefined, scenePoseSampler(w), guideIllustrativeMarks(guide)) : null;
    const result = sim?.coverage === "covered" && !sim.illustrative
      ? cycleMessage(sim.samples.some(s => s.contact === "closed") ? "expected" : "none")
      : guide ? GUIDE_SIMULATION_NOTE : computed?.mainMessage;
    add("Configuration du montage", [
      entry("Capteur", w.sensorId),
      entry("Aimant", w.magnetModel),
      ...(guide ? [entry("Plage du guide disponible", `${guide.sensorReference} · ${guide.approachId} · up ${guide.upMm ?? "—"} mm / to ${guide.toMm ?? "—"} mm · p. ${guide.page} · ${ACTIVATION_GUIDE.source.url}`)] : []),
      entry("Classe de sensibilité", w.sensitivity),
      entry(
        "Position",
        `${w.geometry} · ${tr(w.geometry === "F1" ? "Face à face" : w.geometry === "D1" ? "Parallèle" : "Perpendiculaire")}`,
      ),
      entry("Position ouverte", `${w.start} mm`),
      entry("Position fermée", `${w.end} mm`),
      ...(!isPcbSensor(d.selectedSensorId) ? [entry("Longueur de câble retenue (mm)", w.cableLengthMm)] : []),
      entry("Orientation de l'aimant", `${w.magnetAngle}° / ${w.magnetTilt}°`),
      entry("Orientation sur la machine", `${w.mountAngle}° · (${w.mountX}, ${w.mountZ}) mm`),
      entry("Trajectoire", `${w.motion} · ${w.offset} / ${w.travel} mm · ${w.span}°`),
      entry("Fichier 3D", w.machine?.fileName),
      entry("Le résultat", result ? tr(result) : unknown),
      entry("Ferme à", computed?.pullInMm == null ? unknown : `${computed.pullInMm} mm`),
      entry("Ouvre à", computed?.dropOutMm == null ? unknown : `${computed.dropOutMm} mm`),
      ...(computed?.illustrative
        ? [
            entry(
              "Le résultat",
              tr(guide ? GUIDE_SIMULATION_NOTE : illustrativeNoteFor(w)),
            ),
          ]
        : []),
      entry(
        "Les hypothèses retenues",
        tr(
          "Les couleurs repèrent l'aimant. Polarité non caractérisée : aucun changement de polarité ni effet calculé.",
        ),
      ),
    ]);
  }
  if (d.testedPairs?.length)
    add(
      "Historique des essais",
      d.testedPairs.map((p) =>
        entry(
          `${p.sensorId} + ${p.magnetId} · ${p.approach} · ${p.at}`,
          tr(p.mainMessage || cycleMessage(p.verdict)),
        ),
      ),
    );
  if (d.openQuestions.length)
    add(
      "Questions ouvertes",
      d.openQuestions.map((q, i) => entry(String(i + 1), q)),
    );
  if (d.delegatedDecisions?.length || d.business.undefinedFields?.length)
    add("Décisions confiées à Standex", [
      entry("Décisions confiées à Standex", (d.delegatedDecisions ?? []).map(k=>tr(REQUIREMENT_LABELS[k.replace(/^question:/, "")] ?? k)).join(", ")),
      entry("Non défini pour le moment", (d.business.undefinedFields ?? []).join(", ")),
    ]);
  if (d.attachments.length)
    add(
      "Pièces jointes",
      d.attachments.map((a) =>
        entry(a.fileName, `${a.bytes} bytes · ${a.transferred ? tr("Oui") : tr("Non")}`),
      ),
    );
  if (d.designFreeze)
    add(
      "Revue de conception",
      d.designFreeze.sections.flatMap((s) => s.entries),
    );
  const fields = (nda["champs"] ?? {}) as Record<string, unknown>;
  add("Confidentialité · NDA", [
    entry("NDA", nda["requis"] === true ? tr("Oui") : tr("Non")),
    entry("Statut", nda["statut"]),
    ...VARIABLE_FIELDS.filter((f) => (nda["requis"] === true && !f.standexOnly) || fields[f.key]).map((f) =>
      entry(f.label, fields[f.key]),
    ),
    entry("Contraintes supplémentaires", nda["contraintesComplementaires"] ?? nda["contraintes"]),
  ]);
  const identity = projectIdentity(serverDossierId, d.id);
  add("Identification", [
    // L'identifiant COMPLET est imprimé tel quel : c'est lui qui désigne le
    // projet. L'abrégé n'est qu'un confort de lecture, jamais une clé.
    entry(
      identity.provisional ? LOCAL_DRAFT_ID_LABEL : UNIQUE_ID_LABEL,
      identity.fullId ?? unknown,
    ),
    entry(SHORT_ALIAS_LABEL, identity.reference ?? unknown),
    // Un brouillon non enregistré le dit, et dit ce qui rend la référence définitive.
    ...(identity.provisional
      ? [entry("Ce qu'il faut savoir", tr(PROVISIONAL_REFERENCE_NOTE))]
      : [entry(LOCAL_DRAFT_ID_LABEL, d.id)]),
    entry("révision", d.revision),
    entry(
      "Rapport complet du projet",
      tr("Les données détaillées du projet sont jointes à ce PDF dans dossier-complet.json."),
    ),
  ]);
  return sections;
}

/** Exact current data, including NDA/extra constraints; never internal notes or binaries. */
export const projectReportData = (d: DesignDossier, nda: Record<string, unknown>) => ({
  dossier: toClientDto(d),
  confidentialite: nda,
});

export async function projectPdf(
  dossier: DesignDossier,
  logoUrl: string,
  nda: Record<string, unknown>,
  tr = (s: string) => s,
  serverDossierId: string | null = null,
) {
  const { reviewPdf } = await import("@/lib/standex/studio-pdf");
  const data = projectReportData(dossier, nda);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableStringify(data)),
  );
  const hash = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
  const identity = projectIdentity(serverDossierId, dossier.id);
  return reviewPdf(
    { sections: projectReportSections(dossier, nda, tr, serverDossierId), hash },
    logoUrl,
    (s) => s,
    {
    // Le nom du projet est en tête du document ; la référence suit, provisoire si le projet n'est pas enregistré.
    title: dossier.title || tr("Rapport complet du projet"),
    subtitle: [
      identity.reference,
      identity.provisional ? tr("brouillon non enregistré") : null,
      tr("Projet à confirmer par Standex"),
    ]
      .filter(Boolean)
      .join(" · "),
      attachment: new TextEncoder().encode(JSON.stringify(data, null, 2)),
    },
  );
}
