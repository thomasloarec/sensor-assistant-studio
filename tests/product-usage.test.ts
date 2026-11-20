import { describe, expect, test } from "bun:test";
import {
  safeProps,
  summarizeUsage,
  type UsageEntry,
  type UsageReport,
} from "../src/lib/usage/model";
const now = "2026-11-20T12:00:00Z";
function event(
  name: UsageEntry["name"],
  minute: number,
  extra: Partial<UsageEntry> = {},
): UsageEntry {
  return {
    id: crypto.randomUUID(),
    flow: "project-a",
    name,
    at: `2026-11-20T10:${String(minute).padStart(2, "0")}:00Z`,
    ...extra,
  };
}
function report(events: UsageEntry[]): UsageReport {
  return {
    now,
    since: "2026-11-14T00:00:00Z",
    sessions: [
      {
        id: "s1",
        visitor: "v1",
        started: "2026-11-20T10:00:00Z",
        last: "2026-11-20T10:40:00Z",
        events,
      },
    ],
  };
}
describe("usage aggregation", () => {
  test("counts people once, sequences require the same project and correct order", () => {
    const r = report([
      event("project_started", 0),
      event("suggestions_viewed", 1),
      event("workshop_opened", 2),
      event("workshop_ready", 3),
      event("workshop_active", 4),
      event("trial_started", 5),
      event("result_viewed", 6),
      event("trial_started", 7),
    ]);
    r.sessions.push({ ...r.sessions[0]!, id: "s2" });
    expect(summarizeUsage(r).counts.trial_started).toBe(1);
    expect(summarizeUsage(r).funnel.global).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(
      summarizeUsage(
        report([event("project_started", 0), event("suggestions_viewed", 1, { flow: "other" })]),
      ).funnel.global,
    ).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });
  test("does not splice stages of two different personal imports or demo models", () => {
    const events = [
      event("import_clicked", 1, { source: "personal", import_id: "a" }),
      event("import_selected", 2, { source: "personal", import_id: "b" }),
      event("import_ready", 3, { source: "demo", import_id: "a" }),
    ];
    expect(summarizeUsage(report(events)).funnel.import).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });
  test("a server-confirmed authenticated submission skips the optional email wait", () => {
    const r = report([
      event("project_started", 0),
      event("contact_viewed", 1),
      event("submission_attempted", 2),
      event("submission_confirmed", 3),
    ]);
    expect(summarizeUsage(r).funnel.contact).toEqual([1, 1, 1, 1]);
    expect(summarizeUsage(r).direct).toBe(1);
    expect(summarizeUsage(r).stops.submitted).toBe(1);
  });
  test("recent activity is not an abandonment and recovery must follow its failure", () => {
    const r = report([
      event("project_started", 0),
      event("import_ready", 1),
      event("import_failed", 2),
    ]);
    r.sessions[0]!.last = now;
    const s = summarizeUsage(r);
    expect(s.active).toBe(1);
    expect(s.stops.questions).toBe(0);
    expect(s.problems.find((p) => p.name === "import_failed")?.recovered).toBe(0);
  });
  test("drops private properties and invalid dimensions", () => {
    expect(
      safeProps({
        step: 9,
        source: "personal",
        fileName: "secret.glb",
        answer: "private",
        format: "glb",
      } as any),
    ).toEqual({ source: "personal", format: "glb" });
  });
  test("the stopping point follows the last visited stage, including a return to questions", () => {
    const s = summarizeUsage(
      report([
        event("project_started", 0),
        event("workshop_opened", 1),
        event("contact_viewed", 2),
        event("question_viewed", 3, { step: 2 }),
      ]),
    );
    expect(s.stops.questions).toBe(1);
    expect(s.stops.contact).toBe(0);
  });
  test("expired email verification is no longer shown as waiting", () => {
    const s = summarizeUsage(
      report([
        event("project_started", 0),
        event("submission_pending", 1),
        event("submission_expired", 2),
      ]),
    );
    expect(s.stops.expired).toBe(1);
    expect(s.stops.pending).toBe(0);
  });
});
