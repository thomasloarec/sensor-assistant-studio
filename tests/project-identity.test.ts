import { test, expect } from "bun:test";
import { INDUSTRIES, hasConfirmedIndustry } from "../src/lib/leadmagnet/industries";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import {
  identityInput,
  parseIdentityInput,
  parseProjectIdentity,
} from "../src/lib/leadmagnet/project-identity";
import {
  identityHandler,
  claudeProjectIdentity,
} from "../src/lib/leadmagnet/project-identity.server";
const dossier = createDossier();
dossier.requirements[0]!.value = "Détecter une trappe de recharge automobile";
const input = identityInput(dossier);
const output = {
  title: "Détection de trappe de recharge",
  industry: "Automotive",
  certainty: "clear",
  evidence: { key: "detection_goal", quote: "trappe de recharge automobile" },
};
test("21 Quickbase labels, Automotive spelling, explicit confirmation", () => {
  expect(new Set(INDUSTRIES).size).toBe(21);
  expect(INDUSTRIES).toContain("Automotive");
  expect(hasConfirmedIndustry({ industry: "Automative", industryConfirmed: true })).toBe(false);
  expect(hasConfirmedIndustry({ industry: "Automotive", industryConfirmed: false })).toBe(false);
  expect(hasConfirmedIndustry({ industry: "Automotive", industryConfirmed: true })).toBe(true);
});
test("only six bounded technical answers, never company/contact data or extra fields", () => {
  dossier.business.contactEmail = "secret@example.invalid";
  dossier.business.contactCompany = "Contract manufacturer";
  expect(JSON.stringify(identityInput(dossier))).not.toContain("secret");
  expect(JSON.stringify(identityInput(dossier))).not.toContain("Contract manufacturer");
  expect(parseIdentityInput({ ...input, company: "ignored" })).toEqual(input);
  expect(
    parseIdentityInput({
      ...input,
      answers: [...input.answers, { key: "extra", value: "x", state: "confirmed" }],
    }),
  ).toBeNull();
  expect(
    parseIdentityInput({
      ...input,
      answers: input.answers.map((a) => ({ ...a, value: "x".repeat(3001) })),
    }),
  ).toBeNull();
});
test("uncertain, unsupported or hallucinated evidence never preselects an industry", () => {
  expect(parseProjectIdentity(output, input)?.industry).toBe("Automotive");
  for (const patch of [
    { certainty: "uncertain" },
    { industry: "Unknown" },
    { evidence: { key: "detection_goal", quote: "medical pump" } },
  ])
    expect(parseProjectIdentity({ ...output, ...patch }, input)?.industry).toBeNull();
  expect(parseProjectIdentity({ ...output, title: "x".repeat(81) }, input)).toBeNull();
});
test("HTTP boundary rejects unauthorized origins, invalid bodies, missing config and rate overruns without calling Claude", async () => {
  let calls = 0;
  const deps = {
    origins: ["https://example.test"],
    configured: () => true,
    allow: async () => true,
    generate: async () => {
      calls++;
      return { title: "Valid title", industry: null };
    },
  };
  // Other UI suites install browser Request globals, which strip Origin.
  const request = (origin = "https://example.test", body: unknown = input) => ({
    method: "POST", headers: { get: (key: string) => key === "origin" ? origin : null },
    body: new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify(body))); controller.close();
    } }),
  }) as unknown as Request;
  expect((await identityHandler(deps)(request("https://bad.test"))).status).toBe(403);
  expect((await identityHandler(deps)(request(undefined, {}))).status).toBe(400);
  expect((await identityHandler({ ...deps, configured: () => false })(request())).status).toBe(503);
  expect((await identityHandler({ ...deps, allow: async () => false })(request())).status).toBe(
    429,
  );
  expect(
    (
      await identityHandler({
        ...deps,
        allow: async () => {
          throw Error("private data");
        },
      })(request())
    ).status,
  ).toBe(503);
  expect(calls).toBe(0);
  expect((await identityHandler(deps)(request())).status).toBe(200);
  expect(calls).toBe(1);
});
test("provider uses structured tool output and rejects truncation", async () => {
  let sent: any;
  const send = async (_: unknown, init: any) => {
    sent = JSON.parse(init.body);
    return Response.json({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", name: "project_identity", input: output }],
    });
  };
  expect(
    (await claudeProjectIdentity(input, "test-only", "test-model", send as typeof fetch))?.industry,
  ).toBe("Automotive");
  expect(sent.tool_choice.name).toBe("project_identity");
  expect(sent.messages[0].content).not.toContain("secret@example");
  expect(
    await claudeProjectIdentity(input, "test-only", "test-model", (async () =>
      Response.json({ stop_reason: "max_tokens", content: [] })) as typeof fetch),
  ).toBeNull();
});
