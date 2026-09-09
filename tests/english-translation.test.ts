import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { createDossier, toClientDto } from "../src/lib/leadmagnet/dossier";
import { DEFAULT_WORKSHOP } from "../src/lib/standex/magnetic-workshop";
import { COFFEE_ASSEMBLY } from "../src/lib/standex/machine-assembly";
import {
  checkTranslation,
  collectSegments,
  englishReportBody,
  invariantTokens,
  parseProviderOutput,
  translateDossier,
  type Segment,
  type TranslationProvider,
} from "../src/lib/leadmagnet/english-translation";

/** Dossier réel, volontairement multilingue : fr + ru + ja dans la même session. */
function dto() {
  const d = createDossier("2026-09-08T08:00:00Z");
  d.title = "Détection de niveau — bac mobile";
  d.sourceLocale = "fr";
  d.freeConstraints = "Проверить зазор 2,5 mm при вибрации.";
  d.requirements = [
    {
      id: "r1",
      label: "Entrefer maximal",
      value: "2,5",
      unit: "mm",
      state: "confirmed",
      source: "client",
      note: "検出は MK24-A-J で確認すること。",
    },
    {
      id: "r2",
      label: "Température",
      value: "-40/+85",
      unit: "°C",
      state: "hypothesis",
      source: "client",
      note: null,
    },
  ] as never;
  d.openQuestions = ["Quelle épaisseur de paroi ?", "Какой материал корпуса?"];
  d.business.contactEmail = "thomas@standexelectronics.com";
  return toClientDto(d);
}

function provider(fn: (s: Segment[]) => unknown): TranslationProvider {
  return { producer: "test", translate: async (s) => fn(s) };
}

/** Traducteur idéal : renvoie l'anglais en conservant les jetons invariants. */
const perfect = provider((segments) => ({
  segments: segments.map((s) => ({ id: s.id, en: `EN ${s.text}` })),
}));

describe("segments réellement extraits", () => {
  it("prend tous les textes rédigés, quelle que soit la langue, et rien de vide", () => {
    const segments = collectSegments(dto());
    const ids = segments.map((s) => s.id);
    expect(ids).toContain("title");
    expect(ids).toContain("freeConstraints");
    expect(ids).toContain("req.0.note");
    expect(ids).toContain("question.1");
    expect(segments.every((s) => s.text.trim().length > 0)).toBe(true);
    // Un dossier peut mélanger les langues : rien n'est filtré sur sourceLocale.
    expect(segments.find((s) => s.id === "freeConstraints")?.text).toContain("зазор");
  });
});

describe("contrôle de la traduction", () => {
  it("repère références, nombres, e-mails et noms de fichiers", () => {
    const tokens = invariantTokens("MK24-A-J à 2,5 mm, plan.glb, thomas@standexelectronics.com");
    expect(tokens).toContain("MK24-A-J");
    expect(tokens).toContain("2,5");
    expect(tokens).toContain("plan.glb");
    expect(tokens).toContain("thomas@standexelectronics.com");
  });

  it("refuse une valeur perdue ou modifiée", () => {
    const src: Segment[] = [{ id: "a", text: "Entrefer 2,5 mm sur MK24-A-J" }];
    expect(checkTranslation(src, { a: "Air gap of about three millimetres" }).ok).toBe(false);
    expect(checkTranslation(src, { a: "Air gap 2,5 mm on MK24-A-J" }).ok).toBe(true);
  });

  it("refuse segment manquant, vide ou inattendu", () => {
    const src: Segment[] = [{ id: "a", text: "texte" }];
    expect(checkTranslation(src, {}).ok).toBe(false);
    expect(checkTranslation(src, { a: "   " }).ok).toBe(false);
    expect(checkTranslation(src, { a: "text", b: "inventé" }).ok).toBe(false);
  });

  it("refuse une sortie hors schéma", () => {
    expect(parseProviderOutput(null)).toBeNull();
    expect(parseProviderOutput({ segments: "x" })).toBeNull();
    expect(parseProviderOutput({ segments: [{ id: 1, en: "x" }] })).toBeNull();
    expect(parseProviderOutput({ segments: [{ id: "a", en: "x" }] })).toEqual({ a: "x" });
  });
});

