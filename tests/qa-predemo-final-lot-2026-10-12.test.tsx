/** Lot final pré-démo (12/10/2026) — voir docs/QA_PREDEMO_FINAL_LOT_2026-10-12.md. */
import { describe, expect, test } from "bun:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assessApplicationFit, hasStatedPurpose, isSubstantive } from "@/lib/leadmagnet/application-fit";
import { CompatibilityPanel, fitIssueKind, FIT_STATUS } from "@/components/leadmagnet/compatibility-panel";
import { createDossier, toClientDto, type Requirement } from "@/lib/leadmagnet/dossier";
import { parseServerSnapshot } from "@/lib/leadmagnet/dossier-io";
import { detectEnvelopeFromText } from "@/lib/leadmagnet/envelope-text";
import { evaluateCandidates } from "@/lib/leadmagnet/candidates";
import { suggestionFilters } from "@/lib/leadmagnet/suggestion-filters";
import { pairCardFor } from "@/lib/leadmagnet/pair-cards";
import { sensorById, sensorDisplayTitle, sensorDisplayVariant } from "@/lib/standex/sensor-catalog";
import messages from "@/lib/i18n/messages.json";

const req = (a: Record<string, string>): Requirement[] =>
  Object.entries(a).map(([key, value]) => ({ key, value }) as unknown as Requirement);
const none = { mountingChosen: false, envelopeSet: false };
const fit = (a: Record<string, string>, s = none) => assessApplicationFit(req(a), "", s);
const decode = (h: string) => h.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const panel = (a: Record<string, string>, contact = true) =>
  decode(renderToStaticMarkup(
    <CompatibilityPanel assessment={fit(a)} onGoToStep={() => undefined} {...(contact ? { onContactStandex: () => undefined } : {})} />,
  ));

describe("Encart « aucune correspondance » — trois statuts distincts", () => {
  test("classement des points", () => {
    expect(fitIssueKind("continuous_temperature_measurement")).toBe("modality");
    expect(fitIssueKind("direct_load_switching")).toBe("modality");
    expect(fitIssueKind("no_magnetic_source")).toBe("modality");
    expect(fitIssueKind("extreme_temperature_review")).toBe("review");
    expect(fitIssueKind("extreme_gap_review")).toBe("review");
    expect(fitIssueKind("no_meaningful_requirement")).toBe("insufficient");
  });
  test("C02 : étude d'ingénierie, jamais un encart d'alerte, contact Standex proposé", () => {
    const html = panel({ environment: "Sensor operating at 220 °C" });
    expect(html).toContain(FIT_STATUS.reviewTitle);
    expect(html).toContain(FIT_STATUS.reviewNote);
    expect(html).toContain('data-kind="review"');
    expect(html).not.toContain("notice-danger");
    expect(html).not.toContain(FIT_STATUS.modality);
    expect(html).toContain('data-testid="fit-contact-standex"');
    expect(html).toContain("Sensor operating at 220 °C"); // la phrase de la personne
  });
  test("C03 : étude d'ingénierie également", () => {
    expect(panel({ states_motion: "gap = 500 mm" })).toContain('data-kind="review"');
  });
  test("B02 : modalité inadaptée, raisonnement replié dans les détails", () => {
    const html = panel({ detection_goal: "Continuous temperature measurement 20-250 °C", electrical: "4-20 mA" });
    expect(html).toContain(FIT_STATUS.modality);
    const details = html.indexOf('data-testid="fit-details"');
    expect(details).toBeGreaterThan(0);
    expect(html.indexOf("Ce qui fonctionne")).toBeGreaterThan(details);
    expect(html.indexOf("fit-source-link") === -1 || html.indexOf("fit-source-link") > details).toBe(true);
  });
  test("questionnaire vide : informations insuffisantes, pas de contact ni de refus", () => {
    const a = assessApplicationFit(req({ detection_goal: "" }), "", none);
    const html = decode(renderToStaticMarkup(<CompatibilityPanel assessment={a} onGoToStep={() => undefined} onContactStandex={() => undefined} />));
    expect(html).toContain(FIT_STATUS.insufficientTitle);
    expect(html).not.toContain("fit-contact-standex");
  });
  test("sans câblage de contact, aucun bouton factice", () =>
    expect(panel({ environment: "Sensor operating at 220 °C" }, false)).not.toContain("fit-contact-standex"));
  test("contact Standex câblé vers l'envoi du projet (onglet revue) et vers ResultView", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");
    expect(src).toContain('onContactStandex={() => setTab("revue")}');
    expect(readFileSync("src/components/leadmagnet/result-view.tsx", "utf8")).toContain("onContactStandex={onConfirmWithStandex}");
  });
});

