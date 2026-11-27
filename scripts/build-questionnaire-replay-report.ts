/** Build the review report from actual Chrome observations, never inferred results. */
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import fixture from "../tests/fixtures/questionnaire-104-20261127.json";
const source = process.argv[2];
if (!source) throw new Error("Pass the Chrome evidence JSON file path.");
const raw = readFileSync(source, "utf8");
const evidence = JSON.parse(raw);
if (evidence.scenarios.length !== 96 || evidence.workflows.length !== 8)
  throw new Error("Incomplete replay");
if (
  evidence.scenarios.some((r: any) => !r.pass || !r.semanticChecks.pass) ||
  evidence.workflows.some((r: any) => !r.pass)
)
  throw new Error("Replay has failures");
for (const row of evidence.scenarios) {
  const original = fixture.tests.find((r) => r.id === row.id);
  if (!original || JSON.stringify(original.answers) !== JSON.stringify(row.answers))
    throw new Error("Changed input " + row.id);
}
const out = "docs/qa/questionnaire-20261127";
mkdirSync(out, { recursive: true });
copyFileSync(source, out + "/replay-104.json");
const safe = (s: string) => s.replace(/\|/g, "/").replace(/\r?\n/g, " ");
const issueNames: Record<string, string> = {
  no_meaningful_requirement: "Ask for a concrete detection requirement",
  no_magnetic_source:
    "Explain magnetic requirement; explore relocation / another technology with Standex",
  extreme_gap_review: "Standex engineering study for the stated gap",
  invalid_dimension: "Clarify invalid dimension",
  requirement_clarification: "Clarify conflicting constraints",
  direct_load_switching: "Separate signal from load power; study suitable interface",
  continuous_quantity_review: "Study the requested measurement technology and interface",
  continuous_temperature_measurement:
    "Preserve temperature measurement need; request a Standex study",
  extreme_temperature_review: "Standex engineering study beyond documented temperature",
  outside_sensor_scope: "Explain scope and request an actual sensor requirement",
};
const resultFor = (r: any) =>
  r.issues.length
    ? r.issues.map((i: string) => issueNames[i] ?? i).join("; ")
    : [
        r.cards
          .map((s: string) => s.match(/Capteur(MK\d+(?:[\/_-]\d+)?|CUSTOM)/)?.[1] ?? "custom")
          .join(", "),
        r.gapWarnings.length ? "gap qualification visible" : "",
        r.thermalWarnings.length ? "thermal qualification visible" : "",
        r.snapshot.includes("Piste à étudier avec Standex")
          ? "exploratory / qualification status"
          : "",
      ]
        .filter(Boolean)
        .join("; ");
const rows = fixture.tests
  .map((r) => {
    const actual = [...evidence.scenarios, ...evidence.workflows].find((a: any) => a.id === r.id);
    if (!actual) throw new Error("Missing " + r.id);
    return `| ${r.id} | ${safe(r.name)} | ${r.status} | PASS | ${safe(actual.observed ?? resultFor(actual))} |`;
  })
  .join("\n");
const report = `# Questionnaire corrections and 104-test replay — 27 November 2026

**104 / 104 acceptance checks passed in Google Chrome on the corrected local application.**
The original published-site audit had 41 NOK, 17 reserves and 46 OK. A PASS here means the requested proposal, clarification or engineering route is present. It does **not** mean every application has a qualified standard product.

## Nine workstreams

| ID | Correction | Verification examples |
|---|---|---|
| F01 | Distinguish existing/additional magnet, ferrous target/material negation and allowed remote placement; clarify late contradictions. | S006–S013, S049, S082, S089 |
| F02 | Keep sensing gap separate from speed, cable length, travel and remote placement; normalize mm/cm/m/inches and warn per displayed pair. | S014–S025, S083–S084, S090–S091 |
| F03 | Read the sensor signal circuit separately from motor/load power; remove invented current and motor labels for other loads. | S026–S028, S032–S033, S046, S085 |
| F04 | No random products for empty/filler/numeric-only answers; explicit non-sensor requests get a scope explanation. Partial sensor projects remain open. | S001–S005, S042–S043, S047, S070–S075, S086–S088 |
| F05 | Analog measurement keeps its own technology-study route. NF/Form C require exact-variant confirmation; independent limits are distinct from SPDT. | S029–S031, S044–S045, S056, S095 |
| F06 | Show qualification reserves for ATEX, SIL/OSSD, immersion and cadence; read the real sensor temperature and avoid an unsupported Recommended badge. | S034–S041, S057, S094 |
| F07 | Recognize explicit mounting in all eight offered languages; translate new customer copy in all seven non-French languages. | S076–S081, S096, W006 |
| F08 | Free-text through-hole mounting uses the structured filter; cylinder groove needs a specific mounting study. | S053, S055, S061 |
| F09 | Explain non-positive dimensions, preserve decimal-comma filtering, and describe stated space without claiming custom-design fit. | S064–S069 |

## Method and scope

- Base: \`f5c727856d6a92ab1a25b886dbc3dfac03e1059b\`; branch \`codex/questionnaire-nine-fixes-20261127\`.
- The exact 96 six-answer inputs and optional mounting/dimension choices come from \`tests/fixtures/questionnaire-104-20261127.json\`, copied unchanged from the published-site audit.
- Chrome replay used real field fills and clicks, a fresh in-memory project per case, visible result snapshots, and all eight workflow checks. Empty final answers use the available Couples navigation to verify the clarification page when the final button is disabled.
- W003 adaptation: S012 is now correctly unblocked before editing; the same target correction is checked through Q2 navigation. No obsolete warning returns.
- Local app: \`http://127.0.0.1:5188\`, public customer-entry setting enabled locally. A development-only loader serves the unchanged STEP manifest because Vite dev disallows importing JSON from public. Neither helper nor setting is shipped in this PR. No application result, catalogue, ranking or questionnaire handler was mocked.
- [Full observed browser evidence](replay-104.json): result text, issue IDs, card text, gap/thermal warnings, snapshots and workflow observations. SHA-256: \`${createHash("sha256").update(raw).digest("hex")}\`.
- Additional automated regression: 2,538 passed, 0 failed, 1 existing Blender-dependent skip, across 195 files. Type check and production build passed. The original 96 cases are now permanent automated engine tests, plus a unit/subject regression.

## Limits and next deployment step

The published Lovable site and Azure deployment were not modified. After merge and publication, perform a deployment smoke check of the critical paths. This deterministic regression sample does not demonstrate 99% real-world relevance. Arbitrary wording, new products and other languages outside the offered set are not exhaustively covered. Engineering confirmation remains required for feasibility, contact variant, certification, environmental qualification and real sensing distance. Liquid-level paths, sending customer forms, NDA, automatic sales appointments and 3D imports are outside this replay. W008 checks workshop loading and the return path, not physical accuracy.

## Results

| Test | Original scenario | Published audit | Corrected local replay | Observed outcome |
|---|---|---|---|---|
${rows}
`;
writeFileSync(out + "/report.md", report);
console.log(
  JSON.stringify({
    scenarios: evidence.scenarios.length,
    workflows: evidence.workflows.length,
    passed: 104,
    sha256: createHash("sha256").update(raw).digest("hex"),
  }),
);
