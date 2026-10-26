/** Recette : dans l'atelier intégré (Workshop dans WorkspacePanel), Échap
 *  pendant « Centrer dans un trou » annule la sélection temporaire SANS fermer
 *  le panneau ; hors pointage, Échap ferme toujours le panneau. Ordre JSX :
 *  le bloc « Aligner avec le capteur » précède écart/rotation/retournement. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });

mock.module("../src/components/standex/workshop/machine-scene", () => ({
  default: () => React.createElement("div", { "data-testid": "scene-stub" }),
}));
mock.module("@radix-ui/react-use-layout-effect", () => ({ useLayoutEffect: React.useLayoutEffect }));

const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const m = /\/models\/([\w.-]+\.glb)/.exec(url);
    if (!m) throw new Error("fetch bloqué : " + url);
    return new Response(readFileSync("public/models/" + m[1]), { status: 200 });
  }) as typeof fetch;
});
afterEach(() => cleanup());
afterAll(() => {
  globalThis.fetch = realFetch;
});

async function mount() {
  const { setLocale } = await import("../src/lib/i18n/core");
  setLocale("fr");
  const { default: MagneticWorkshop } = await import("../src/components/standex/workshop/workshop");
  const { WorkspacePanel } = await import("../src/components/leadmagnet/workspace-panel");
  const { DEFAULT_WORKSHOP } = await import("../src/lib/standex/magnetic-workshop");
  const { DEMO_ASSEMBLIES } = await import("../src/lib/standex/machine-demos");
  const { defaultMagnetFor } = await import("../src/lib/standex/default-pairs");
  const closes: boolean[] = [];
  const machine = {
    ...structuredClone(DEMO_ASSEMBLIES["builtin:wall-v1"]!),
    motionStatus: "confirmed" as const,
    magnetMount: "moving" as const,
    magnetAttach: {
      kind: "surface" as const, support: "moving" as const, partPath: "0/1/0",
      point: [18, 67, 22] as [number, number, number], normal: [0, 0, 1] as [number, number, number],
      offsetMm: 2, spinDeg: 35, flip: false, depthRef: "collar" as const, axisSource: "face" as const,
    },
  };
  const v = render(
    React.createElement(
      WorkspacePanel,
      { open: true, onOpenChange: (o: boolean) => closes.push(o), title: "Atelier" },
      React.createElement(MagneticWorkshop, {
        initialConfig: {
          ...DEFAULT_WORKSHOP, mode: "reference", sensorId: "MK14",
          magnetModel: defaultMagnetFor("MK14"), machine,
        },
        onClose: () => {},
        onSave: () => {},
      }),
    ),
  );
  await waitFor(() => expect(v.getByTestId("machine-guide")).toBeTruthy(), { timeout: 15000 });
  await act(async () => fireEvent.click(v.getByTestId("guide-step-install")));
  return { v, closes };
}

describe("Échap dans l'atelier intégré", () => {
  test("annule le centrage sans fermer le panneau, puis ferme le panneau hors pointage", async () => {
    const { v, closes } = await mount();
    await act(async () => fireEvent.click(v.getByRole("radio", { name: "Capteur" })));
    const through = v.queryByRole("radio", { name: /travers une paroi/ });
    if (through) await act(async () => fireEvent.click(through));
    const btn = await waitFor(() => v.getByTestId("guide-hole-centre"));
    await act(async () => fireEvent.click(btn));
    expect(v.getByTestId("guide-hole-centre").textContent).toContain("Annuler le centrage");
    expect(v.queryByTestId("guide-hole-centre-steps")).toBeTruthy();
    // Événement réel depuis le corps : bubble document (panneau) puis window.
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => { document.body.dispatchEvent(ev); });
    expect(closes).toEqual([]);
    expect(ev.defaultPrevented).toBe(true);
    expect(v.getByTestId("guide-hole-centre").textContent).toContain("Centrer dans un trou");
    expect(v.queryByTestId("guide-hole-centre-steps")).toBeNull();
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(closes).toEqual([false]);
  }, 30000);

  test("« Aligner avec le capteur » précède écart, rotation et retournement", async () => {
    const { v } = await mount();
    await act(async () => fireEvent.click(v.getByRole("radio", { name: "Aimant" })));
    const attach = v.getByTestId("guide-attach");
    const align = v.getByTestId("guide-align");
    const offset = attach.querySelector('[data-testid="guide-offset"]') ?? v.getByText(/Écart entre face/);
    const flip = v.getByText("Retourner le composant");
    const before = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(align, offset)).toBe(true);
    expect(before(align, flip)).toBe(true);
    expect((v.getByTestId("guide-precise") as HTMLDetailsElement).open).toBe(false);
  }, 30000);
});