describe("A05 — place disponible en texte libre", () => {
  const det = (v: string, key = "mounting") => detectEnvelopeFromText(req({ [key]: v }), "");
  for (const [v, env] of [
    ["Maximum available space: 8 × 5 × 4 mm", [8, 5, 4]],
    ["maximum available sensor volume 8x5x4mm", [8, 5, 4]],
    ["Place disponible : 8 x 5 x 4 mm", [8, 5, 4]],
    ["Encombrement maximal 0,8 x 0,5 x 0,4 cm", [8, 5, 4]],
    ["The sensor must fit within 12 x 6 x 3 mm", [12, 6, 3]],
  ] as const)
    test(`détecté : ${v}`, () => {
      const r = det(v);
      expect(r?.kind).toBe("found");
      if (r?.kind === "found") expect([r.envelope.lengthMm, r.envelope.widthMm, r.envelope.heightMm]).toEqual([...env]);
    });
  for (const v of [
    "Magnet 8 x 5 x 4 mm on the door",
    "The moving part is 80 x 50 x 40 mm",
    "Cable 500 mm",
    "8 x 5 x 4 mm",
    "Aimant de 10 x 5 x 2 mm, place disponible inconnue",
  ])
    test(`non détecté (pas une place capteur) : ${v}`, () => expect(det(v)).toBeNull());
  for (const v of ["Maximum available space: 8 x 5 x 4", "Maximum available space 1 x 1 x 1 in", "Available space -8 x 5 x 4 mm", "Available space 8 x 5 x 4 mm or 10 x 6 x 4 mm"])
    test(`ambigu, jamais deviné : ${v}`, () => expect(det(v)?.kind).toBe("ambiguous"));
  test("texte libre « précision supplémentaire » lu aussi", () =>
    expect(detectEnvelopeFromText([], "Max sensor space 8x5x4 mm")?.kind).toBe("found"));
  test("une fois appliquée, l'enveloppe filtre réellement les candidats", () => {
    const before = evaluateCandidates({ mounting: { kind: "undecided" }, envelope: { lengthMm: null, widthMm: null, heightMm: null } });
    const after = evaluateCandidates({ mounting: { kind: "undecided" }, envelope: { lengthMm: 8, widthMm: 5, heightMm: 4 } });
    const ex = (r: typeof before) => r.filter((c) => c.status === "excluded").length;
    expect(ex(after)).toBeGreaterThan(ex(before));
  });
});

describe("A02 — corps fileté distinct de l'emmanchement et de la collerette", () => {
  const kept = (style: "threaded_body" | "screw_fixed" | undefined) =>
    evaluateCandidates({ mounting: style ? { kind: "screw", style } : { kind: "screw" }, envelope: { lengthMm: null, widthMm: null, heightMm: null } })
      .filter((c) => c.status !== "excluded")
      .map((c) => c.id);
  test("corps fileté : seuls les MK11 (et le sur mesure)", () => {
    const k = kept("threaded_body");
    expect(k.filter((id) => id.startsWith("MK11")).length).toBe(4);
    expect(k.every((id) => id.startsWith("MK11") || id === "CUSTOM")).toBe(true);
  });
  test("fixation par vis : aucun MK11, aucun MK36/37/38", () => {
    const k = kept("screw_fixed");
    expect(k.some((id) => id.startsWith("MK11"))).toBe(false);
    expect(k.some((id) => /^MK3[678]$/.test(id))).toBe(false);
  });
  test("ancien dossier « screw » sans précision : comportement d'origine conservé", () =>
    expect(kept(undefined).some((id) => id.startsWith("MK11"))).toBe(true));
  test("MK36/37/38 restent « à emmancher », jamais « fileté »", () => {
    for (const id of ["MK36", "MK37", "MK38"]) expect(pairCardFor(sensorById(id)).fixingLabel).toContain("emmancher");
    expect(pairCardFor(sensorById("MK11-M8")).fixingLabel).toContain("trou taraudé");
  });
  test("le filtre de suggestion suit la précision", () => {
    const f = suggestionFilters({ mounting: { kind: "screw", style: "threaded_body" }, envelope: { lengthMm: null, widthMm: null, heightMm: null } });
    expect(f.find((x) => x.id === "fixation")?.label).toBe("Corps fileté vissé dans un trou taraudé");
  });
  test("persistance : la précision survit à la reprise, l'ancien format reste lisible", () => {
    const d = createDossier("2026-10-12T00:00:00.000Z");
    d.mounting = { kind: "screw", style: "threaded_body" };
    const r = parseServerSnapshot(toClientDto(d));
    expect(r.ok && r.dossier.mounting).toEqual({ kind: "screw", style: "threaded_body" });
    d.mounting = { kind: "screw" };
    const old = parseServerSnapshot(toClientDto(d));
    expect(old.ok && old.dossier.mounting).toEqual({ kind: "screw" });
  });
});

