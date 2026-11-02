/** Real Workshop regression: face-constrained C1% placement, history, shared
 * playback controls and refusal without mutating the existing mounting. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";

if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });


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

describe("Positions de détection dans le Workshop intégré", () => {
  test("C1% placement survives central normalization; undo/redo and both play controls share the real Workshop state", async () => {
    const { setLocale } = await import('../src/lib/i18n/core');setLocale('fr');
    const { default: Workshop } = await import('../src/components/standex/workshop/workshop');
    const { DEFAULT_WORKSHOP } = await import('../src/lib/standex/magnetic-workshop');
    const { DEMO_ASSEMBLIES } = await import('../src/lib/standex/machine-demos');
    const machine={...structuredClone(DEMO_ASSEMBLIES['builtin:wall-v1']!),sensorPosition:[0,60,36] as [number,number,number],sensorRotation:[0,0,0] as [number,number,number],magnetAttach:{kind:'surface' as const,support:'moving' as const,partPath:'0/1/0',point:[18,67,22] as [number,number,number],normal:[0,0,1] as [number,number,number],offsetMm:0,spinDeg:0,flip:false,depthRef:'collar' as const,axisSource:'face' as const}};
    let draft={...DEFAULT_WORKSHOP,sensorId:'MK04',magnetModel:'M04',sensitivity:'B',machine};
    const v=render(<Workshop clientPedagogical embedded initialConfig={draft} onDraftChange={c=>{draft=c as typeof draft;}} onClose={()=>{}} onSave={async()=>{}}/>);
    try{
      await act(async()=>fireEvent.click(v.getByTestId('guide-step-install')));
      await act(async()=>fireEvent.click(v.getByRole('radio',{name:'Aimant'})));
      await waitFor(()=>expect((v.getByTestId('guide-find-position') as HTMLButtonElement).disabled).toBe(false),{timeout:15000});
      await act(async()=>new Promise(resolve=>setTimeout(resolve,0)));
      const before=structuredClone(draft.machine.magnetAttach);
      await act(async()=>fireEvent.click(v.getByTestId('guide-find-position')));
      await waitFor(()=>expect(v.getByTestId('guide-detection-positions').textContent).toContain('Position 1 /'),{timeout:15000});
      const placed=structuredClone(draft.machine.magnetAttach);
      expect(placed.point).not.toEqual(before.point);expect({...placed,point:before.point}).toEqual(before);
      await act(async()=>fireEvent.click(v.getByRole('button',{name:'Annuler le dernier réglage'})));
      expect(draft.machine.magnetAttach).toEqual(before);
      await act(async()=>fireEvent.click(v.getByRole('button',{name:'Rétablir'})));
      expect(draft.machine.magnetAttach).toEqual(placed);
      await act(async()=>fireEvent.click(v.getByTestId('guide-step-test')));
      const buttons=v.getAllByRole('button',{name:'Lancer le mouvement',exact:true});expect(buttons).toHaveLength(2);
      await act(async()=>fireEvent.click(buttons[1]!));
      // The mocked browser has no worker: both expose the same cancellable preparation.
      const cancel=v.getAllByRole('button',{name:/Annuler la préparation/});expect(cancel).toHaveLength(2);
      await act(async()=>fireEvent.click(cancel[0]!));
      expect(v.getAllByRole('button',{name:'Lancer le mouvement',exact:true})).toHaveLength(2);
    }finally{v.unmount();}
  },20000);
  test("a search without accessible detection preserves time, placement and attachment settings", async () => {
    const { setLocale } = await import("../src/lib/i18n/core");
    setLocale("fr");
    const { default: MagneticWorkshop } = await import("../src/components/standex/workshop/workshop");
    const { DEFAULT_WORKSHOP } = await import("../src/lib/standex/magnetic-workshop");
    const { DEMO_ASSEMBLIES } = await import("../src/lib/standex/machine-demos");
    const { defaultMagnetFor } = await import("../src/lib/standex/default-pairs");
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
        // Couple documenté de l'exemple intégré (MK24-A-J), pour un cycle réellement calculé.
        initialConfig: {
          ...DEFAULT_WORKSHOP,
          mode: "reference",
          sensorId: "MK24-A-J",
          magnetModel: defaultMagnetFor("MK24-A-J"),
          demoReach: 25,
          initialContact: "open",
          magnetization: "axial",
          polarity: 1,
          machine,
        },
        onClose: () => {},
        onSave: () => {},
      }),
    );
    await waitFor(() => expect(v.getByTestId("machine-guide")).toBeTruthy(), { timeout: 8000 });
    await act(async () => fireEvent.click(v.getByTestId("guide-step-install")));
    await act(async () => fireEvent.click(v.getByRole("radio", { name: "Aimant" })));
    const scrubber = () => v.getByLabelText("Position dans le cycle") as HTMLInputElement;
    await waitFor(() => expect(scrubber().disabled).toBe(false), { timeout: 8000 });
    const point = () => v.getAllByTestId("guide-precise-point")[0]!.textContent ?? "";
    const seek = async (pct: number) =>
      act(async () => {
        // Dans ce DOM de test, React ne voit pas les événements « change » simulés :
        // on appelle le VRAI gestionnaire du curseur (même méthode que questionnaire-render).
        const el = scrubber();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, String(pct));
        const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"))!;
        (el as unknown as Record<string, { onChange: (e: { target: HTMLElement }) => void }>)[key]!.onChange({ target: el });
      });

    await seek(25);
    expect(Number(scrubber().value)).toBe(25);
    const before = point();
    await act(async () => fireEvent.click(v.getByTestId("guide-find-position")));
    await waitFor(() => expect(v.getByTestId('guide-detection-positions').textContent).toContain('Aucune position de détection trouvée sur cette face'), {timeout:15000});
    expect(Number(scrubber().value)).toBe(25);
    expect(point()).toBe(before);
    expect((v.getByTestId("guide-offset") as HTMLInputElement).defaultValue).toBe("2");
    expect((v.getByLabelText("Rotation dans le plan (°)") as HTMLInputElement).value).toBe("35");
    v.unmount();
  }, 30000);
});
