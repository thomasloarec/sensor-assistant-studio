import { describe, expect, it } from "vitest";
import {
  EXTERNAL_TRANSLATION_ENABLED,
  externalTranslationAllowed,
  stripDisabledConsents,
} from "@/lib/leadmagnet/external-translation";
import { INITIAL_PRIVACY, grantConsent } from "@/lib/leadmagnet/privacy";
import { emptyDossier } from "@/lib/leadmagnet/dossier";
import { submissionSummary } from "@/lib/leadmagnet/submission";
import { CHOSEN_BARE_LEADS, DELEGATED_CONNECTOR } from "@/lib/leadmagnet/project-checklist";
import { readFileSync } from "node:fs";

const binding = { contentHash: "hash-1", revisionLabel: "r1" } as never;

describe("traduction externe coupée", () => {
  it("le drapeau est désactivé et aucune autorisation ne peut passer", () => {
    expect(EXTERNAL_TRANSLATION_ENABLED).toBe(false);
    expect(externalTranslationAllowed(true)).toBe(false);
    expect(externalTranslationAllowed(false)).toBe(false);
  });

  it("retire un accord de traduction restauré ou importé", () => {
    const withConsent = grantConsent(INITIAL_PRIVACY, {
      kind: "ai_assistant",
      contentSummary: "textes",
      recipients: ["service externe"],
      binding,
    });
    expect(withConsent.consents.some((c) => c.kind === "ai_assistant")).toBe(true);
    expect(stripDisabledConsents(withConsent).consents.some((c) => c.kind === "ai_assistant")).toBe(
      false,
    );
  });

  it("l'écran client n'affiche plus la case ni les détails de traduction externe", () => {
    const source = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");
    expect(source).not.toContain("J'autorise la traduction en anglais par un service externe");
    expect(source).not.toContain("Version anglaise prête pour cette version");
    expect(source).not.toContain("Réglages détaillés");
  });
});

describe("choix connecteur « pas besoin »", () => {
  const base = () => ({ ...emptyDossier(), selectedSensorId: "MK03" });

  it("est repris dans le résumé comme choix volontaire", () => {
    const summary = submissionSummary({
      ...base(),
      delegatedDecisions: [CHOSEN_BARE_LEADS],
    });
    expect(summary).toContain("pas de connecteur");
  });

  it("reste distinct d'une délégation à Standex", () => {
    const summary = submissionSummary({
      ...base(),
      delegatedDecisions: [DELEGATED_CONNECTOR],
    });
    expect(summary).not.toContain("Choix du client : pas de connecteur");
  });

  it("ne s'affiche pas pour un dossier neuf resté au défaut", () => {
    expect(submissionSummary(base())).not.toContain("Choix du client : pas de connecteur");
  });
});