describe("chaîne complète", () => {
  it("produit un rapport anglais sans jamais modifier l'original", () => {
    const source = dto();
    const before = JSON.stringify(source);
    return translateDossier(source, { revision: 3 }, perfect).then((r) => {
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(JSON.stringify(source)).toBe(before);
      expect(r.body).toContain("revision 3");
      expect(r.body).toContain("## Requirements");
      expect(r.body).toContain("EN Détection de niveau");
      expect(r.body).toContain("thomas@standexelectronics.com");
      expect(r.producer).toBe("test");
    });
  });

  it("échec fournisseur, réponse tronquée ou incomplète : jamais prêt", async () => {
    const boom = provider(() => {
      throw new Error("Délai dépassé pendant la traduction.");
    });
    expect((await translateDossier(dto(), { revision: 1 }, boom)).ok).toBe(false);

    const partial = provider((s) => ({ segments: s.slice(0, 1).map((x) => ({ id: x.id, en: "x" })) }));
    expect((await translateDossier(dto(), { revision: 1 }, partial)).ok).toBe(false);

    const junk = provider(() => ({ text: "Voici la traduction" }));
    const bad = await translateDossier(dto(), { revision: 1 }, junk);
    expect(bad.ok).toBe(false);
  });

  it("refuse un dossier hors limite plutôt que de le tronquer", async () => {
    const big = dto();
    big.freeConstraints = "x".repeat(9000);
    const r = await translateDossier(big, { revision: 1 }, perfect);
    expect(r.ok).toBe(false);
  });

  it("conserve l'état de connaissance dans le rapport", () => {
    const body = englishReportBody(dto(), { revision: 1 });
    expect(body).toContain("(confirmed)");
    expect(body).toContain("(assumption)");
    expect(body).toContain("unknown");
  });
});

describe("pipeline serveur 1.6", () => {
  const sql = readFileSync(
    "supabase/schema/migration_v1.6_english_report_pipeline.sql",
    "utf8",
  );

  it("vérifie droits, empreinte, NDA et consentement ai_assistant en base", () => {
    expect(sql).toContain("ai_assistant");
    expect(sql).toMatch(/CONTENT_HASH_MISMATCH/);
    expect(sql).toMatch(/NDA_NOT_IN_FORCE/);
  });

  it("réserve l'exécution au rôle serveur", () => {
    expect(sql).toMatch(/revoke all on function public\.lead_report_en_authorize/i);
    expect(sql).toMatch(/grant execute on function public\.lead_report_en_finalize.*service_role/i);
  });
});

describe("aucun secret ni appel côté client", () => {
  const client = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");
  const fn = readFileSync("src/lib/leadmagnet/english-report.functions.ts", "utf8");

  it("le navigateur n'appelle jamais le fournisseur ni ne porte de clé", () => {
    // Le nom du service est affiché au client par transparence, mais aucune clé,
    // aucun point d'accès et aucun appel direct n'existent dans le navigateur.
    expect(client).not.toMatch(/api\.anthropic\.com|ANTHROPIC_API_KEY|x-api-key/);
    expect(fn).not.toMatch(/api\.anthropic\.com|x-api-key/);
    const server = readFileSync("src/lib/leadmagnet/english-report.server.ts", "utf8");
    expect(server).toContain("api.anthropic.com");
    expect(server).not.toMatch(/VITE_|import\.meta\.env/);
  });

  it("la traduction n'est demandée qu'avec l'accord explicite lié à cette version", () => {
    expect(client).toContain('hasBoundConsent(privacy, "ai_assistant", bound)');
    expect(client).toContain('kind: "ai_assistant"');
  });
});

