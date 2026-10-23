import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { BoxGeometry } from "three";
import MachineGuide, { INITIAL_GUIDE, guideMotionReady, guideStepState } from "../src/components/standex/workshop/machine-guide";
import type { GuideState } from "../src/components/standex/workshop/machine-guide";
import { displayMachineNodes, machineFrame } from "../src/lib/standex/machine-view";
import { COFFEE_ASSEMBLY } from "../src/lib/standex/machine-assembly";
import type { MachineAssembly } from "../src/lib/standex/machine-assembly";
import type { MachineAsset } from "../src/lib/standex/machine-assets";
import { DEFAULT_WORKSHOP, simulateCycle } from "../src/lib/standex/magnetic-workshop";
import { setLocale } from "../src/lib/i18n/core";

beforeEach(async () => {
  if (typeof document === "undefined") {
    try { await GlobalRegistrator.unregister(); } catch {}
    GlobalRegistrator.register({ url: "http://localhost/" });
  }
  setLocale("fr");
});
afterEach(() => { cleanup(); setLocale("fr"); });

const nodes = [
  { path: "0", name: "Sketchfab_model", depth: 0, meshCount: 4 },
  { path: "0/0", name: "RootNode", depth: 1, meshCount: 4 },
  { path: "0/0/0", name: "Desk", depth: 2, meshCount: 4 },
  ...[0, 1, 2, 3].map((i) => ({ path: `0/0/0/${i}`, name: `Independent_part_${i}`, depth: 3, meshCount: 1 })),
];
const asset = {
  nodes,
  parts: nodes.slice(3).map((n) => ({ ...n, geometry: new BoxGeometry(100, 20, 50) })),
  size: [2000, 800, 1000], center: [0, 0, 0], min: [-1000, -400, -500],
  animationCount: 0, animation: { clips: [] }, dispose: () => {},
} as unknown as MachineAsset;
const initial: MachineAssembly = {
  ...structuredClone(COFFEE_ASSEMBLY), movingNodes: ["0/0/0/1"], movingNode: "0/0/0/1",
  travel: [0, 0, 0], axisVector: undefined, motionStatus: "unset",
};

function Guide({ step = "motion", isolation = false }: { step?: GuideState["step"]; isolation?: boolean }) {
  const [machine, setMachine] = useState(initial);
  const [state, setState] = useState({ ...INITIAL_GUIDE, step, isolate: isolation });
  const [progress, setProgress] = useState(0);
  const config = { ...DEFAULT_WORKSHOP, machine };
  const samples = simulateCycle(config).samples;
  return <>
    <output data-testid="machine-state">{JSON.stringify(machine)}</output>
    <output data-testid="guide-state">{JSON.stringify(state)}</output>
    <output data-testid="progress">{progress}</output>
    <MachineGuide state={state} setState={setState} config={config} asset={asset}
      tool="navigate" setTool={() => {}} onChange={(patch) => setMachine((m) => ({ ...m, ...patch }))}
      history={{ canUndo: false, canRedo: false, undo: () => {}, redo: () => {} }}
      sample={samples[0] ?? { t: 0, contact: "unknown", distance: 0, position: [0, 0, 0], angle: 0 }}
      progress={progress} setProgress={setProgress} playing={false} setPlaying={() => {}}
      reason={null} onDemo={() => {}} onMarkers={() => {}} />
  </>;
}

describe("Targeted workshop UX", () => {
  test("entering a stroke before choosing direction never silently imposes X", () => {
    const v = render(<Guide />);
    const stroke = v.getByTestId("guide-stroke");
    fireEvent.change(stroke, { target: { value: "300" } });
    fireEvent.blur(stroke);
    const m = JSON.parse(v.getByTestId("machine-state").textContent ?? "{}");
    expect(m.travel).toEqual([0, 0, 0]);
    expect(m.axisVector).toBeUndefined();
    expect(m.motionStatus).toBe("unset");
  });
  test("manual direction Z + 300 mm stays draft until explicit confirmation, then open/closed preview", () => {
    const v = render(<Guide />);
    fireEvent.click(v.getByTestId("guide-axis-Z"));
    const stroke = v.getByTestId("guide-stroke");
    fireEvent.change(stroke, { target: { value: "300" } });
    fireEvent.blur(stroke);
    let m = JSON.parse(v.getByTestId("machine-state").textContent ?? "{}");
    expect(m.travel).toEqual([0, 0, 300]);
    expect(m.motionStatus).toBe("draft");
    expect(guideMotionReady(m, true)).toBe(false);
    fireEvent.click(v.getByTestId("guide-validate-motion"));
    m = JSON.parse(v.getByTestId("machine-state").textContent ?? "{}");
    expect(m.motionStatus).toBe("confirmed");
    fireEvent.click(v.getByTestId("guide-see-open"));
    expect(Number(v.getByTestId("progress").textContent)).toBe(0.5);
    fireEvent.click(v.getByTestId("guide-see-closed"));
    expect(Number(v.getByTestId("progress").textContent)).toBe(0);
  });
  test("installation restores fixed parts without changing any moving selection", () => {
    const v = render(<Guide step="parts" isolation />);
    fireEvent.click(v.getByTestId("guide-step-install"));
    const state = JSON.parse(v.getByTestId("guide-state").textContent ?? "{}");
    const m = JSON.parse(v.getByTestId("machine-state").textContent ?? "{}");
    expect(state.isolate).toBe(false);
    expect(m.movingNodes).toEqual(["0/0/0/1"]);
    expect(guideStepState({ ...INITIAL_GUIDE, isolate: true }, "motion").isolate).toBe(true);
  });
  test("simplification preserves all four independent meshes and their paths", () => {
    const visible = displayMachineNodes(asset, false);
    expect(visible.map((n) => n.path)).toEqual(["0/0/0", "0/0/0/0", "0/0/0/1", "0/0/0/2", "0/0/0/3"]);
    expect(visible.map((n) => n.depth)).toEqual([0, 1, 1, 1, 1]);
    expect(displayMachineNodes(asset, true)).toBe(nodes);
  });
  test("moving-part framing follows current pose and never mutates the montage", () => {
    const m = { ...initial, travel: [0, 0, 300] as [number, number, number], motionStatus: "confirmed" as const };
    const before = structuredClone(m);
    const start = machineFrame(asset, m, "moving", 0, [23, 5, 5], [10, 5, 5]);
    const end = machineFrame(asset, m, "moving", 1, [23, 5, 5], [10, 5, 5]);
    expect(start.target).toEqual([0, 0, 0]);
    expect(end.target).toEqual([0, 0, 300]);
    expect(end.radius).toBeCloseTo(start.radius);
    expect(m).toEqual(before);
    expect(guideMotionReady(m, false)).toBe(false);
  });
});