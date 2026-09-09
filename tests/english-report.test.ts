import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  canExportEnglish,
  selectEnglishReport,
  type EnglishReportRow,
} from "../src/lib/leadmagnet/english-report";

const revision = { id: "rev-1", content_hash: "a".repeat(64) };

function row(over: Partial<EnglishReportRow> = {}): EnglishReportRow {
  return {
    id: "r1",
    revision_id: revision.id,
    content_hash: revision.content_hash,
    state: "ready",
    origin: "human_translation",
    producer: "T. Loarec",
    source_locale: "fr",
    body_en: "Sensor design summary in English.",
    produced_at: "2026-09-08T10:00:00Z",
    ...over,
  };
}

describe("version anglaise du rapport", () => {
  it("aucune ligne : rien n'est présenté comme anglais", () => {
    expect(selectEnglishReport([], revision)).toEqual({ kind: "missing" });
    expect(selectEnglishReport(undefined, revision)).toEqual({ kind: "missing" });
    expect(canExportEnglish(selectEnglishReport([], revision))).toBe(false);
  });

  it("liaison à la révision ET à l'empreinte exactes", () => {
    const ok = selectEnglishReport([row()], revision);
    expect(ok.kind).toBe("ready");
    if (ok.kind === "ready") expect(ok.body).toContain("English");
    expect(canExportEnglish(ok)).toBe(true);

    const otherRevision = selectEnglishReport([row({ revision_id: "rev-2" })], revision);
    expect(otherRevision).toEqual({ kind: "missing" });
  });

  it("mauvaise empreinte : jamais affichée comme actuelle", () => {
    const stale = selectEnglishReport([row({ content_hash: "b".repeat(64) })], revision);
    expect(stale.kind).toBe("stale");
    expect(canExportEnglish(stale)).toBe(false);
  });

  it("état en attente : pas de texte, pas d'export", () => {
    const pending = selectEnglishReport([row({ state: "pending", body_en: null })], revision);
    expect(pending).toEqual({ kind: "pending" });
    expect(canExportEnglish(pending)).toBe(false);
  });

  it("faux « prêt » refusé : texte vide ou origine absente", () => {
    expect(selectEnglishReport([row({ body_en: "   " })], revision).kind).toBe("invalid");
    expect(selectEnglishReport([row({ origin: null })], revision).kind).toBe("invalid");
    expect(selectEnglishReport([row({ origin: "invented" })], revision).kind).toBe("invalid");
    expect(selectEnglishReport([row({ state: "approved" })], revision).kind).toBe("invalid");
  });
});

describe("migration additive 1.5", () => {
  const sql = readFileSync("supabase/schema/migration_v1.5_english_report.sql", "utf8");

  it("réserve l'écriture au rôle serveur et n'ouvre aucune RPC publique d'écriture", () => {
    expect(sql).toContain("grant select, insert, update on table lead.revision_reports_en to service_role");
    expect(sql).toContain("revoke all on table lead.revision_reports_en from public, anon, authenticated");
    expect(sql).not.toMatch(/create or replace function public\.lead_(set|upsert|publish)_report/);
  });

  it("interdit un « prêt » sans texte, sans origine ni empreinte réelle", () => {
    expect(sql).toContain("revision_reports_en_ready_is_real");
    expect(sql).toContain("references lead.design_revisions(id, content_hash)");
    expect(sql).toContain("unique (revision_id, content_hash)");
  });

  it("n'ajoute ni backfill ni fournisseur externe", () => {
    expect(sql).not.toMatch(/insert into lead\.revision_reports_en/i);
    expect(sql).not.toMatch(/anthropic|openai|https?:\/\//i);
  });

  it("laisse la vue cliente et l'original intacts", () => {
    expect(sql).not.toContain("create or replace function lead_priv.client_view");
    expect(sql).not.toMatch(/update lead\.design_revisions/i);
  });
});

describe("console équipe", () => {
  const ui = readFileSync("src/routes/standex.tsx", "utf8");

  it("ouvre en anglais et garde l'accès à l'original", () => {
    expect(ui).toContain('useState<"en" | "original">("en")');
    expect(ui).toContain("Original du client");
  });

  it("conditionne l'export à une version anglaise valide", () => {
    expect(ui).toContain("disabled={!canExportEnglish(english)}");
  });
});

describe("lecture équipe et verrou de relance", () => {
  const staff = readFileSync("src/routes/standex.tsx", "utf8");
  const client = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");

  it("chaque ouverture de dossier repart en anglais", () => {
    const select = staff.slice(staff.indexOf("modelRequest.current += 1;"));
    expect(select.slice(0, 400)).toContain('setReportView("en")');
  });

  it("la bascule vers l'original reste disponible pendant la consultation", () => {
    expect(staff).toContain('setReportView("original")');
  });

  it("la relance passe par le verrou par génération, invalidé aux changements de contexte", () => {
    // Le comportement réel est prouvé dans tests/english-run-lock.test.ts ;
    // ici on vérifie seulement que l'écran utilise bien ce verrou.
    expect(client).toContain("englishLockRef.current.start()");
    expect(client).toContain("resetEnglishReport();");
    expect(client).toContain("return () => lock.invalidate();");
    expect(client).toContain("disabled={busy || englishBusy}");
    expect(client).not.toContain("englishRunRef");
  });

  it("le partage du fichier 3D passe par le dictionnaire", () => {
    expect(client).not.toContain("Je partage aussi le fichier 3D « ${");
    expect(client).toContain('msg("Je partage aussi le fichier 3D « {0} » avec l\'équipe en charge."');
  });
});
