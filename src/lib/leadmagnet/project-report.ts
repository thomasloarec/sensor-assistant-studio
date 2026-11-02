import { isPcbSensor } from "./product-presentation";
import { currentClientTrace } from '../standex/client-pedagogical';
import { workshopGuideRange, GUIDE_SIMULATION_NOTE, illustrativeNoteFor } from "../standex/workshop-guide";
import { guideIllustrativeMarks, ACTIVATION_GUIDE } from "../standex/activation-guide";
import { toClientDto, stableStringify, REQUIREMENT_LABELS, type DesignDossier } from "./dossier";
import { assessApplicationFit, FIT_PANEL } from "./application-fit";
import { requirementAnswer } from "./requirement-answer";
import { connectorSummaryLines } from "./connectors";
import { estimateCableLength } from "./cabling";
import { CHOSEN_BARE_LEADS, DELEGATED_CONNECTOR } from "./project-checklist";
import {
  projectIdentity,
  PROVISIONAL_REFERENCE_NOTE,
  SHORT_ALIAS_LABEL,
  UNIQUE_ID_LABEL,
  LOCAL_DRAFT_ID_LABEL,
} from "./project-reference";
import { VARIABLE_FIELDS } from "./nda-docx";
import { type TestedVerdict } from "./tested-pairs";
import { testedPairGuideFact } from "./tested-pair-guide";
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
  group?: "overview" | "solution" | "discussion";
  layout?: "hero" | "grid" | "rows";
  columns?: 2 | 3;
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
  let group: NonNullable<ReportSection["group"]> = "overview";
  const add = (title: string, entries: { label: string; value: string }[], layout: ReportSection["layout"] = "rows", columns:2|3=2) =>
    sections.push({ id: sections.length + 1, title: tr(title), entries, group, layout, columns });
  const entry = (label: string, v: unknown) => ({ label: tr(label), value: value(v) });
  add("Votre projet", [entry("Nom du projet", d.title)], "hero");
  add("Coordonnées et contexte", [
    entry("Entreprise", d.business.contactCompany),
    entry("Nom", d.business.contactName),
    entry("E-mail professionnel", d.business.contactEmail),
    entry("Numéro de téléphone", d.business.contactPhone),
    entry("Ville du site", d.business.siteCity),
    entry("Pays du site", d.business.siteCountry),
  ], "grid", 3);
  /* i18n-canonical: field labels and statuses are translated at export. */
  const phase = {exploration:"Exploration",design:"Conception",prototype:"Prototype",industrialisation:"Industrialisation",unknown:"Non défini pour le moment"};
  add("Contexte projet", [
    entry("Phase", tr(phase[d.business.projectPhase])),
    entry("Volume annuel", d.business.annualVolume.kind === "known" ? `${d.business.annualVolume.sensorsPerYear} ${tr("capteurs/an")}` : unknown),
    entry("Démarrage série", d.business.seriesStartDate),
    entry("Échantillons utiles avant", d.business.samplesNeededBy),
    entry("Durée série", d.business.seriesDurationYears == null ? unknown : `${d.business.seriesDurationYears} ${tr("ans")}`),
  ], "grid", 3);
  add("Application", d.requirements.map(r => {
    const rawAnswer = requirementAnswer(d, r.key, tr);
    const answer = r.key === "envelope" ? rawAnswer.replace(/\n/g," · ") : rawAnswer;
    return entry(REQUIREMENT_LABELS[r.key] ?? r.label,
      answer ? `${answer}${r.unit ? ` ${r.unit}` : ""}${r.state === "hypothesis" ? ` (${tr("hypothèse")})` : ""}` : unknown);
  }));
  if(d.freeConstraints.trim()) add("Contraintes libres", [entry("Contraintes supplémentaires", d.freeConstraints)]);
  group = "solution";
  // Compatibilité du besoin : évaluée AVANT toute conclusion d'essai, pour
  // qu'aucun verdict magnétique antérieur ne soit écrit comme une validation de
  // l'application décrite aujourd'hui. Les données historiques restent intactes.
  const fit = assessApplicationFit(d.requirements, d.freeConstraints);
  /** Conserve la donnée, mais remplace une conclusion positive par le rappel
   *  qu'une démonstration magnétique ne valide pas l'application. */
  const qualify = (text: string | undefined, positive: boolean) => {
    const base = text ? tr(text) : "";
    if (!fit.blocking) return base;
    if (positive || !base) return tr(FIT_PANEL.historicalDemo);
    return `${base} · ${tr(FIT_PANEL.historicalDemo)}`;
  };
  const w = d.workshop;
  const trace=currentClientTrace(d);
  if (w) {
    const guide = workshopGuideRange(w);
    const mounting = toClientDto(d).guidedMounting;
    const computed = mounting?.computed;
    const sim = mounting ? simulateMounting(mounting, undefined, undefined, scenePoseSampler(w), guideIllustrativeMarks(guide)) : null;
    const result = trace ? 'Estimation indisponible' : sim?.coverage === "covered" && !sim.illustrative
      ? cycleMessage(sim.samples.some(s => s.contact === "closed") ? "expected" : "none")
      : guide ? GUIDE_SIMULATION_NOTE : computed?.mainMessage;
    add("Configuration du montage", [
      entry("Capteur", w.sensorId),
      entry("Aimant", w.magnetModel),
      ...(guide ? [entry("Plage du guide disponible", `${guide.sensorReference} · ${guide.approachId} · up ${guide.upMm ?? "—"} mm / to ${guide.toMm ?? "—"} mm · p. ${guide.page} · ${ACTIVATION_GUIDE.source.url}`)] : []),
      entry("Classe de sensibilité", w.sensitivity),
      ...(!w.machine ? [entry(
        "Position",
        `${w.geometry} · ${tr(w.geometry === "F1" ? "Face à face" : w.geometry === "D1" ? "Parallèle" : "Perpendiculaire")}`,
      )] : []),
      ...(w.machine ? [
        entry("Fichier 3D", w.machine.fileName),
        ...(w.machine.motionSource === "clip" ? [entry("Mouvement", w.machine.clip?.name || unknown)] : [
          entry("Mouvement", tr(w.machine.motion === "rotation" ? "Rotation" : "Translation")),
          entry(w.machine.motion === "rotation" ? "Angle d'ouverture" : "Course", w.machine.motion === "rotation" ? `${w.machine.openingAngle}°` : `${Math.hypot(...w.machine.travel).toFixed(1)} mm`),
        ]),
      ] : [
        entry("Position ouverte", `${w.start} mm`),
        entry("Position fermée", `${w.end} mm`),
        entry("Orientation de l'aimant", `${w.magnetAngle}° / ${w.magnetTilt}°`),
        entry("Trajectoire", `${w.motion} · ${w.offset} / ${w.travel} mm · ${w.span}°`),
      ]),
    ], "grid");
    add("Le résultat", [
      entry(
        "Le résultat",
        [...new Set([
          result ? qualify(result, result === cycleMessage("expected")) : fit.blocking ? tr(FIT_PANEL.historicalDemo) : unknown,
          ...(!trace && computed?.illustrative ? [qualify(guide ? GUIDE_SIMULATION_NOTE : illustrativeNoteFor(w), false)] : []),
        ])].join("\n"),
      ),
      ...(!trace && computed?.pullInMm != null ? [entry("Ferme à", `${computed.pullInMm} mm`)] : []),
      ...(!trace && computed?.dropOutMm != null ? [entry("Ouvre à", `${computed.dropOutMm} mm`)] : []),
      entry(
        "Les hypothèses retenues",
        tr(
          "Les couleurs repèrent l'aimant. Polarité non caractérisée : aucun changement de polarité ni effet calculé.",
        ),
      ),
    ]);
  }
  if(!w && d.selectedSensorId) add("Configuration du montage", [entry("Capteur", d.selectedSensorId)]);
  if(isPcbSensor(d.selectedSensorId)) add("Câblage", [entry("Montage", tr("Montage sur PCB : câble et connecteur non applicables."))]);
  else {
    const cable = estimateCableLength(d.cabling);
    add("Câblage", [
      entry("Longueur de câble retenue (mm)", w?.cableLengthMm),
      entry("Choix de longueur", tr(d.cabling.lengthChoice === "custom_to_confirm" ? "Sur mesure" : d.cabling.lengthChoice === "standard_to_confirm" ? "Standard" : "Non défini pour le moment")),
      ...(cable.requiredMm !== null ? [entry("Longueur nécessaire", `${cable.requiredMm.toFixed(1)} mm`)] : []),
      ...((d.delegatedDecisions ?? []).includes("cable") ? [entry("Décision", tr("À définir avec Standex"))] : []),
    ], "grid");
    const connector = (d.delegatedDecisions ?? []).includes(DELEGATED_CONNECTOR) ? [tr("À définir avec Standex")]
      : d.termination.kind === "bare_leads" ? [(d.delegatedDecisions ?? []).includes(CHOSEN_BARE_LEADS) ? tr("Choix du client : pas de connecteur, fils nus.") : unknown]
      : connectorSummaryLines(d.termination, tr);
    add("Terminaison", connector.map(line => {
      const split = line.indexOf(" : ");
      return split < 0 ? entry("À retenir", line) : {label:line.slice(0,split),value:line.slice(split+3)};
    }), "grid");
  }
  group = "overview";
  // Compatibilité du besoin : la MÊME vérité que l'écran des couples et le
  // résultat. Une contradiction posée dans les réponses reste écrite ici.
  if (fit.issues.length)
    add("Compatibilité de votre application", [
      ...fit.issues.flatMap((issue) => [
        entry(tr(issue.title), tr(issue.whatWorks)),
        entry(
          tr("Ce qui ne fonctionne pas"),
          issue.whatFailsArgs.length
            ? tr(issue.whatFails).replace(
                /\{(\d+)\}/g,
                (_, i) => issue.whatFailsArgs[Number(i)] ?? "",
              )
            : tr(issue.whatFails),
        ),
        entry(tr("Pourquoi"), tr(issue.why)),
        entry(
          tr("Modifications possibles"),
          issue.changes
            .map(
              (c) =>
                `${c.step.number === null ? tr(c.step.label) : `${tr("Question")} ${c.step.number} · ${tr(c.step.label)}`} — ${tr(c.text)}`,
            )
            .join(" | "),
        ),
        ...issue.cautions.map((c) => entry(tr("À retenir"), tr(c))),
      ]),
      entry(tr("Ce que cela implique"), tr(FIT_PANEL.noProducts)),
    ]);
  group = "discussion";
  if (d.testedPairs?.length)
    add(
      "Historique des essais",
      d.testedPairs.map((p) => {
        // MÊME source que le récapitulatif de l'écran : la ligne du guide
        // réellement enregistrée avec l'essai, avec sa page. Les bornes restent
        // documentaires : ce ne sont pas des seuils de ce montage.
        const fact = testedPairGuideFact(p, tr, (template: string, args: string[]) =>
          tr(template).replace(/\{(\d+)\}/g, (_, i) => args[Number(i)] ?? ""),
        );
        return entry(
          `${p.sensorId} + ${p.magnetId} · ${p.approach} · ${p.at}`,
          [
            fact?.label,
            qualify(p.mainMessage || cycleMessage(p.verdict), p.verdict === "expected"),
          ]
            .filter(Boolean)
            .join(" · "),
        );
      }),
    );
  if (d.openQuestions.length)
    add(
      "Questions ouvertes",
      d.openQuestions.map((q, i) => entry(String(i + 1), q)),
    );
  /* i18n-canonical: storage keys are never printed as business labels. */
  const decisionLabels:Record<string,string> = {sensor:"Capteur",cable:"Câblage",connector:"Terminaison",mounting:"Montage",context:"Contexte projet",trial_request:"Essai",annualVolume:"Volume annuel",projectPhase:"Phase",seriesStartDate:"Démarrage série",seriesDurationYears:"Durée série"};
  const delegated=(d.delegatedDecisions??[]).filter(k=>k!==CHOSEN_BARE_LEADS);
  if (delegated.length || d.business.undefinedFields?.length)
    add("Décisions confiées à Standex", [
      ...(delegated.length ? [entry("Décisions confiées à Standex", delegated.map(k=>tr(REQUIREMENT_LABELS[k.replace(/^question:/, "")] ?? decisionLabels[k] ?? k)).join(", "))] : []),
      ...(d.business.undefinedFields?.length ? [entry("Non défini pour le moment", d.business.undefinedFields.map(k=>tr(decisionLabels[k]??k)).join(", "))] : []),
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
  const order = {overview:0,solution:1,discussion:2};
  const discussionOrder = ["Questions ouvertes","Décisions confiées à Standex","Confidentialité · NDA","Pièces jointes","Historique des essais","Revue de conception","Identification"].map(label=>tr(label));
  return sections.sort((a,b) => order[a.group!] - order[b.group!] ||
    (a.group === "discussion" ? discussionOrder.indexOf(a.title)-discussionOrder.indexOf(b.title) : 0))
    .map((s,i)=>({...s,id:i+1}));
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
  const { projectBriefPdf } = await import("./project-brief-pdf");
  const data = projectReportData(dossier, nda);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableStringify(data)),
  );
  const hash = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
  const identity = projectIdentity(serverDossierId, dossier.id);
  return projectBriefPdf(
    { sections: projectReportSections(dossier, nda, tr, serverDossierId), hash },
    logoUrl,
    tr,
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
