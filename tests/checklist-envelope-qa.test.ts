import { describe, expect, test } from "bun:test";
import { createDossier } from "@/lib/leadmagnet/dossier";
import {
  DELEGATED_CABLE,
  DELEGATED_CONNECTOR,
  DELEGATED_CONTEXT,
  DELEGATED_MOUNTING,
  checklistProgress,
  delegatedQuestion,
  projectChecklist,
} from "@/lib/leadmagnet/project-checklist";
import { passesFilter, suggestionFilters } from "@/lib/leadmagnet/suggestion-filters";
import { SENSOR_CATALOG, sensorById } from "@/lib/standex/sensor-catalog";
import { buildDossierExport, parseDossierExport } from "@/lib/leadmagnet/dossier-io";

const fresh = () => createDossier();

describe("checklist — toutes les décisions simples, délégation explicite", () => {
  test("six lignes : aucune étape de provenance ajoutée au parcours", () => {
    const items = projectChecklist(fresh());
    expect(items.map((i) => i.id)).toEqual([
      "besoin",
      "capteur",
      "montage",
      "cable",
      "connecteur",
      "contexte",
    ]);
  });

  test("dossier neuf : rien de traité, aucun faux complet", () => {
    const items = projectChecklist(fresh());
    expect(items.every((i) => i.state === "todo")).toBe(true);
    expect(checklistProgress(items).handled).toBe(0);
  });

  test("câble et connecteur sont deux lignes indépendantes", () => {
    const d = { ...fresh(), cabling: { ...fresh().cabling, lengthChoice: "standard_to_confirm" } };
    const items = projectChecklist(d as ReturnType<typeof fresh>);
    expect(items.find((i) => i.id === "cable")!.state).toBe("chosen");
    expect(items.find((i) => i.id === "connecteur")!.state).toBe("todo");
  });

  test("délégations explicites comptent comme traitées, jamais comme valeurs", () => {
    const d = {
      ...fresh(),
      delegatedDecisions: [
        DELEGATED_MOUNTING,
        DELEGATED_CABLE,
        DELEGATED_CONNECTOR,
        DELEGATED_CONTEXT,
      ],
    };
    const items = projectChecklist(d);
    for (const id of ["montage", "cable", "connecteur", "contexte"])
      expect(items.find((i) => i.id === id)!.state).toBe("delegated");
    expect(d.mounting.kind).toBe("undecided");
    expect(d.business.annualVolume.kind).toBe("unknown");
  });

  test("une seule réponse sur six ne suffit pas à cocher le besoin", () => {
    const base = fresh();
    const d = {
      ...base,
      requirements: [
        {
          ...base.requirements[0]!,
          key: "detection_goal",
          state: "confirmed" as const,
        },
      ],
    } as typeof base;
    expect(projectChecklist(d).find((i) => i.id === "besoin")!.state).not.toBe("chosen");
  });

  test("les délégations survivent à un export puis une reprise", () => {
    const d = { ...fresh(), delegatedDecisions: [DELEGATED_CONTEXT, delegatedQuestion("mounting")] };
    const back = parseDossierExport(JSON.parse(JSON.stringify(buildDossierExport(d))));
    expect(back.dossier.delegatedDecisions).toEqual(d.delegatedDecisions);
  });
});

describe("filtre d'encombrement partiel", () => {
  const envelopeFilter = (envelope: {
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
  }) => {
    const input = { mounting: { kind: "undecided" } as const, envelope };
    const filter = suggestionFilters(input).find((f) => f.id === "encombrement")!;
    return { filter, input };
  };

  test("une seule hauteur connue ne limite ni la longueur ni la largeur", () => {
    const { filter, input } = envelopeFilter({ lengthMm: null, widthMm: null, heightMm: 12 });
    const mk04 = sensorById("MK04")!;
    // MK04 est bien plus long que 12 mm : seule sa plus petite cote est contrainte.
    expect(passesFilter(mk04, filter, input)).toBe(true);
  });

  test("une hauteur trop faible écarte quand même le capteur", () => {
    const { filter, input } = envelopeFilter({ lengthMm: null, widthMm: null, heightMm: 0.5 });
    expect(passesFilter(sensorById("MK04")!, filter, input)).toBe(false);
  });

  test("trois cotes renseignées : comparaison complète, orientation la plus favorable", () => {
    const tiny = envelopeFilter({ lengthMm: 4, widthMm: 4, heightMm: 4 });
    const roomy = envelopeFilter({ lengthMm: 400, widthMm: 400, heightMm: 400 });
    const mk04 = sensorById("MK04")!;
    expect(passesFilter(mk04, tiny.filter, tiny.input)).toBe(false);
    expect(passesFilter(mk04, roomy.filter, roomy.input)).toBe(true);
  });

  test("aucune cote renseignée : aucun filtre d'encombrement", () => {
    const input = {
      mounting: { kind: "undecided" } as const,
      envelope: { lengthMm: null, widthMm: null, heightMm: null },
    };
    expect(suggestionFilters(input).some((f) => f.id === "encombrement")).toBe(false);
  });

  test("une place très généreuse partielle ne masque aucun capteur", () => {
    const { filter, input } = envelopeFilter({ lengthMm: 500, widthMm: null, heightMm: null });
    for (const model of SENSOR_CATALOG) expect(passesFilter(model, filter, input)).toBe(true);
  });
});

