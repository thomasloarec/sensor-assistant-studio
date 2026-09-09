/**
 * Fournisseur Anthropic : relance corrective UNIQUE quand le service renvoie
 * l'entrée au lieu d'une traduction (champ `text` au lieu de `en`).
 * Aucun appel réseau : `fetch` est remplacé le temps du test.
 */
import { describe, expect, it, afterEach } from "bun:test";

import { anthropicProvider } from "../src/lib/leadmagnet/english-report.server";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function reply(input: unknown) {
  return new Response(
    JSON.stringify({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", name: "traduction_anglaise", input }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const SEGMENTS = [{ id: "title", text: "Capot fermé" }];

describe("anthropicProvider", () => {
  it("relance une seule fois quand la réponse n'est pas une traduction", async () => {
    process.env["ANTHROPIC_API_KEY"] ||= "test-key";
    const bodies: string[] = [];
    let calls = 0;
    globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
      calls += 1;
      bodies.push(String(init.body));
      return calls === 1
        ? reply({ segments: [{ id: "title", text: "Capot fermé" }] })
        : reply({ segments: [{ id: "title", en: "Closed cover" }] });
    }) as unknown as typeof fetch;

    const out = (await anthropicProvider()!.translate(SEGMENTS)) as {
      segments: { id: string; en: string }[];
    };
    expect(calls).toBe(2);
    expect(out.segments[0]!.en).toBe("Closed cover");
    // La relance est explicitement corrective, et une seule fois.
    expect(bodies[0]).not.toContain("did not follow the tool schema");
    expect(bodies[1]).toContain("did not follow the tool schema");
  });

  it("n'appelle qu'une fois quand la réponse est déjà conforme", async () => {
    process.env["ANTHROPIC_API_KEY"] ||= "test-key";
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return reply({ segments: [{ id: "title", en: "Closed cover" }] });
    }) as unknown as typeof fetch;

    await anthropicProvider()!.translate(SEGMENTS);
    expect(calls).toBe(1);
  });

  it("ne transforme jamais un écho en traduction acceptée", async () => {
    process.env["ANTHROPIC_API_KEY"] ||= "test-key";
    globalThis.fetch = (async () =>
      reply({ segments: [{ id: "title", text: "Capot fermé" }] })) as unknown as typeof fetch;

    const out = (await anthropicProvider()!.translate(SEGMENTS)) as {
      segments: Record<string, unknown>[];
    };
    // La sortie non conforme est renvoyée telle quelle : c'est la validation
    // en aval qui refuse, elle n'est jamais assouplie ici.
    expect(out.segments[0]!["en"]).toBeUndefined();
  });
});