describe("contrôle lexical strict des jetons", () => {
  const src = (text: string): Segment[] => [{ id: "a", text }];
  const bad = (text: string, en: string) => expect(checkTranslation(src(text), { a: en }).ok).toBe(false);
  const good = (text: string, en: string) => expect(checkTranslation(src(text), { a: en }).ok).toBe(true);

  it("refuse un signe inversé, une unité changée ou un chiffre allongé", () => {
    bad("Plage -40/+85 °C", "Range +40/+85 °C");
    bad("Entrefer 2,5 mm", "Air gap 2,5 cm");
    bad("Course 5 mm", "Travel 50 mm");
  });

  it("refuse un nombre ajouté, supprimé ou dédoublonné", () => {
    bad("2 capteurs", "2 sensors over 3 years");
    bad("2 capteurs et 2 aimants", "2 sensors and magnets");
    bad("Longueur 300 mm", "Length");
  });

  it("accepte une vraie traduction fr/ja/ru conservant les valeurs", () => {
    good("Entrefer 2,5 mm sur MK24-A-J", "Air gap 2,5 mm on MK24-A-J");
    good("検出は MK24-A-J で 2,5 mm", "Detection with MK24-A-J at 2,5 mm");
    good("Зазор 2,5 mm, -40/+85 °C", "Gap 2,5 mm, -40/+85 °C");
  });

  it("refuse ids dupliqués, clés de prototype et sortie démesurée", () => {
    expect(parseProviderOutput({ segments: [{ id: "a", en: "x" }, { id: "a", en: "y" }] })).toBeNull();
    expect(parseProviderOutput({ segments: [{ id: "__proto__", en: "x" }] })).toBeNull();
    expect(
      parseProviderOutput({ segments: [{ id: "a", en: "x".repeat(200_000) }] }),
    ).toBeNull();
  });
});

/**
 * Fixture ciblée : montage 3D RÉELLEMENT enregistré + connecteur non qualifié
 * complètement décrit. On vérifie que le rapport anglais rend ces paramètres et
 * ces descriptions, et que l'original du client n'est pas modifié.
 */
describe("parité 3D et connecteur dans le rapport anglais", () => {
  function dtoWorkshopConnector() {
    const d = createDossier("2026-09-08T08:00:00Z");
    d.title = "Banc de détection";
    d.workshop = {
      ...DEFAULT_WORKSHOP,
      sensorId: "MK24-A-J",
      motion: "slide",
      travel: 42,
      span: 120,
      magnetization: "diametral",
      polarity: -1,
      ferromagnetic: true,
      machine: { ...COFFEE_ASSEMBLY },
    };
    d.workshopSource = "example";
    d.termination = {
      kind: "unqualified_connector",
      status: "to_verify_by_rnd",
      spec: {
        manufacturer: "JST",
        mpn: "XHP-2",
        mating: "B2B-XH-A",
        gender: "female",
        positions: 2,
        pinout: "Broche 1 : signal, broche 2 : retour",
        wireGauge: "Fil souple торон 26 AWG",
        cable: "Câble blindé 2 conducteurs",
        conditions: "Sertissage à valider par le BE",
        note: "Base documentée, jamais qualifiée Standex",
        wireRangeHint: "Plage de fils admissible 22 à 30 AWG",
        contactMpn: "SXH-001T-P0.6",
        pitchMm: 2.5,
        sourceUrl: "https://www.jst-mfg.com/product/pdf/eng/eXH.pdf",
        sourcePages: [1],
      },
    } as never;
    return toClientDto(d);
  }

  it("les paramètres du montage enregistré sortent en anglais", () => {
    const body = englishReportBody(dtoWorkshopConnector(), { revision: 3 });
    expect(body).toContain("Recorded 3D parameters");
    expect(body).toContain("educational model, not a physical validation");
    expect(body).toContain("lateral slide");
    expect(body).toContain("travel: 42 mm");
    expect(body).toContain("span: 120°");
    expect(body).toContain("Magnetization: diametral");
    expect(body).toContain("S towards the sensor");
    expect(body).toContain("Ferromagnetic environment: yes");
    expect(body).toContain(COFFEE_ASSEMBLY.fileName);
    expect(body).toContain(COFFEE_ASSEMBLY.movingNode);
    expect(body).not.toContain("undefined");
  });

  it("aucun paramètre fabriqué quand rien n'est enregistré", () => {
    const body = englishReportBody(dto(), { revision: 1 });
    expect(body).toContain("Recorded 3D parameters: none");
  });

  it("les champs descriptifs du connecteur sont traduits, les références intactes", async () => {
    const source = dtoWorkshopConnector();
    const segments = collectSegments(source);
    const ids = segments.map((s) => s.id);
    expect(ids).toContain("termination.wireGauge");
    expect(ids).toContain("termination.cable");
    expect(ids).toContain("termination.note");
    expect(ids).toContain("termination.wireRangeHint");
    // `mating` est une référence exacte : jamais envoyée à la traduction.
    expect(ids).not.toContain("termination.mating");

    const provider: TranslationProvider = {
      producer: "test",
      translate: async (segs) => ({
        segments: segs.map((s) => ({ id: s.id, en: "EN " + s.text })),
      }),
    };
    const out = await translateDossier(source, { revision: 3 }, provider);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.body).toContain("Wire gauge: EN Fil souple торон 26 AWG");
    expect(out.body).toContain("Cable: EN Câble blindé 2 conducteurs");
    expect(out.body).toContain("Wire range: EN Plage de fils admissible 22 à 30 AWG");
    expect(out.body).toContain("Note: EN Base documentée");
    expect(out.body).toContain("Mating part (exact reference, not translated): B2B-XH-A");
    expect(out.body).toContain("Contact part number: SXH-001T-P0.6");
    expect(out.body).toContain("Pitch: 2.5 mm");
    expect(out.body).toContain("Gender: female");
    // Original inchangé.
    expect(source.termination.kind).toBe("unqualified_connector");
    if (source.termination.kind === "unqualified_connector") {
      expect(source.termination.spec.wireGauge).toBe("Fil souple торон 26 AWG");
      expect(source.termination.spec.mating).toBe("B2B-XH-A");
    }
  });

  it("combinaison qualifiée : MPN capteur et source rendus", () => {
    const d = createDossier("2026-09-08T08:00:00Z");
    d.termination = {
      kind: "qualified_connector",
      combo: {
        id: "combo-1",
        sensorMpn: "MK24-A-J",
        source: "Standex datasheet 02/2019",
        connector: {
          manufacturer: "JST",
          mpn: "PHR-2",
          mating: "B2B-PH-K-S",
          gender: "female",
          positions: 2,
          pinout: null,
          wireGauge: null,
          cable: null,
          conditions: null,
        },
      },
    } as never;
    const body = englishReportBody(toClientDto(d), { revision: 1 });
    expect(body).toContain("Sensor part number of the combination: MK24-A-J");
    expect(body).toContain("Combination source: Standex datasheet 02/2019");
    expect(body).toContain("Qualified combination: combo-1");
  });
});

