import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { ACTIVATE, RELEASE, REED_INITIAL, mapReedPointer, moveReed, orientReed, reedContact, reedContours, reedResponse, reedZone } from "@/lib/leadmagnet/reed-discovery";
import { MagnetPlay } from "@/components/leadmagnet/magnet-play";
import { LANGUAGES, setLocale, t } from "@/lib/i18n/core";
import { readFileSync } from "node:fs";

beforeEach(async () => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    try { await GlobalRegistrator.unregister(); } catch {}
    GlobalRegistrator.register({ url: "http://localhost/" });
  }
  setLocale("fr");
});
afterEach(() => { cleanup(); setLocale("fr"); });

describe("Reed teaching model — independent history oracle", () => {
  test("OPEN → ON → HOLD → OFF; OFF → same HOLD stays OPEN", () => {
    const on = { x: 305, y: 140 }, hold = { x: 359, y: 140 }, off = { x: 405, y: 140 };
    let s = moveReed(REED_INITIAL, off);
    expect(s.closed).toBe(false);
    s = moveReed(s, on); expect(s.closed).toBe(true); expect(s.progress).toBe(1);
    s = moveReed(s, hold); expect(s.closed).toBe(true); expect(s.progress).toBe(2);
    s = moveReed(s, off); expect(s.closed).toBe(false);
    s = moveReed(s, hold); expect(s.closed).toBe(false);
    expect(reedZone(hold, "parallel")).toBe("HOLD");
    expect(reedContact(true, hold, "parallel")).toBe(true);
    expect(reedContact(false, hold, "parallel")).toBe(false);
  });
  test("orientations really differ, switching only progresses after observed HOLD", () => {
    expect(reedZone({ x: 305, y: 140 }, "parallel")).toBe("ON");
    expect(reedZone({ x: 305, y: 140 }, "perpendicular")).toBe("OFF");
    let s = moveReed(REED_INITIAL, { x: 305, y: 140 });
    expect(orientReed(s, "perpendicular").progress).toBe(1);
    s = moveReed(s, { x: 359, y: 140 });
    s = orientReed(s, "perpendicular"); expect(s.progress).toBe(3);
    expect(s.closed).toBe(false);
    s = moveReed(s, { x: 220, y: 65 }); expect(s.progress).toBe(4); expect(s.closed).toBe(true);
  });
  test("fast paths activate before ending in HOLD, but direct OFF→HOLD does not", () => {
    const s = { ...REED_INITIAL, point: { x: 220, y: 140 } };
    const fast = moveReed(s, { x: 359, y: 140 });
    expect(fast.closed).toBe(true); expect(fast.progress).toBe(2);
    expect(moveReed({ ...s, point: { x: 405, y: 140 } }, { x: 359, y: 140 }).closed).toBe(false);
  });
  for (const orientation of ["parallel", "perpendicular"] as const) {
    test(`${orientation}: all contour samples share the response model`, () => {
      for (const threshold of [ACTIVATE, RELEASE]) for (const ellipse of reedContours(orientation, threshold)) {
        for (let a = 0; a < 360; a += 15) {
          const angle = a * Math.PI / 180;
          expect(reedResponse({ x: ellipse.x + ellipse.rx * Math.cos(angle), y: ellipse.y + ellipse.ry * Math.sin(angle) }, orientation)).toBeCloseTo(threshold, 12);
        }
      }
      expect(ACTIVATE).toBeGreaterThan(RELEASE);
    });
  }
  test("CTM inverse handles scaling, offset and letterboxing, not width-only mapping", () => {
    expect(mapReedPointer(300, 200, { a: 2, b: 0, c: 0, d: 2, e: -400, f: -200 })).toEqual({ x: 200, y: 200 });
    expect(mapReedPointer(200, 300, { a: 0, b: -1, c: 1, d: 0, e: 5, f: 10 })).toEqual({ x: 305, y: -190 });
  });
  test("clamping, invalid inputs and state are independent of path geometry", () => {
    expect(moveReed(REED_INITIAL, { x: NaN, y: 0 })).toBe(REED_INITIAL);
    expect(moveReed(REED_INITIAL, { x: 1000, y: -50 }).point).toEqual({ x: 410, y: 30 });
    const before = reedContours("parallel", ACTIVATE);
    moveReed(REED_INITIAL, { x: 305, y: 140 });
    expect(reedContours("parallel", ACTIVATE)).toEqual(before);
  });
});

function preparePointer(view: ReturnType<typeof render>) {
  const svg = view.getByRole("img");
  Object.defineProperty(svg, "getScreenCTM", { configurable: true, value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }) });
  const handle = view.getByTestId("reed-handle");
  const captured = new Set<number>();
  Object.assign(handle, { setPointerCapture: (id: number) => captured.add(id), hasPointerCapture: (id: number) => captured.has(id), releasePointerCapture: (id: number) => captured.delete(id) });
  return { handle, captured };
}

