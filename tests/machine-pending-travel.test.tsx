import { afterEach, beforeEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import MachineGuide, { handlePick, INITIAL_GUIDE, type GuideState } from "../src/components/standex/workshop/machine-guide";
import type { MachineTool, SceneHit } from "../src/components/standex/workshop/machine-scene";
import { COFFEE_ASSEMBLY, type MachineAssembly } from "../src/lib/standex/machine-assembly";
import type { MachineAsset } from "../src/lib/standex/machine-assets";
import { DEFAULT_WORKSHOP, simulateCycle } from "../src/lib/standex/magnetic-workshop";
import { setLocale } from "../src/lib/i18n/core";

if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });
beforeEach(() => setLocale("en"));
afterEach(() => { cleanup(); setLocale("fr"); });
const noop = () => undefined;
const fresh: MachineAssembly = { ...COFFEE_ASSEMBLY, travel: [0, 0, 0], motionStatus: "unset" };
const face: SceneHit = { point: [4, 5, 6], normal: [0, 2, 0], path: "0/1", moving: true };
const sample = simulateCycle({ ...DEFAULT_WORKSHOP, machine: fresh }).samples[0]!;
const asset = { nodes: [{ path: "0/1", name: "Lid", meshCount: 1 }], parts: [], size: [100, 100, 100] } as unknown as MachineAsset;

function Harness() {
  const [machine, setMachine] = useState(fresh);
  const [state, setState] = useState<GuideState>({ ...INITIAL_GUIDE, step: "motion" });
  const [tool, setTool] = useState<MachineTool>("navigate");
  const [progress, setProgress] = useState(0);
  const config = { ...DEFAULT_WORKSHOP, machine };
  return <>
    <MachineGuide state={state} setState={setState} config={config} asset={asset}
      tool={tool} setTool={setTool} onChange={patch => setMachine(m => ({ ...m, ...patch }))}
      history={{ canUndo: false, canRedo: false, undo: noop, redo: noop }}
      sample={{ ...sample, t: progress }} progress={progress} setProgress={setProgress}
      playing={false} setPlaying={noop} reason={null} onDemo={noop} onMarkers={noop}/>
    <button data-testid="scene-face" onClick={() => {
      const picked = handlePick(state, machine, face, config);
      setState(picked.state);
      if (picked.patch) setMachine(m => ({ ...m, ...picked.patch }));
      if (picked.done) setTool("navigate");
    }}>Scene face</button>
    <output data-testid="machine">{JSON.stringify(machine)}</output>
    <output data-testid="progress">{progress}</output>
  </>;
}

function enterTravel(view: ReturnType<typeof render>, value: string) {
  const input = view.getByTestId("guide-stroke");
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}
function machineOf(view: ReturnType<typeof render>): MachineAssembly {
  return JSON.parse(view.getByTestId("machine").textContent!);
}

test("50 mm entered before a face immediately enables position preview when the face is picked", () => {
  const view = render(<Harness/>);
  fireEvent.click(view.getByTestId("guide-axis-face"));
  const prompt = view.getByTestId("guide-face-prompt");
  expect(prompt.getAttribute("role")).toBe("status");
  expect(prompt.querySelector("strong")?.textContent).toBe("Click a face of the model");
  expect(prompt.classList.contains("notice-warning")).toBe(true);
  enterTravel(view, "50");
  expect(machineOf(view).travel).toEqual([0, 0, 0]); // No invented direction.
  expect((view.getByRole("slider") as HTMLInputElement).disabled).toBe(true);
  expect(view.queryByTestId("guide-zero-stroke")).toBeNull();
  fireEvent.click(view.getByTestId("scene-face"));
  expect(machineOf(view).travel).toEqual([0, 50, 0]);
  expect((view.getByTestId("guide-stroke") as HTMLInputElement).value).toBe("50");
  expect((view.getByRole("slider") as HTMLInputElement).disabled).toBe(false);
  expect(view.queryByTestId("guide-face-prompt")).toBeNull();
  fireEvent.click(view.getByTestId("guide-see-open"));
  expect(view.getByTestId("progress").textContent).toBe("0.5");
  // Subsequent edits and changes of direction retain the actual current travel.
  enterTravel(view, "25");
  fireEvent.click(view.getByTestId("guide-axis-X"));
  expect(machineOf(view).travel).toEqual([25, 0, 0]);
});

test("cancelling face selection retains the entered travel for a model axis", () => {
  const view = render(<Harness/>);
  fireEvent.click(view.getByTestId("guide-axis-face"));
  enterTravel(view, "50");
  fireEvent.click(view.getByTestId("guide-face-prompt").querySelector("button")!);
  expect(view.queryByTestId("guide-face-prompt")).toBeNull();
  fireEvent.click(view.getByTestId("guide-axis-Z"));
  expect(machineOf(view).travel).toEqual([0, 0, 50]);
  expect((view.getByRole("slider") as HTMLInputElement).disabled).toBe(false);
});

test("zero replaces a pending positive travel and still requires a positive travel", () => {
  const view = render(<Harness/>);
  fireEvent.click(view.getByTestId("guide-axis-face"));
  enterTravel(view, "50");
  enterTravel(view, "0");
  fireEvent.click(view.getByTestId("scene-face"));
  expect(machineOf(view).travel).toEqual([0, 0, 0]);
  expect((view.getByRole("slider") as HTMLInputElement).disabled).toBe(true);
  enterTravel(view, "50");
  expect((view.getByRole("slider") as HTMLInputElement).disabled).toBe(false);
});

test("two-point direction consumes pending travel, while invalid picks preserve it for retry", () => {
  const state: GuideState = { ...INITIAL_GUIDE, step: "motion", pendingTravelMm: 50, pick: { purpose: "axis-points", points: [] } };
  const first = handlePick(state, fresh, face, DEFAULT_WORKSHOP);
  expect(first.done).toBe(false);
  expect(first.state.pendingTravelMm).toBe(50);
  const invalid = handlePick(first.state, fresh, face, DEFAULT_WORKSHOP);
  expect(invalid.patch).toBeNull();
  expect(invalid.state.pendingTravelMm).toBe(50);
  const second = handlePick(first.state, fresh, { ...face, point: [4, 5, 16] }, DEFAULT_WORKSHOP);
  expect(second.patch?.travel).toEqual([0, 0, 50]);
  expect(second.state.pendingTravelMm).toBeUndefined();
  const badFace = handlePick({ ...state, pick: { purpose: "axis-face", points: [] } }, fresh, { ...face, normal: [0, 0, 0] }, DEFAULT_WORKSHOP);
  expect(badFace.patch).toBeNull();
  expect(badFace.state.pendingTravelMm).toBe(50);
});
