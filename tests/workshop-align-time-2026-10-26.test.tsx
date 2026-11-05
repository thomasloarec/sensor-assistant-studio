/** Real Workshop regression: face-constrained C1% placement, history, shared
 * playback controls and refusal without mutating the existing mounting. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });


// La scène WebGL n'est pas l'objet du test : elle est remplacée par un témoin.
let currentScene: any;
mock.module("../src/components/standex/workshop/machine-scene", () => ({
  default: (props: any) => { currentScene=props; return React.createElement("div", { "data-testid": "scene-stub" }); },
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
afterEach(() => { cleanup(); currentScene = null; });

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("Positions de détection dans le Workshop intégré", () => {
  test('installation scrubs the moving part and preserves its pose through tools, edits and undo',async()=>{
    const {setLocale}=await import('../src/lib/i18n/core');setLocale('fr');
    const {default:Workshop}=await import('../src/components/standex/workshop/workshop');
    const {DEFAULT_WORKSHOP}=await import('../src/lib/standex/magnetic-workshop');
    const {DEMO_ASSEMBLIES}=await import('../src/lib/standex/machine-demos');
    const {attachPatch}=await import('../src/components/standex/workshop/machine-guide');
    for(const clientPedagogical of [false,true]){
      let config={...DEFAULT_WORKSHOP,sensorId:'MK04',magnetModel:'M04',sensitivity:'B',machine:structuredClone(DEMO_ASSEMBLIES['builtin:wall-v1']!)};
      const a={kind:'surface' as const,support:'moving' as const,partPath:'0/1/0',point:[18,67,22] as [number,number,number],normal:[0,0,1] as [number,number,number],offsetMm:0,spinDeg:0,flip:false,depthRef:'collar' as const,axisSource:'face' as const};
      config.machine={...config.machine,...attachPatch('magnet',a,config)};
      const view=render(<Workshop embedded clientPedagogical={clientPedagogical} initialConfig={config} onDraftChange={c=>config=c as typeof config} onClose={()=>{}} onSave={async()=>{}}/>);
      try{
        await waitFor(()=>expect(currentScene?.asset).toBeTruthy());
        await act(async()=>fireEvent.click(view.getByTestId('guide-step-install')));
        await waitFor(()=>expect((view.getByLabelText('Aperçu de la position') as HTMLInputElement).disabled).toBe(false));
        const slider=view.getByLabelText('Aperçu de la position') as HTMLInputElement;
        await act(async()=>{slider.value='25';const key=Object.keys(slider).find(k=>k.startsWith('__reactProps$'))!;(slider as any)[key].onChange({target:slider});});
        expect(currentScene.sample.t).toBe(.25);
        await act(async()=>fireEvent.click(view.getByTestId('guide-target-magnet')));
        await act(async()=>fireEvent.click(view.getByTestId('guide-move')));
        expect(currentScene.tool).toBe('move-magnet');expect(currentScene.sample.t).toBe(.25);
        await act(async()=>fireEvent.click(view.getByTestId('guide-place')));
        expect(currentScene.tool).toBe('magnet');expect(currentScene.sample.t).toBe(.25);
        await act(async()=>currentScene.onChange(attachPatch('magnet',{...a,point:[18.2,67,22]},config)));
        expect(currentScene.sample.t).toBe(.25);expect(config.machine.magnetAttach?.point[0]).toBe(18.2);
        await act(async()=>fireEvent.click(view.getByRole('button',{name:'Annuler le dernier réglage'})));
        expect(config.machine.magnetAttach?.point).toEqual(a.point);expect(currentScene.sample.t).toBe(.25);
        await act(async()=>fireEvent.click(view.getByTestId('guide-step-test')));
        await act(async()=>fireEvent.click(view.getByTestId('guide-step-install')));
        expect((view.getByLabelText('Aperçu de la position') as HTMLInputElement).value).toBe('25');
        expect(currentScene.sample.t).toBe(.25);
      }finally{view.unmount();currentScene=null;}
    }
  },20000);
  test("drawer → coffee keeps the requested model and pair; both components expose free and attached rotations with undo", async()=>{
    const {setLocale}=await import('../src/lib/i18n/core');setLocale('fr');
    const {default:Workshop}=await import('../src/components/standex/workshop/workshop');
    const {DEFAULT_WORKSHOP}=await import('../src/lib/standex/magnetic-workshop');
    const {DEMO_ASSEMBLIES}=await import('../src/lib/standex/machine-demos');
    const {attachPose}=await import('../src/lib/standex/machine-mounting');
    let draft={...DEFAULT_WORKSHOP,sensorId:'MK03',magnetModel:'NDFEB250175H-6X10',
      machine:structuredClone(DEMO_ASSEMBLIES['builtin:drawer-v1']!)};
    const view=render(<Workshop clientPedagogical embedded initialConfig={draft} onDraftChange={c=>{draft=c as typeof draft;}} onClose={()=>{}} onSave={async()=>{}}/>);
    try {
      await act(async()=>fireEvent.click(view.getAllByTestId('demo-coffee')[0]!));
      await waitFor(()=>expect(draft.machine.assetKey).toBe('builtin:coffee-v1'),{timeout:10000});
      expect(draft.sensorId).toBe('MK03');expect(draft.magnetModel).toBe('NDFEB250175H-6X10');
      await waitFor(()=>expect(view.getAllByText('machine-cafe-bac-mobile.glb').length).toBeGreaterThan(0));
      await act(async()=>fireEvent.click(view.getByTestId('guide-step-install')));
      expect(view.getByText('Rotation du capteur')).toBeTruthy();
      await act(async()=>fireEvent.click(view.getByText('Rotation du capteur')));
      const free=view.getByTestId('guide-free-rotation-Z') as HTMLInputElement;
      free.value='90';await act(async()=>fireEvent.blur(free));
      expect(draft.machine.sensorRotation[2]).toBe(90);
      await act(async()=>fireEvent.click(view.getByTestId('guide-target-magnet')));
      expect(view.getByText('Rotation de l’aimant')).toBeTruthy();
      expect(view.getByTestId('guide-free-rotation-X')).toBeTruthy();
    }finally{view.unmount();}

    const a={kind:'surface' as const,support:'moving' as const,partPath:'0/1/0',
      point:[18,67,22] as [number,number,number],normal:[0,0,1] as [number,number,number],
      offsetMm:0,spinDeg:0,flip:false,depthRef:'collar' as const,axisSource:'face' as const};
    draft={...draft,machine:{...structuredClone(DEMO_ASSEMBLIES['builtin:wall-v1']!),magnetAttach:a,
      sensorAttach:{...a,support:'fixed',partPath:'0/0/0',point:[0,60,6]}}};
    const mounted=render(<Workshop clientPedagogical embedded initialConfig={draft} onDraftChange={c=>{draft=c as typeof draft;}} onClose={()=>{}} onSave={async()=>{}}/>);
    try{
      await act(async()=>fireEvent.click(mounted.getByTestId('guide-step-install')));
      expect(mounted.getByText('Rotation du capteur')).toBeTruthy();
      await act(async()=>fireEvent.click(mounted.getByText('Rotation du capteur')));
      await act(async()=>fireEvent.click(mounted.getByRole('button',{name:'+90°',exact:true})));
      expect(draft.machine.sensorAttach?.spinDeg).toBe(90);
      expect(draft.machine.sensorAttach?.point).toEqual([0,60,6]);
      await act(async()=>fireEvent.click(mounted.getByTestId('guide-target-magnet')));
      await act(async()=>fireEvent.click(mounted.getByText('Rotation de l’aimant')));
      await act(async()=>fireEvent.change(mounted.getByTestId('guide-surface-orientation'),{target:{value:'end'}}));
      expect(draft.machine.magnetAttach?.surfaceOrientation).toBe('end');
      expect(draft.machine.magnetAttach?.point).toEqual(a.point);
      await act(async()=>fireEvent.click(mounted.getByRole('button',{name:'+90°',exact:true})));
      expect(draft.machine.magnetAttach?.spinDeg).toBe(90);
      const before=structuredClone(draft.machine);
      await act(async()=>fireEvent.click(mounted.getByTestId('guide-flip')));
      expect(draft.machine.magnetAttach?.flip).toBe(true);
      expect(draft.machine.magnetRotation).not.toEqual(before.magnetRotation);
      expect(draft.machine.magnetPosition).toEqual(attachPose(draft.machine.magnetAttach!,{lengthMm:10,heightMm:6}).position);
      await act(async()=>fireEvent.click(mounted.getByRole('button',{name:'Annuler le dernier réglage'})));
      expect(draft.machine).toEqual(before);
    }finally{mounted.unmount();}
  },20000);
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
      await act(async()=>fireEvent.click(v.getByTestId('guide-target-magnet')));
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
    await act(async () => fireEvent.click(v.getByTestId("guide-target-magnet")));
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
    await waitFor(() => expect(v.getByTestId('guide-detection-positions').textContent).toContain('Aucune position de détection trouvée sur cette face'), {timeout:60000});
    expect(Number(scrubber().value)).toBe(25);
    expect(point()).toBe(before);
    expect((v.getByTestId("guide-offset") as HTMLInputElement).defaultValue).toBe("2");
    expect((v.getByLabelText("Rotation dans le plan (°)") as HTMLInputElement).value).toBe("35");
    v.unmount();
  }, 90000);
});

 test('movement validation is explicit, bypass is conscious, and swapped endpoints survive pose, undo and reload',async()=>{
    const {setLocale}=await import('../src/lib/i18n/core');setLocale('fr');
    const {default:Workshop}=await import('../src/components/standex/workshop/workshop');
    const {DEFAULT_WORKSHOP,parseWorkshopConfig}=await import('../src/lib/standex/magnetic-workshop');
    const {DEMO_ASSEMBLIES}=await import('../src/lib/standex/machine-demos');
    const {openingReading}=await import('../src/lib/standex/machine-mounting');
    const {pointAt,cycleU,parseMachine}=await import('../src/lib/standex/machine-assembly');
    let config={...DEFAULT_WORKSHOP,sensorId:'MK04',magnetModel:'M04',sensitivity:'B',machine:{...structuredClone(DEMO_ASSEMBLIES['builtin:door-v1']!),motionStatus:'draft' as const}} as import('../src/lib/standex/magnetic-workshop').WorkshopConfig;
    const view=render(<Workshop embedded clientPedagogical initialConfig={config} onDraftChange={c=>config=c} onClose={()=>{}} onSave={async()=>{}}/>);
    try{
      await waitFor(()=>expect(currentScene?.asset).toBeTruthy());
      await act(async()=>fireEvent.click(view.getByTestId('guide-step-motion')));
      await act(async()=>fireEvent.click(view.getByTestId('guide-step-install')));
      expect(view.getByTestId('guide-step-motion').getAttribute('aria-current')).toBe('step');
      expect(view.getByTestId('guide-motion-decision')).toBeTruthy();
      expect(config.machine!.motionStatus).toBe('draft');
      await act(async()=>fireEvent.click(view.getByTestId('guide-skip-validation')));
      expect(view.getByTestId('guide-step-install').getAttribute('aria-current')).toBe('step');
      expect(config.machine!.motionStatus).toBe('draft');
      expect(view.getByTestId('guide-target-sensor').getAttribute('role')).not.toBe('radio');
      expect(view.getByTestId('guide-target-magnet')).toBeTruthy();
      await act(async()=>fireEvent.click(view.getByTestId('guide-step-motion')));
      // The mobile selector goes through the same deliberate decision.
      await act(async()=>fireEvent.change(view.getByLabelText('Étape de préparation'),{target:{value:'install'}}));
      expect(view.getByTestId('guide-motion-decision')).toBeTruthy();
      await act(async()=>fireEvent.click(view.getByRole('button',{name:'Revenir au mouvement'})));
      expect(view.queryByTestId('guide-motion-decision')).toBeNull();
      await act(async()=>fireEvent.click(view.getByTestId('guide-validate-motion')));
      expect(config.machine!.motionStatus).toBe('confirmed');
      expect(view.getByTestId('guide-step-install').getAttribute('aria-current')).toBe('step');
      await act(async()=>fireEvent.click(view.getByTestId('guide-see-open')));
      expect(currentScene.sample.t).toBe(.5);
      await act(async()=>fireEvent.click(view.getByTestId('guide-step-motion')));
      const original=structuredClone(config.machine!);
      await act(async()=>fireEvent.click(view.getByTestId('guide-swap-ends')));
      expect(config.machine!.closedAtEnd).toBe(true);expect(currentScene.sample.t).toBe(.5);
      expect(openingReading(config.machine!,.5).value).toBe(0);
      for(const time of [0,.2,.5,.8,1]) expect(pointAt(config.machine!,original.movingNode,[10,20,30],cycleU(config.machine!,time))).toEqual(pointAt(original,original.movingNode,[10,20,30],cycleU(original,time)));
      expect(parseWorkshopConfig(JSON.parse(JSON.stringify(config)))!.machine!.closedAtEnd).toBe(true);
      expect(parseMachine({...original,closedAtEnd:'true'})).toBeNull();
      await act(async()=>fireEvent.click(view.getByTestId('guide-see-open')));expect(currentScene.sample.t).toBe(0);
      await act(async()=>fireEvent.click(view.getByTestId('guide-see-closed')));expect(currentScene.sample.t).toBe(.5);
      await act(async()=>fireEvent.click(view.getByTestId('guide-step-install')));
      await act(async()=>fireEvent.click(view.getByRole('button',{name:'Annuler le dernier réglage'})));
      expect(config.machine!.closedAtEnd).toBeUndefined();expect(currentScene.sample.t).toBe(.5);
    }finally{view.unmount();currentScene=null;}
 },20000);
