import { test, expect } from "bun:test";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { hasConfirmedIndustry } from "../src/lib/leadmagnet/industries";
import { INITIAL_NDA } from "../src/lib/leadmagnet/nda";
import { INITIAL_PRIVACY, grantConsent } from "../src/lib/leadmagnet/privacy";
import { buildSnapshot, checkSubmission, submissionBinding, type SubmissionInput } from "../src/lib/leadmagnet/submission";
import { projectReportSections } from "../src/lib/leadmagnet/project-report";
import { t } from "../src/lib/i18n/core";

async function prefilledSubmission(): Promise<SubmissionInput> {
  const dossier = createDossier();
  dossier.business = {
    ...dossier.business,
    industry: "Industrial Applications",
    industrySource: "ai",
    industryConfirmed: false,
    contactEmail: "prospect@example.invalid",
    siteCountry: "FR",
    siteCity: "Lyon",
    undefinedFields: ["annualVolume", "projectPhase", "seriesStartDate", "seriesDurationYears"],
  };
  const input: SubmissionInput = {
    dossier, nda: INITIAL_NDA, consents: [], reviewAcknowledged: false, additionalConstraints: "",
  };
  input.consents = grantConsent(INITIAL_PRIVACY, {
    kind: "supabase_dossier", contentSummary: "project", recipients: ["Standex"],
    binding: await submissionBinding(input),
  }).consents;
  return input;
}

test("sending accepts a prefilled industry in the consent-bound snapshot without changing the draft", async () => {
  const input = await prefilledSubmission();
  expect(await checkSubmission(input)).toEqual({ ok: true });
  const snapshot = await buildSnapshot(input);
  expect(hasConfirmedIndustry(snapshot.dto.business)).toBe(true);
  expect(snapshot.dto.business.industry).toBe("Industrial Applications");
  expect(snapshot.dto.business.industrySource).toBe("ai");
  expect(snapshot.hash).toBe((await submissionBinding(input)).contentHash);
  expect(input.dossier.business.industryConfirmed).toBe(false);

  input.dossier.business.industry = "Medical";
  expect((await checkSubmission(input)).ok).toBe(false);
  expect(snapshot.dto.business.industry).toBe("Industrial Applications");
});

test("an empty or invalid industry still blocks sending even with an old confirmation flag", async () => {
  for (const industry of [null, "Automative"]) {
    const input = await prefilledSubmission();
    Object.assign(input.dossier.business, { industry, industryConfirmed: true });
    const result = await checkSubmission(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain("Choisissez une industrie.");
    expect(hasConfirmedIndustry((await buildSnapshot(input)).dto.business)).toBe(false);
  }
});

test("readable industry follows report language while the submitted value stays canonical", async () => {
  const input = await prefilledSubmission();
  const entries = (locale: "fr" | "de" | "en") =>
    projectReportSections(input.dossier, {}, s => t(s, locale)).flatMap(section => section.entries);
  expect(entries("fr")).toContainEqual({ label: "Industrie", value: "Applications industrielles" });
  expect(entries("de").some(entry => entry.value === "Industrielle Anwendungen")).toBe(true);
  expect(entries("en").some(entry => entry.value === "Industrial Applications")).toBe(true);
  expect((await buildSnapshot(input)).dto.business.industry).toBe("Industrial Applications");
});
