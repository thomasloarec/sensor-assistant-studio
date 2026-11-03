import { expect, test } from "bun:test";
import { requireTester } from "../src/lib/standex/experimental.server";

test("public customer accounts cannot invoke the internal paid AI endpoint", async () => {
  const previousFetch = globalThis.fetch;
  const previousAllowlist = process.env["STANDEX_TESTER_EMAILS"];
  process.env["STANDEX_TESTER_EMAILS"] = "tester@example.invalid";
  let current: Record<string, unknown> = {};
  globalThis.fetch = (async () => Response.json(current)) as typeof fetch;
  try {
    for (const user of [
      { email: "customer@example.invalid", email_confirmed_at: "2026-11-03" },
      { email: "tester@example.invalid", email_confirmed_at: null },
      { email: "tester@example.invalid", email_confirmed_at: "2026-11-03", is_anonymous: true },
    ]) {
      current = { id: "test-user", ...user };
      await expect(requireTester("synthetic-token")).rejects.toThrow("Accès réservé");
    }
    current = {
      id: "test-user",
      email: "tester@example.invalid",
      email_confirmed_at: "2026-11-03",
      is_anonymous: false,
    };
    expect((await requireTester("synthetic-token")).id).toBe("test-user");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousAllowlist === undefined) delete process.env["STANDEX_TESTER_EMAILS"];
    else process.env["STANDEX_TESTER_EMAILS"] = previousAllowlist;
  }
});
