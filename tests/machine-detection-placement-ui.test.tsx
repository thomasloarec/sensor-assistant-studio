import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import MachineGuide, { INITIAL_GUIDE } from "../src/components/standex/workshop/machine-guide";
import { fixture } from "./helpers/machine-search-fixture";
import { setLocale } from "../src/lib/i18n/core";
import type { MachineAssembly } from "../src/lib/standex/machine-assembly";
import { ClientPedagogicalControls } from "../src/components/standex/workshop/client-pedagogical-controls";
if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });
afterEach(cleanup);

test("successive regions share one face; undo restores the prior anchor and cancels the old suggestion list", async () => {
  setLocale("fr");
  const { c, asset } = fixture();
  let current = c;
  function Harness() {
    const [config, setConfig] = useState(c),
      // This pose has several regions. Search now preserves the visible pose.
      [progress, setProgress] = useState(0),
      [state, setState] = useState({
        ...INITIAL_GUIDE,
        step: "install" as const,
        target: "magnet" as const,
      });
    const [past, setPast] = useState<MachineAssembly[]>([]);
    current = config;
    const change = (patch: Partial<MachineAssembly>) => {
      setPast((p) => [...p, config.machine!]);
      setConfig({ ...config, machine: { ...config.machine!, ...patch } });
    };
    return (
      <>
        <span data-testid="time">{progress}</span>
        <MachineGuide
          config={config}
          asset={asset}
          state={state}
          setState={setState as never}
          tool="navigate"
          setTool={() => {}}
          onChange={change}
          onChangeAtTime={change}
          history={{
            canUndo: past.length > 0,
            canRedo: false,
            undo: () => {
              setConfig({ ...config, machine: past.at(-1)! });
              setPast((p) => p.slice(0, -1));
            },
            redo: () => {},
          }}
          sample={{ t: progress, distance: 20, contact: "unknown" } as never}
          progress={progress}
          setProgress={setProgress}
          playing={false}
          setPlaying={() => {}}
          reason={null}
          onDemo={() => {}}
          onMarkers={() => {}}
        />
      </>
    );
  }
  const view = render(<Harness />);
  await act(async () => fireEvent.click(view.getByTestId("guide-find-position")));
  await waitFor(() => expect(view.getByRole("status").textContent).toMatch(/Position 1 \/ [2-9]/), {
    timeout: 8000,
  });
  const first = structuredClone(current.machine!.magnetAttach!);
  expect(view.getByTestId("time").textContent).toBe("0");
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Position suivante" })));
  expect(view.getByRole("status").textContent).toContain("Position 2 /");
  expect(current.machine!.magnetAttach!.point).not.toEqual(first.point);
  expect({ ...current.machine!.magnetAttach, point: first.point }).toEqual(first);
  await act(async () =>
    fireEvent.click(view.getByRole("button", { name: "Annuler le dernier réglage" })),
  );
  expect(current.machine!.magnetAttach).toEqual(first);
  expect(view.queryByRole("button", { name: "Position suivante" })).toBeNull();
}, 15000);

test("navigation during a pending search cannot apply a stale position", async () => {
  setLocale("fr");
  const { c, asset } = fixture();
  let changes = 0;
  function Harness() {
    const [state, setState] = useState({
      ...INITIAL_GUIDE,
      step: "install" as const,
      target: "magnet" as const,
    });
    return (
      <MachineGuide
        config={c}
        asset={asset}
        state={state}
        setState={setState as never}
        tool="navigate"
        setTool={() => {}}
        onChange={() => {
          changes++;
        }}
        history={{ canUndo: false, canRedo: false, undo: () => {}, redo: () => {} }}
        sample={{ t: 0, distance: 20, contact: "unknown" } as never}
        progress={0}
        setProgress={() => {}}
        playing={false}
        setPlaying={() => {}}
        reason={null}
        onDemo={() => {}}
        onMarkers={() => {}}
      />
    );
  }
  const view = render(<Harness />);
  await act(async () => {
    fireEvent.click(view.getByTestId("guide-find-position"));
    fireEvent.click(view.getByTestId("guide-step-test"));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));
  expect(changes).toBe(0);
  expect(view.queryByTestId("guide-detection-positions")).toBeNull();
  expect((view.getByTestId("guide-markers") as HTMLDetailsElement).open).toBe(false);
  expect(view.getByText("Mesure libre — facultatif")).toBeTruthy();
});

test("magnet disclosure has an explicit chevron and reveals the magnet selector", () => {
  setLocale("fr");
  const { c } = fixture();
  const view = render(
    <ClientPedagogicalControls
      config={c}
      update={() => {}}
      onCatalog={() => {}}
      onCable={() => {}}
    />,
  );
  const summary = view.getByText("Caractéristiques de l’aimant").closest("summary")!;
  expect(summary.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  expect(summary.closest("details")!.open).toBe(false);
  fireEvent.click(summary);
  expect(summary.closest("details")!.open).toBe(true);
  expect(view.getByRole("combobox", { name: "Aimant" })).toBeTruthy();
  expect(view.queryByRole("button", { name: "Pointer le câble dans la 3D" })).toBeNull();
});