describe("Rendered discovery interactions", () => {
  test("initial complete sensor opaque; no bogus distances, no integrated indicator", () => {
    const v = render(<MagnetPlay />);
    expect(v.getByTestId("reed-interior").getAttribute("visibility")).toBe("hidden");
    expect(v.getByTestId("reed-zones").getAttribute("visibility")).toBe("hidden");
    expect(v.getByRole("status").textContent).toContain("Contact ouvert");
    expect(v.container.textContent).not.toMatch(/\d+\s*mm|LED|Détecté à/);
  });
  for (const pointerType of ["mouse", "touch"] as const) test(`${pointerType}: capture, drag, hysteresis, release and cancel`, () => {
    const v = render(<MagnetPlay />); const { handle, captured } = preparePointer(v);
    const evt = { pointerId: 7, pointerType, isPrimary: true, button: 0 };
    fireEvent.pointerDown(handle, { ...evt, clientX: 365, clientY: 225 }); expect(captured.has(7)).toBe(true);
    fireEvent.pointerMove(handle, { ...evt, clientX: 305, clientY: 140 }); expect(v.getByTestId("reed-discovery").dataset.closed).toBe("true");
    fireEvent.pointerMove(handle, { ...evt, clientX: 359, clientY: 140 }); expect(v.getByTestId("reed-discovery").dataset.progress).toBe("2");
    fireEvent.pointerUp(handle, evt); expect(captured.size).toBe(0);
    fireEvent.pointerMove(handle, { ...evt, clientX: 405, clientY: 140 }); expect(v.getByTestId("reed-discovery").dataset.closed).toBe("true");
    fireEvent.pointerDown(handle, { ...evt, clientX: 359, clientY: 140 });
    fireEvent.pointerCancel(handle, evt); expect(captured.size).toBe(0);
    fireEvent.pointerMove(handle, { ...evt, clientX: 405, clientY: 140 }); expect(v.getByTestId("reed-discovery").dataset.closed).toBe("true");
  });
  test("lost capture and secondary pointer cannot leave a dragging state", () => {
    const v = render(<MagnetPlay />); const { handle } = preparePointer(v);
    fireEvent.pointerDown(handle, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 365, clientY: 225 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 305, clientY: 140 }); expect(v.getByTestId("reed-discovery").dataset.closed).toBe("false");
    fireEvent.lostPointerCapture(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 305, clientY: 140 }); expect(v.getByTestId("reed-discovery").dataset.closed).toBe("false");
  });
  test("keyboard moves in both axes; visual toggles never change contact; blades meet when closed", () => {
    const v = render(<MagnetPlay />); const handle = v.getByTestId("reed-handle");
    for (let i = 0; i < 11; i++) fireEvent.keyDown(handle, { key: "ArrowUp" });
    for (let i = 0; i < 7; i++) fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(v.getByTestId("reed-discovery").dataset.closed).toBe("true");
    fireEvent.click(v.getByRole("button", { name: "Voir les zones" }));
    fireEvent.click(v.getByRole("button", { name: "Voir à l'intérieur" }));
    expect(v.getByTestId("reed-discovery").dataset.closed).toBe("true");
    expect(v.getByTestId("reed-interior").getAttribute("visibility")).toBe("visible");
    expect(v.getByTestId("reed-left-blade").getAttribute("d")).toBe("M181 140 H218 L226 140");
    expect(v.getByTestId("reed-right-blade").getAttribute("d")).toBe("M258 140 H234 L222 140");
    expect(v.getAllByTestId("reed-on-contour")[1]?.getAttribute("rx")).toBe("45");
    fireEvent.click(v.getByRole("button", { name: "Perpendiculaire" }));
    expect(v.getByTestId("reed-discovery").dataset.closed).toBe("false");
    expect(v.getAllByTestId("reed-on-contour")[0]?.getAttribute("rx")).toBe("72");
  });
  test("CTA invokes existing callback once; home keeps DesignSpace mounted", () => {
    let calls = 0; const v = render(<MagnetPlay onStart={() => calls++} />);
    fireEvent.click(v.getByRole("button", { name: "Trouver un capteur pour mon application" })); expect(calls).toBe(1);
    const home = readFileSync("src/routes/index.tsx", "utf8");
    expect(home).toContain("<MagnetPlay onStart={openWorkspace} />");
    expect(home).toContain("<DesignSpace"); expect(home).not.toContain("{started && <DesignSpace");
  });
  for (const locale of LANGUAGES) test(`${locale.id}: all controls and instructions translate without changing state`, () => {
    const v = render(<MagnetPlay onStart={() => {}} />);
    act(() => setLocale(locale.id));
    for (const key of ["Voir les zones", "Voir à l'intérieur", "Parallèle", "Perpendiculaire", "Trouver un capteur pour mon application", "Déplacer l'aimant dans le plan"]) {
      expect(v.getByRole("button", { name: t(key, locale.id) })).toBeTruthy();
    }
    expect(v.getByRole("status").textContent).toContain(t("Contact ouvert", locale.id));
    expect(v.getByTestId("reed-discovery").dataset.closed).toBe("false");
    fireEvent.click(v.getByRole("button", { name: t("Voir les zones", locale.id) }));
    expect(v.getByText(t("Conserve l'état précédent", locale.id))).toBeTruthy();
    expect(v.container.textContent).toContain("NS");
  });
});