describe("checklist — complétude réelle et valeurs affichées", () => {
  const base = () => createDossier();

  test("les six questions traitées puis tout confié : aucune ligne artificielle à renseigner", () => {
    const d = {
      ...base(),
      delegatedDecisions: [
        ...GUIDED_QUESTION_KEYS.map((k) => delegatedQuestion(k)),
        DELEGATED_SENSOR,
        DELEGATED_MOUNTING,
        DELEGATED_CABLE,
        DELEGATED_CONNECTOR,
        DELEGATED_CONTEXT,
      ],
    };
    const items = projectChecklist(d);
    expect(items).toHaveLength(6);
    expect(items.filter((i) => i.state === "todo")).toEqual([]);
    /* Tout est traité, RIEN n'est validé techniquement. */
    expect(items.every((i) => i.state === "delegated")).toBe(true);
    expect(checklistProgress(items)).toEqual({ handled: 6, total: 6 });
    expect(d.mounting.kind).toBe("undecided");
    expect(d.selectedSensorId).toBeNull();
  });

  test("les choix structurés comptent comme réponses, sans texte libre", () => {
    const f = base();
    const d = {
      ...f,
      mounting: { kind: "screw" as const },
      envelope: { lengthMm: 30, widthMm: 20, heightMm: 10 },
      delegatedDecisions: GUIDED_QUESTION_KEYS.filter(
        (k) => k !== "mounting" && k !== "envelope",
      ).map((k) => delegatedQuestion(k)),
    };
    const besoin = projectChecklist(d as ReturnType<typeof base>).find((i) => i.id === "besoin")!;
    expect(besoin.state).toBe("chosen");
    expect(besoin.detail).toContain("2");
    expect(besoin.detail).not.toContain("question(s) traitée(s)");
  });

  test("la longueur retenue dans l'atelier est affichée chiffrée", () => {
    const f = base();
    const d = {
      ...f,
      workshop: { ...DEFAULT_WORKSHOP, cableLengthMm: 500 },
    };
    const cable = projectChecklist(d as ReturnType<typeof base>).find((i) => i.id === "cable")!;
    expect(cable.state).toBe("chosen");
    expect(cable.detail).toContain("500 mm");
  });

  test("la référence du connecteur choisi est affichée, y compris en référence libre", () => {
    const d = { ...base(), termination: freeReference("XHP-2") };
    const item = projectChecklist(d).find((i) => i.id === "connecteur")!;
    expect(item.state).toBe("chosen");
    expect(item.detail).toContain("XHP-2");
  });

  test("fils nus par défaut ne cochent rien, un choix explicite oui", () => {
    const implicit = projectChecklist(base()).find((i) => i.id === "connecteur")!;
    expect(implicit.state).toBe("todo");
    const explicit = projectChecklist({
      ...base(),
      delegatedDecisions: [CHOSEN_BARE_LEADS],
    }).find((i) => i.id === "connecteur")!;
    expect(explicit.state).toBe("chosen");
    expect(explicit.detail).toContain("Fils nus");
  });

  test("une délégation postérieure prime sur une préférence conservée", () => {
    const d = {
      ...base(),
      termination: freeReference("PHR-3"),
      cabling: { ...base().cabling, lengthChoice: "standard_to_confirm" as const },
      delegatedDecisions: [DELEGATED_CONNECTOR, DELEGATED_CABLE],
    };
    const items = projectChecklist(d);
    expect(items.find((i) => i.id === "connecteur")!.state).toBe("delegated");
    expect(items.find((i) => i.id === "cable")!.state).toBe("delegated");
    /* La préférence reste enregistrée dans le dossier, elle n'est pas effacée. */
    expect(d.termination).toEqual(freeReference("PHR-3"));
  });

  test("le couple réellement retenu est affiché quand il est connu", () => {
    const d = {
      ...base(),
      selectedSensorId: "MK04",
      workshop: { ...DEFAULT_WORKSHOP, sensorId: "MK04" },
    };
    const item = projectChecklist(d as ReturnType<typeof base>).find((i) => i.id === "capteur")!;
    expect(item.detail).toContain("MK04");
    expect(item.detail).toContain(DEFAULT_WORKSHOP.magnetModel);
    expect(item.detail).toContain("pas encore une référence commandable");
  });
});
