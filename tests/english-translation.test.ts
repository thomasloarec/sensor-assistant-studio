import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { createDossier, toClientDto } from "../src/lib/leadmagnet/dossier";
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
    expect(fn).not.toMatch(/api\.anthropic\.com|ANTHROPIC_API_KEY/);
    const server = readFileSync("src/lib/leadmagnet/english-report.server.ts", "utf8");
    expect(server).toContain("api.anthropic.com");
    expect(server).not.toMatch(/VITE_|import\.meta\.env/);
  });

  it("la traduction n'est demandée qu'avec l'accord explicite lié à cette version", () => {
    expect(client).toContain('hasBoundConsent(privacy, "ai_assistant", bound)');
    expect(client).toContain('kind: "ai_assistant"');
  });
});
