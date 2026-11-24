import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });
const { render, cleanup, fireEvent } = await import("@testing-library/react");
const { default: MachineScaleRecovery } = await import("../src/components/standex/workshop/machine-scale-recovery");
import { machineScaleError, machineScaleFromLength, scaledMachineSize, validMachineScale } from "../src/lib/standex/machine-scale";
import { parseMachineAsset } from "../src/lib/standex/machine-assets";
import { COFFEE_ASSEMBLY, parseMachine } from "../src/lib/standex/machine-assembly";
import { DEFAULT_WORKSHOP, parseWorkshopConfig } from "../src/lib/standex/magnetic-workshop";
import { setLocale } from "../src/lib/i18n/core";
import type { Vec3 } from "../src/lib/standex/magnetic-workshop";

afterEach(() => { cleanup(); setLocale("fr"); });
const fridgeSize: Vec3 = [179172.15625,448333.734375,141264.728515625];

test("a real dimension determines scale proportionally without guessing fridge size", () => {
  const scale = machineScaleFromLength(fridgeSize,1000,"180")!;
  const size = scaledMachineSize(fridgeSize,1000,scale)!;
  expect(size[1]).toBeCloseTo(1800,6);
  expect(size[0]/size[1]).toBeCloseTo(fridgeSize[0]/fridgeSize[1],8);
  expect(machineScaleFromLength(fridgeSize,1000,"180,5")).toBe(machineScaleFromLength(fridgeSize,1000,"180.5"));
  for(const value of ["", "-1", "0", "NaN", "Infinity", "2001", "0.001", "180cm", "1e3"])
    expect(machineScaleFromLength(fridgeSize,1000,value)).toBeNull();
  expect(scaledMachineSize(fridgeSize,1000,1000)).toBeNull();
  expect(scaledMachineSize(fridgeSize,1000,1)?.[1]).toBeCloseTo(448.334,2);
});

test("oversized and tiny GLBs recover through the same loader; parts and animation survive", async () => {
  const b=readFileSync("public/models/demo-bras-anime.glb");
  const data=()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;
  const base=await parseMachineAsset(data(),1000);
  for(const tried of [1e8,0.001]) {
    let issue: ReturnType<typeof machineScaleError> = null;
    try { await parseMachineAsset(data(),tried); } catch(e) { issue=machineScaleError(e); }
    expect(issue).not.toBeNull();
    const scale=machineScaleFromLength(issue!.sizeMm,tried,"180")!;
    const loaded=await parseMachineAsset(data(),scale);
    expect(Math.max(...loaded.size)).toBeCloseTo(1800,2);
    expect(loaded.parts.map(p=>p.path)).toEqual(base.parts.map(p=>p.path));
    expect(loaded.animationCount).toBe(base.animationCount);
    loaded.dispose();
  }
  base.dispose();
  expect(machineScaleError(new Error("invalid geometry"))).toBeNull();
  expect(machineScaleError({code:"scale",sizeMm:[0,0,0]})).toBeNull();
});

test("custom scale round trips through configuration without changing products", () => {
  const unitScale=machineScaleFromLength(fridgeSize,1000,"180")!;
  const config={...DEFAULT_WORKSHOP,machine:{...COFFEE_ASSEMBLY,unitScale}};
  const restored=parseWorkshopConfig(JSON.parse(JSON.stringify(config)))!;
  expect(restored.machine?.unitScale).toBe(unitScale);
  expect(restored.sensorId).toBe(config.sensorId);
  expect(restored.magnetModel).toBe(config.magnetModel);
  for(const unitScale of [0,-1,NaN,Infinity,"10",1e30]) {
    expect(validMachineScale(unitScale)).toBe(false);
    expect(parseMachine({...COFFEE_ASSEMBLY,unitScale})).toBeNull();
  }
});

test("recovery waits for a dimension, previews it, confirms once and allows cancellation", () => {
  setLocale("fr");
  const confirmed:number[]=[]; let cancelled=false;
  const props={fileName:"fridge.glb",sizeMm:fridgeSize,triedScale:1000,busy:false,onConfirm:(s:number)=>confirmed.push(s),onCancel:()=>{cancelled=true;}};
  const view=render(<MachineScaleRecovery {...props}/>);
  const button=view.getByRole("button",{name:"Importer à cette taille"}) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.change(view.getByRole("textbox"),{target:{value:"180"}});
  expect(button.disabled).toBe(false);
  expect(view.getByRole("status").textContent).toContain("180");
  fireEvent.click(button);
  expect(confirmed).toEqual([machineScaleFromLength(fridgeSize,1000,"180")!]);
  view.rerender(<MachineScaleRecovery {...props} busy/>);
  expect(button.disabled).toBe(true);
  fireEvent.click(view.getByRole("button",{name:"Annuler l'import"}));
  expect(cancelled).toBe(true);
});

test("unit choices display resulting sizes and disable invalid units", () => {
  setLocale("fr");
  const confirmed:number[]=[];
  const v=render(<MachineScaleRecovery fileName="x.glb" sizeMm={fridgeSize} triedScale={1000} busy={false} onConfirm={s=>confirmed.push(s)} onCancel={()=>{}}/>);
  expect((v.getByRole("option",{name:/Mètres · standard GLB/,hidden:true}) as HTMLOptionElement).disabled).toBe(true);
  fireEvent.change(v.getByRole("combobox",{hidden:true}),{target:{value:"1"}});
  fireEvent.click(v.getByRole("button",{name:"Importer à cette taille"}));
  expect(confirmed).toEqual([1]);
});
