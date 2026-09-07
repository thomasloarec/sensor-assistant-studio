import { expect, test } from "bun:test";
import {
  buildApplicationDossier,
  buildDossierMarkdown,
} from "../src/lib/standex/application-dossier";
import { DEFAULT_WORKSHOP, serializeWorkshop } from "../src/lib/standex/magnetic-workshop";
import type { SensorTestSession, SensorTestMessage } from "../src/lib/standex/types";

const session: SensorTestSession = {
  id: "test-session",
  user_id: "test-user",
  created_at: "2026-09-07T10:00:00Z",
  updated_at: "2026-09-07T10:00:00Z",
  status: "draft",
  locale: "fr",
  channel: "lovable_test",
  prospect_name: null,
  prospect_company: null,
  prospect_email: null,
  prospect_phone: null,
  prospect_city: null,
  standex_city: null,
  volume_band: null,
  lead_potential: null,
  callback_commitment: "",
  consent_notes: null,
};
const message = (
  content: string,
  role: SensorTestMessage["role"] = "internal",
): SensorTestMessage => ({
  id: "test-note",
  session_id: session.id,
  created_at: session.created_at,
  role,
  content,
  turn_index: 0,
});
const dossier = (messages: SensorTestMessage[]) =>
  buildApplicationDossier({ session, messages, output: null, trace: null, reviews: [] });

test("the example adds documented context without filling real-machine requirements", () => {
  const before = dossier([]);
  const after = dossier([message(serializeWorkshop(DEFAULT_WORKSHOP))]);
  expect(after.fields).toEqual(before.fields);
  expect(after.missingCritical).toEqual(before.missingCritical);
  expect(after.productConfidence).toEqual(before.productConfidence);
  expect(after.routingConfidence).toEqual(before.routingConfidence);
  expect(after.reviewNotes).toEqual(before.reviewNotes);
  expect(after.workshopSummary).toContain("MK03-1A66B-500W + M02");
  const md = buildDossierMarkdown(after, { tester: "test" });
  expect(md).toContain("Montage exploré dans l'atelier magnétique");
  expect(md).toContain("Distances typiques");
  expect(md).not.toContain("STANDEX_MAGNETIC_WORKSHOP_V1");
});

test("the generic example preserves prospect requirements and exports its limitations", () => {
  const prospect = message(
    "Un aimant est prévu sur la porte de la machine, à 10 mm du capteur.",
    "prospect",
  );
  const before = dossier([prospect]);
  const after = dossier([
    prospect,
    message(serializeWorkshop({ ...DEFAULT_WORKSHOP, mode: "education", motion: "pivot" })),
  ]);
  expect(after.fields).toEqual(before.fields);
  expect(after.remainingQuestions).toEqual(before.remainingQuestions);
  expect(after.workshopSummary).toContain("non calibré");
  expect(after.workshopSummary).toContain("pivot");
});

test("ordinary and invalid internal notes leave legacy dossiers unchanged", () => {
  const before = dossier([]);
  const after = dossier([message("Note interne"), message("[STANDEX_MAGNETIC_WORKSHOP_V1]\n{}")]);
  expect(after).toEqual(before);
  expect(buildDossierMarkdown(after, { tester: "test" })).not.toContain(
    "Montage exploré dans l'atelier",
  );
});
