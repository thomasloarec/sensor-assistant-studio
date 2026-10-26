/** Recette 288835bc : « Aligner avec le capteur » dans le VRAI composant
 *  Workshop. L'alignement se fait à l'instant affiché et doit le conserver
 *  jusque dans la mutation centrale (machineChange → update), ainsi qu'en
 *  annulation/rétablissement. Démo paroi, aimant sur Plaque_volet (0/1/0). */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";

beforeAll(() => {
  if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });
});

// La scène WebGL n'est pas l'objet du test : elle est remplacée par un témoin.
mock.module("../src/components/standex/workshop/machine-scene", () => ({
  default: () => React.createElement("div", { "data-testid": "scene-stub" }),
}));
mock.module("@radix-ui/react-use-layout-effect", () => ({ useLayoutEffect: React.useLayoutEffect }));

const realFetch = globalThis.fetch;
beforeAll(() => {
  // Les démos intégrées sont lues depuis public/models, comme en vrai.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const m = /\/models\/([\w.-]+\.glb)/.exec(url);
    if (!m) throw new Error("fetch bloqué : " + url);
    const b = readFileSync("public/models/" + m[1]);
    return new Response(b, { status: 200, headers: { "content-type": "model/gltf-binary" } });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("Aligner l'aimant dans le Workshop intégré", () => {
  test("25 % conservé après alignement, annuler et rétablir ; suivi de la pièce à 0 puis 50 %", async () => {
    const { act, fireEvent, render, waitFor } = await import("@testing-library/react");
    const { setLocale } = await import("../src/lib/i18n/core");
    setLocale("fr");
    const { default: MagneticWorkshop } = await import("../src/components/standex/workshop/workshop");
    const { DEFAULT_WORKSHOP } = await import("../src/lib/standex/magnetic-workshop");
    const { DEMO_ASSEMBLIES } = await import("../src/lib/standex/machine-demos");
    const machine = {
      ...structuredClone(DEMO_ASSEMBLIES["builtin:wall-v1"]!),
      motionStatus: "confirmed" as const,
      magnetMount: "moving" as const,
      magnetAttach: {
        kind: "surface" as const,
        support: "moving" as const,
        partPath: "0/1/0",
        point: [18, 67, 22] as [number, number, number],
        normal: [0, 0, 1] as [number, number, number],
        offsetMm: 2,
        spinDeg: 35,
        flip: false,
        depthRef: "collar" as const,
        axisSource: "face" as const,
      },
    };
    const v = render(
      React.createElement(MagneticWorkshop, {
        initialConfig: { ...DEFAULT_WORKSHOP, machine },
        onClose: () => {},
        onSave: () => {},
      }),
    );
    await waitFor(() => expect(v.getByTestId("machine-guide")).toBeTruthy(), { timeout: 8000 });
    await act(async () => fireEvent.click(v.getByTestId("guide-step-install")));
    await act(async () => fireEvent.click(v.getByRole("radio", { name: "Aimant" })));
    const scrubber = () => v.getByLabelText("Position dans le cycle") as HTMLInputElement;
    await waitFor(() => expect(scrubber().disabled).toBe(false), { timeout: 8000 });
    const shift = () => {
      const text = v.getByTestId("guide-align-shift").textContent ?? "";
      return Number(/([\d.,]+)\s*mm/.exec(text)![1]!.replace(",", "."));
    };
    const point = () => v.getAllByTestId("guide-precise-point")[0]!.textContent ?? "";
    const seek = async (pct: number) => act(async () => fireEvent.change(scrubber(), { target: { value: String(pct) } }));

    await seek(25);
    expect(Number(scrubber().value)).toBe(25);
    expect(shift()).toBeCloseTo(38.64, 1);

    await act(async () => fireEvent.click(v.getByTestId("guide-align-magnet")));
    expect(Number(scrubber().value)).toBe(25);
    expect(shift()).toBeCloseTo(0, 2);
    expect(point()).toMatch(/X\s*[-−]20\b.*Y\s*60\b.*Z\s*22\b/);
    // Écart et rotation conservés (champs du guide).
    expect((v.getByTestId("guide-offset") as HTMLInputElement).defaultValue).toBe("2");
    expect(v.getByDisplayValue("35")).toBeTruthy();

    // Annuler puis rétablir : comparaison au même instant.
    await act(async () => fireEvent.click(v.getByRole("button", { name: "Annuler le dernier réglage" })));
    expect(Number(scrubber().value)).toBe(25);
    expect(shift()).toBeCloseTo(38.64, 1);
    await act(async () => fireEvent.click(v.getByRole("button", { name: "Rétablir" })));
    expect(Number(scrubber().value)).toBe(25);
    expect(shift()).toBeCloseTo(0, 2);

    // Retour volontaire à 0 puis 50 % : l'aimant suit la plaque (X −20 → +20 autour du capteur à X 0).
    await seek(0);
    expect(shift()).toBeCloseTo(20, 2);
    await seek(50);
    expect(shift()).toBeCloseTo(20, 2);
    await seek(25);
    expect(shift()).toBeCloseTo(0, 2);
    // Le point d'attache reste en pose statique.
    expect(point()).toMatch(/X\s*[-−]20\b/);
    v.unmount();
  }, 30000);
});