describe("A03 — MK24 affiché, identifiant interne inchangé", () => {
  test("titre et variante", () => {
    expect(sensorDisplayTitle("MK24-A-J")).toBe("MK24");
    expect(sensorDisplayVariant("MK24-A-J")).toContain("configuration illustrée");
    expect(sensorById("MK24-A-J").id).toBe("MK24-A-J");
    expect(sensorDisplayVariant("MK03")).toBeNull();
    expect(sensorDisplayTitle("MK03")).toBe("MK03");
  });
});

describe("P2 — remplissage et exploration seule", () => {
  for (const v of ["je ne sais pas", "I don't know", "no idea", "??? ok", "Keine Ahnung", "no lo sé", "non lo so"])
    test(`« ${v} » n'est pas un besoin`, () => expect(isSubstantive(v)).toBe(false));
  for (const v of ["Détecter la porte", "24 V PLC", "门", "Türposition erkennen", "no relay, 24 V"])
    test(`« ${v} » est un besoin`, () => expect(isSubstantive(v)).toBe(true));
  test("tout en remplissage → informations insuffisantes (bloquant)", () =>
    expect(assessApplicationFit(req({ detection_goal: "je ne sais pas", electrical: "??? ok" }), "", none).issues[0]?.id).toBe("no_meaningful_requirement"));
  test("montage seul → exploration uniquement, aucun blocage, aucune recommandation", () => {
    const a = assessApplicationFit(req({ detection_goal: "" }), "", { mountingChosen: true, envelopeSet: false });
    expect(a.blocking).toBe(false);
    expect(a.explorationOnly).toBe(true);
  });
  test("cotes seules → exploration uniquement", () =>
    expect(assessApplicationFit(req({}), "", { mountingChosen: false, envelopeSet: true }).explorationOnly).toBe(true));
  test("besoin partiel réel → recommandation normale", () => {
    const a = assessApplicationFit(req({ detection_goal: "Detect the lid" }), "", { mountingChosen: true, envelopeSet: false });
    expect(a.explorationOnly).toBe(false);
    expect(hasStatedPurpose(req({ detection_goal: "Detect the lid" }), "")).toBe(true);
  });
  test("A01 et D01 restent des recommandations normales", () => {
    for (const a of [
      { detection_goal: "Détecter la fermeture de la porte du lave-vaisselle", electrical: "NO, 5 V, 2 mA" },
      { detection_goal: "Détecter un seuil de niveau avec un flotteur magnétique" },
    ]) {
      const r = assessApplicationFit(req(a), "", { mountingChosen: true, envelopeSet: false });
      expect(r.blocking).toBe(false);
      expect(r.explorationOnly).toBe(false);
    }
  });
});

describe("i18n — huit langues pour les nouveaux textes du lot", () => {
  const dict = messages as unknown as Record<string, string[]>;
  const keys = [
    ...Object.values(FIT_STATUS),
    "Corps fileté — se visse dans un trou taraudé",
    "Collerette ou boîtier fixé par vis",
    "Exploration du catalogue uniquement",
    "Appliquer ces dimensions",
    "Ne pas appliquer",
    "Forme A · connexions J — configuration illustrée",
    "Corps fileté vissé dans un trou taraudé",
  ];
  for (const k of keys)
    test(k.slice(0, 50), () => {
      expect(dict[k]).toHaveLength(7);
      for (const v of dict[k]!) expect(v.trim()).not.toBe("");
    });
});
