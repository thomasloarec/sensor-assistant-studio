/** Deliberately closed vocabulary. No project text, filename, geometry or URL. */
export const USAGE_EVENTS = [
  "visit",
  "project_started",
  "question_viewed",
  "question_answered",
  "question_skipped",
  "suggestions_viewed",
  "suggestions_empty",
  "pair_selected",
  "workshop_opened",
  "workshop_ready",
  "workshop_active",
  "trial_started",
  "result_viewed",
  "result_unavailable",
  "import_clicked",
  "import_selected",
  "import_ready",
  "import_failed",
  "import_cancelled",
  "parts_defined",
  "motion_confirmed",
  "installation_completed",
  "contact_viewed",
  "submission_attempted",
  "submission_blocked",
  "submission_failed",
  "pdf_generated",
  "render_failed",
  "heartbeat",
] as const;
export type UsageEvent = (typeof USAGE_EVENTS)[number];
export type UsageSource = "basic" | "demo" | "personal";
export type UsageProps = {
  step?: number;
  source?: UsageSource;
  format?: "glb" | "step" | "other";
  size?: "small" | "medium" | "large";
  import_id?: string;
};
export type UsageEntry = UsageProps & {
  id: string;
  name: UsageEvent | "submission_pending" | "submission_confirmed" | "submission_expired";
  at: string;
  flow: string;
};
export type UsageSession = {
  id: string;
  visitor: string;
  started: string;
  last: string;
  events: UsageEntry[];
};
export type UsageReport = { now: string; since: string; sessions: UsageSession[] };
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function safeProps(raw: UsageProps): UsageProps {
  const p: UsageProps = {};
  if (Number.isInteger(raw.step) && raw.step! >= 1 && raw.step! <= 6) p.step = raw.step!;
  if (["basic", "demo", "personal"].includes(raw.source!)) p.source = raw.source!;
  if (["glb", "step", "other"].includes(raw.format!)) p.format = raw.format!;
  if (["small", "medium", "large"].includes(raw.size!)) p.size = raw.size!;
  if (raw.import_id && UUID.test(raw.import_id)) p.import_id = raw.import_id;
  return p;
}
export const FUNNELS = {
  global: [
    "project_started",
    "suggestions_viewed",
    "workshop_opened",
    "workshop_ready",
    "workshop_active",
    "trial_started",
    "result_viewed",
  ],
  questions: [
    "question_1",
    "question_2",
    "question_3",
    "question_4",
    "question_5",
    "question_6",
    "suggestions_viewed",
  ],
  import: [
    "import_clicked",
    "import_selected",
    "import_ready",
    "parts_defined",
    "motion_confirmed",
    "installation_completed",
    "trial_started",
  ],
  contact: ["contact_viewed", "submission_attempted", "submission_pending", "submission_confirmed"],
} as const;
export type UsageView = keyof typeof FUNNELS;
export function eventKey(e: UsageEntry): string {
  return e.name === "question_viewed" ? `question_${e.step}` : e.name;
}
/** Sequence is evaluated within one project and (for imports) one attempt, never across users. */
function reached(events: UsageEntry[], steps: readonly string[]): number {
  let n = 0;
  for (const e of events) {
    if (eventKey(e) === steps[n]) n++;
    // Authenticated submission has no pending-email state: server confirmation implies receipt.
    if (e.name === "submission_confirmed" && steps[n] === "submission_pending") n++;
    if (e.name === "submission_confirmed" && steps[n] === "submission_confirmed") n++;
  }
  return n;
}
export function summarizeUsage(report: UsageReport) {
  const counts: Record<string, Set<string>> = {};
  const funnel = Object.fromEntries(
    Object.entries(FUNNELS).map(([k, v]) => [k, v.map(() => new Set<string>())]),
  ) as Record<UsageView, Set<string>[]>;
  const stops: Record<string, number> = {
    questions: 0,
    suggestions: 0,
    workshop: 0,
    result: 0,
    contact: 0,
    pending: 0,
    expired: 0,
    submitted: 0,
  };
  const problems = [
    "result_unavailable",
    "import_failed",
    "submission_blocked",
    "submission_failed",
    "render_failed",
    "suggestions_empty",
  ] as const;
  const affected = Object.fromEntries(problems.map((k) => [k, new Set<string>()])) as Record<
    (typeof problems)[number],
    Set<string>
  >;
  const recovered = Object.fromEntries(problems.map((k) => [k, new Set<string>()])) as Record<
    (typeof problems)[number],
    Set<string>
  >;
  const direct = new Set<string>();
  let active = 0;
  for (const session of report.sessions) {
    const events = [...session.events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    for (const e of events) (counts[eventKey(e)] ??= new Set()).add(session.visitor);
    const flows = new Map<string, UsageEntry[]>();
    for (const e of events) {
      const a = flows.get(e.flow) ?? [];
      a.push(e);
      flows.set(e.flow, a);
    }
    for (const es of flows.values()) {
      for (const view of Object.keys(FUNNELS) as UsageView[]) {
        const groups =
          view === "import"
            ? [
                ...new Set(
                  es.filter((e) => e.source === "personal" && e.import_id).map((e) => e.import_id),
                ),
              ].map((id) => es.filter((e) => e.import_id === id && e.source === "personal"))
            : [es];
        for (const group of groups) {
          const n = reached(group, FUNNELS[view]);
          for (let i = 0; i < n; i++) funnel[view][i]!.add(session.visitor);
        }
      }
      const contact = es.findIndex((e) => e.name === "contact_viewed");
      if (contact >= 0 && !es.slice(0, contact).some((e) => e.name === "workshop_opened"))
        direct.add(session.visitor);
      for (const problem of problems) {
        const errors = es.filter((e) => e.name === problem);
        if (!errors.length) continue;
        affected[problem].add(session.visitor);
        const successes =
          problem === "import_failed"
            ? ["import_ready"]
            : problem === "render_failed"
              ? ["workshop_ready"]
              : problem.startsWith("submission_")
                ? ["submission_pending", "submission_confirmed"]
                : problem === "suggestions_empty"
                  ? ["suggestions_viewed"]
                  : [];
        if (
          errors.some((error) =>
            es.some(
              (e) =>
                successes.includes(e.name) &&
                Date.parse(e.at) >= Date.parse(error.at) &&
                (problem !== "import_failed" || e.import_id === error.import_id),
            ),
          )
        )
          recovered[problem].add(session.visitor);
      }
    }
    if (!events.some((e) => e.name === "project_started")) continue;
    if (Date.parse(report.now) - Date.parse(session.last) < 30 * 60_000) {
      active++;
      continue;
    }
    const lastFlow = events.filter((e) => e.name === "project_started").at(-1)?.flow;
    const es = events.filter((e) => e.flow === lastFlow);
    const stages: Record<string, string> = {
      project_started: "questions",
      question_viewed: "questions",
      question_answered: "questions",
      question_skipped: "questions",
      suggestions_viewed: "suggestions",
      suggestions_empty: "suggestions",
      workshop_opened: "workshop",
      workshop_active: "workshop",
      trial_started: "workshop",
      result_viewed: "result",
      contact_viewed: "contact",
      submission_attempted: "contact",
      submission_failed: "contact",
      submission_blocked: "contact",
      submission_pending: "pending",
      submission_expired: "expired",
      submission_confirmed: "submitted",
    };
    const key =
      es
        .map((e) => stages[e.name])
        .filter(Boolean)
        .at(-1) ?? "questions";
    stops[key]!++;
  }
  return {
    counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.size])),
    funnel: Object.fromEntries(
      Object.entries(funnel).map(([k, v]) => [k, v.map((s) => s.size)]),
    ) as Record<UsageView, number[]>,
    stops,
    active,
    direct: direct.size,
    problems: problems
      .map((name) => ({ name, count: affected[name].size, recovered: recovered[name].size }))
      .sort((a, b) => b.count - a.count),
  };
}
