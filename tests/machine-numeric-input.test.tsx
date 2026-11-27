import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import MachineGuide, { INITIAL_GUIDE } from "../src/components/standex/workshop/machine-guide";
import { fixture } from "./helpers/machine-search-fixture";
import { setLocale } from "../src/lib/i18n/core";

if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });
afterEach(cleanup);
const noop = () => {};

function setup(value = 88) {
  setLocale("fr");
  const { c, asset } = fixture();
  const onChange = mock();
  const guide = (x: number) => <MachineGuide
    config={{ ...c, machine: { ...c.machine!, sensorAttach: undefined, sensorPosition: [x, 0, 0] } }}
    asset={asset} state={{ ...INITIAL_GUIDE, step: "install", target: "sensor" }}
    setState={noop} tool="navigate" setTool={noop} onChange={onChange}
    history={{ canUndo: false, canRedo: false, undo: noop, redo: noop }}
    sample={{ t: 0, distance: 20, contact: "unknown" } as never}
    progress={0} setProgress={noop} playing={false} setPlaying={noop}
    reason={null} onDemo={noop}
  />;
  const view = render(guide(value));
  return { view, onChange, guide };
}

test("focusing and leaving an unchanged coordinate does not create a history entry", () => {
  const { view, onChange } = setup();
  const input = view.getByTestId("guide-free-X");
  fireEvent.focus(input);
  fireEvent.blur(input);
  expect(onChange).not.toHaveBeenCalled();
});

test("a coordinate edit commits once; leaving the updated field again adds no redundant undo step", () => {
  const { view, onChange, guide } = setup();
  const input = view.getByTestId("guide-free-X");
  fireEvent.change(input, { target: { value: "100" } });
  fireEvent.blur(input);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0]?.[0]).toEqual({ sensorPosition: [100, 0, 0], sensorAttach: undefined });
  view.rerender(guide(100));
  fireEvent.focus(view.getByTestId("guide-free-X"));
  fireEvent.blur(view.getByTestId("guide-free-X"));
  expect(onChange).toHaveBeenCalledTimes(1);
});

test("leaving the rounded display unchanged preserves the full precision of the stored pose", () => {
  const { view, onChange } = setup(88.123456);
  const input = view.getByTestId("guide-free-X") as HTMLInputElement;
  expect(input.value).toBe("88.123");
  fireEvent.blur(input);
  expect(onChange).not.toHaveBeenCalled();
});

test("invalid coordinates still show an error and preserve the previous pose", () => {
  const { view, onChange } = setup();
  const input = view.getByTestId("guide-free-X") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "10001" } });
  fireEvent.blur(input);
  expect(input.value).toBe("88");
  expect(view.getByRole("alert").textContent).toContain("Valeur refusée");
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.blur(input);
  expect(view.queryByRole("alert")).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
