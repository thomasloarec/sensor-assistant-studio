import { toClientDto, stableStringify, REQUIREMENT_LABELS, type DesignDossier } from "./dossier";
import { technicalSummary } from "./submission";
import { VARIABLE_FIELDS } from "./nda-docx";

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
  ]);
  const w = d.workshop;
  if (w) {
    const computed = toClientDto(d).guidedMounting?.computed;
    add("Configuration du montage", [
      entry("Capteur", w.sensorId),
      entry("Aimant", w.magnetModel),
      entry("Classe de sensibilité", w.sensitivity),
      entry(
        "Position",
        `${w.geometry} · ${tr(w.geometry === "F1" ? "Face à face" : w.geometry === "D1" ? "Parallèle" : "Perpendiculaire")}`,
      ),
      entry("Position ouverte", `${w.start} mm`),
      entry("Position fermée", `${w.end} mm`),
      entry("Longueur de câble retenue (mm)", w.cableLengthMm),
      entry("Orientation de l'aimant", `${w.magnetAngle}° / ${w.magnetTilt}°`),
      entry("Orientation sur la machine", `${w.mountAngle}° · (${w.mountX}, ${w.mountZ}) mm`),
      entry("Trajectoire", `${w.motion} · ${w.offset} / ${w.travel} mm · ${w.span}°`),
      entry("Fichier 3D", w.machine?.fileName),
      entry("Le résultat", computed ? tr(computed.mainMessage) : unknown),
      entry("Ferme à", computed?.pullInMm == null ? unknown : `${computed.pullInMm} mm`),
      entry("Ouvre à", computed?.dropOutMm == null ? unknown : `${computed.dropOutMm} mm`),
      ...(computed?.illustrative
        ? [
            entry(
              "Le résultat",
              tr("Simulation illustrative — distance non caractérisée, à valider par essais"),
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
          p.mainMessage || tr(p.verdict === "expected" ? "Détection prévue" : "Position à mesurer"),
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
  add("Identification", [
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
) {
  const { reviewPdf } = await import("@/lib/standex/studio-pdf");
  const data = projectReportData(dossier, nda);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableStringify(data)),
  );
  const hash = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
  return reviewPdf({ sections: projectReportSections(dossier, nda, tr), hash }, logoUrl, (s) => s, {
    title: tr("Rapport complet du projet"),
    subtitle: tr("Projet à confirmer par Standex"),
    attachment: new TextEncoder().encode(JSON.stringify(data, null, 2)),
  });
}
