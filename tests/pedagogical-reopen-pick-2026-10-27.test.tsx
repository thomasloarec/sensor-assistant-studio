/** Recette 86e8 : (1) réouverture/rechargement du bras animé sans recentrage
 *  des positions libres ; (2) le pointage réel (handlePick du guide) utilise
 *  les corps pilotes en mode pédagogique. VRAI composant Workshop, scène
 *  remplacée par un témoin qui expose les rappels qu'elle reçoit. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";

if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });

type Guide = { onPickPoint?: (hit: unknown) => void } | undefined;
const sceneProps: { guide: Guide } = { guide: undefined };
mock.module("../src/components/standex/workshop/machine-scene", () => ({
  default: (p: { guide?: Guide }) => {
    sceneProps.guide = p.guide;
    return React.createElement("div", { "data-testid": "scene-stub" });
  },
}));
mock.module("@radix-ui/react-use-layout-effect", () => ({ useLayoutEffect: React.useLayoutEffect }));

const realFetch = globalThis.fetch;
let fetches = 0;
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const m = /\/models\/([\w.-]+\.glb)/.exec(url);
    if (!m) throw new Error("fetch bloqué : " + url);
    fetches++;
    return new Response(readFileSync("public/models/" + m[1]), { status: 200, headers: { "content-type": "model/gltf-binary" } });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("Atelier pédagogique : reprise et pointage réels", () => {
  test("bras animé, positions libres reed [0,200,0] / aimant [6,206,0] à 25 % : démontage, réouverture et rechargement du GLB les conservent", async () => {
    const { setLocale } = await import("../src/lib/i18n/core");
    setLocale("fr");
    const { default: MagneticWorkshop } = await import("../src/components/standex/workshop/workshop");
    const { DEFAULT_WORKSHOP } = await import("../src/lib/standex/magnetic-workshop");
    const { DEMO_ASSEMBLIES } = await import("../src/lib/standex/machine-demos");
    const { DEFAULT_EXPERIMENT, evaluatePlacement } = await import("../src/lib/detection-lab/workshop-experiment");
    const { pedagogicalFrame } = await import("../src/lib/standex/pedagogical-poses");
    const machine = { ...structuredClone(DEMO_ASSEMBLIES["builtin:arm-v1"]!), sensorPosition: [0, 200, 0] as [number, number, number], magnetPosition: [6, 206, 0] as [number, number, number] };
    expect(machine.motionStatus).toBe("unset"); expect(machine.motionSource).toBe("clip"); expect(machine.movingNodes).toEqual([]);
    const draft0 = { config: { ...DEFAULT_WORKSHOP, sensorId: "GENERIC", mode: "education" as const, magnetModel: "generic", machine }, settings: { ...DEFAULT_EXPERIMENT }, progress: 0.25 };
    expect(evaluatePlacement(DEFAULT_EXPERIMENT, pedagogicalFrame(draft0.config, .25).pose, []).state).toBe("favorable");
    let draft: typeof draft0 | null = null;
    const mount = (d: typeof draft0) => render(React.createElement(MagneticWorkshop, { pedagogical: true, initialPedagogicalDraft: d, onPedagogicalDraftChange: (x: typeof draft0) => { draft = x; }, onClose: () => {}, onSave: () => {} }));
    for (let round = 0; round < 2; round++) {
      const before = fetches;
      const v = mount(round === 0 ? draft0 : draft!);
      await waitFor(() => expect(v.getByTestId("pedagogical-mounting").textContent).toContain("boîtes englobantes"), { timeout: 10000 });
      expect(fetches).toBeGreaterThan(before); // GLB really reloaded
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
      expect(draft!.config.machine!.sensorPosition).toEqual([0, 200, 0]);
      expect(draft!.config.machine!.magnetPosition).toEqual([6, 206, 0]);
      expect(draft!.progress).toBe(0.25);
      expect(draft!.settings).toEqual(DEFAULT_EXPERIMENT);
      v.unmount();
    }
  }, 40000);

  test("pointage « axe d'un trou (deux points) » du guide réel : corps pilotes, pas dimensions catalogue", async () => {
    const { default: MagneticWorkshop } = await import("../src/components/standex/workshop/workshop");
    const { DEFAULT_WORKSHOP } = await import("../src/lib/standex/magnetic-workshop");
    const { DEMO_ASSEMBLIES } = await import("../src/lib/standex/machine-demos");
    const { DEFAULT_EXPERIMENT } = await import("../src/lib/detection-lab/workshop-experiment");
    const { pilotBodies } = await import("../src/lib/standex/pedagogical-poses");
    const { handlePick, INITIAL_GUIDE } = await import("../src/components/standex/workshop/machine-guide");
    const machine = { ...structuredClone(DEMO_ASSEMBLIES["builtin:wall-v1"]!), motionStatus: "confirmed" as const };
    const config = { ...DEFAULT_WORKSHOP, sensorId: "MK24-A-J", mode: "education" as const, machine };
    let draft: { config: typeof config } | null = null;
    const v = render(React.createElement(MagneticWorkshop, { pedagogical: true, initialPedagogicalDraft: { config, settings: { ...DEFAULT_EXPERIMENT }, progress: 0 }, onPedagogicalDraftChange: (x: { config: typeof config }) => { draft = x; }, onClose: () => {}, onSave: () => {} }));
    await waitFor(() => expect(v.getByTestId("machine-guide")).toBeTruthy(), { timeout: 10000 });
    await act(async () => fireEvent.click(v.getByTestId("guide-step-install")));
    await act(async () => fireEvent.click(v.getByRole("radio", { name: "Capteur" })));
    await act(async () => fireEvent.click(v.getByRole("radio", { name: "À travers une paroi" })));
    await act(async () => fireEvent.click(v.getByRole("button", { name: "Axe d'un trou existant (deux points)", hidden: true })));
    const hits = [
      { point: [0, 60, -5] as [number, number, number], normal: [0, 0, -1] as [number, number, number], path: "0/0", moving: false, group: "" },
      { point: [0, 60, 5] as [number, number, number], normal: [0, 0, -1] as [number, number, number], path: "0/0", moving: false, group: "" },
    ];
    await act(async () => sceneProps.guide!.onPickPoint!(hits[0]));
    await act(async () => sceneProps.guide!.onPickPoint!(hits[1]));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    // Independent expectation from the same pure chain, with and without pilot bodies.
    const chain = (cfg: typeof config) => {
      const s0 = { ...INITIAL_GUIDE, pick: { purpose: "hole-points" as const, points: [] } };
      const r1 = handlePick(s0, machine, hits[0], cfg);
      return handlePick(r1.state, machine, hits[1], cfg).patch!;
    };
    const pilot = chain({ ...config, pilotBodies: pilotBodies("SMCO5-5X4")! } as typeof config), catalogue = chain(config);
    expect(pilot.sensorPosition).not.toEqual(catalogue.sensorPosition);
    expect(draft!.config.machine!.sensorAttach?.axisSource).toBe("two-points");
    expect(draft!.config.machine!.sensorPosition).toEqual(pilot.sensorPosition!);
    v.unmount();
  }, 40000);
});