describe("jetons invariants : unités collées, ajouts refusés", () => {
  it("0.35A → 0.35mA est refusé", () => {
    const seg: Segment[] = [{ id: "a", text: "Courant de commutation 0.35A maximum." }];
    expect(checkTranslation(seg, { a: "Switching current 0.35mA maximum." }).ok).toBe(false);
    expect(checkTranslation(seg, { a: "Switching current 0.35A maximum." }).ok).toBe(true);
  });

  it("unités sans espace reconnues, ponctuation finale sans effet", () => {
    expect(invariantTokens("Longueur 300mm.")).toContain("300 mm");
    expect(invariantTokens("Entrefer 2,5 mm,")).toContain("2,5 mm");
    expect(invariantTokens("Course 42mm, puis 5 mm.")).toEqual([
      "42",
      "42 mm",
      "5",
      "5 mm",
    ]);
  });

  it("référence, e-mail ou fichier AJOUTÉ ou dupliqué est refusé", () => {
    const ref: Segment[] = [{ id: "a", text: "Utiliser MK24-A-J." }];
    expect(checkTranslation(ref, { a: "Use MK24-A-J." }).ok).toBe(true);
    expect(checkTranslation(ref, { a: "Use MK24-A-J (MK24-A-J)." }).ok).toBe(false);
    expect(checkTranslation(ref, { a: "Use MK24-A-J and MK03." }).ok).toBe(false);

    const mail: Segment[] = [{ id: "a", text: "Écrire à thomas@standexelectronics.com." }];
    expect(
      checkTranslation(mail, {
        a: "Write to thomas@standexelectronics.com or sales@standexelectronics.com.",
      }).ok,
    ).toBe(false);

    const file: Segment[] = [{ id: "a", text: "Voir plan.pdf." }];
    expect(checkTranslation(file, { a: "See plan.pdf and plan.step." }).ok).toBe(false);
    expect(checkTranslation(file, { a: "See plan.pdf." }).ok).toBe(true);
  });
});
