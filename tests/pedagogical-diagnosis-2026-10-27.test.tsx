/** Lot « causes, légendes, lisibilité » : diagnostic pur (même moteur), remède
 *  vérifié par evaluatePlacement toutes hypothèses, corps générique = enveloppe,
 *  quatre états sans circuit électrique dans le VRAI Workshop monté. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { describe, expect, mock, test } from "bun:test";
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";

if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });
mock.module("@radix-ui/react-use-layout-effect", () => ({ useLayoutEffect: React.useLayoutEffect }));

const lab = () => import("../src/lib/detection-lab/workshop-experiment");
const diag = () => import("../src/lib/detection-lab/placement-diagnosis");
const poses = () => import("../src/lib/standex/pedagogical-poses");
const PILOTS = [["SMCO5-5X4", 6], ["N45-4X19", 16]] as const;

describe("diagnostic des causes (pur, même moteur)", () => {
  for (const [id, depth] of PILOTS) {
    test(`${id} : centré = zone centrale, décalé à même profondeur = favorable sans cause`, async () => {
      const { DEFAULT_EXPERIMENT, evaluatePlacement } = await lab(); const { diagnosePlacement } = await diag();
      const s = { ...DEFAULT_EXPERIMENT, magnetId: id };
      const centred = { center: [0, depth, 0] as [number, number, number], axis: [0, 1, 0] as [number, number, number] };
      expect(evaluatePlacement(s, centred).state).toBe("unfavorable");
      expect(diagnosePlacement(s, centred).cause).toBe("central");
      // Symmetry tolerance absorbs float noise, not a real offset.
      expect(diagnosePlacement(s, { ...centred, center: [1e-9, depth, 0] }).cause).toBe("central");
      const offset = { center: [8, depth, 0] as [number, number, number], axis: [0, 1, 0] as [number, number, number] };
      const e = evaluatePlacement(s, offset);
      expect(e.state).toBe("favorable");
      expect(e.cause).toBe("distance"); // legacy default field, never displayed
      expect(diagnosePlacement(s, offset).cause).toBe("none");
    });
    test(`${id} : perpendiculaire sur le prolongement axial = orientation axiale`, async () => {
      const { DEFAULT_EXPERIMENT } = await lab(); const { diagnosePlacement } = await diag();
      expect(diagnosePlacement({ ...DEFAULT_EXPERIMENT, magnetId: id }, { center: [id[0] === "S" ? 14 : 26, 0, 0], axis: [0, 1, 0] }).cause).toBe("axial");
    });
  }
  test("cause non établie reste « undetermined », jamais « distance » inventée", async () => {
    const { DEFAULT_EXPERIMENT, evaluatePlacement } = await lab(); const { diagnosePlacement } = await diag();
    const far = { center: [0, 40, 0] as [number, number, number], axis: [1, 0, 0] as [number, number, number] };
    expect(evaluatePlacement(DEFAULT_EXPERIMENT, far).cause).toBe("distance");
    expect(diagnosePlacement(DEFAULT_EXPERIMENT, far).cause).toBe("undetermined");
  });
  test("indisponible : la cause mécanique est conservée", async () => {
    const { DEFAULT_EXPERIMENT } = await lab(); const { diagnosePlacement } = await diag();
    const box = [{ path: "p", c: [0, 0, 0] as [number, number, number], a: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as [[number, number, number], [number, number, number], [number, number, number]], h: [10, 3, 3] as [number, number, number] }];
    expect(diagnosePlacement(DEFAULT_EXPERIMENT, { center: [8, 6, 0], axis: [0, 1, 0] }, box).cause).toBe("reed_overlap");
  });
});

describe("remède vérifié (toutes hypothèses, libertés déclarées)", () => {
  const cfg = async (id: string, kind: "centred" | "offset") => {
    const { DEFAULT_WORKSHOP } = await import("../src/lib/standex/magnetic-workshop"); const { pedagogicalPreset } = await poses();
    return { ...DEFAULT_WORKSHOP, sensorId: "GENERIC", ...pedagogicalPreset(kind, id)!.config };
  };
  test("N45 centré : rotation suffisante, vérifiée favorable avec les neuf hypothèses", async () => {
    const { DEFAULT_EXPERIMENT, evaluatePlacement } = await lab(); const { pedagogicalRemedy, pedagogicalFrame } = await poses();
    const s = { ...DEFAULT_EXPERIMENT, magnetId: "N45-4X19", hypotheses: false, rotationFreedom: true };
    const r = pedagogicalRemedy(await cfg("N45-4X19", "centred"), .5, s);
    expect(r.kind).toBe("verified");
    if (r.kind !== "verified") return;
    expect(Math.abs(r.rotationDeg)).toBe(90); expect(r.lateralMm).toBe(0);
    expect(evaluatePlacement({ ...s, hypotheses: true }, pedagogicalFrame(r.config, .5).pose).state).toBe("favorable");
  });
  test("SmCo centré : rotation insuffisante → aucun placement trouvé, rapprochement jamais proposé", async () => {
    const { DEFAULT_EXPERIMENT } = await lab(); const { pedagogicalRemedy } = await poses();
    const c = await cfg("SMCO5-5X4", "centred");
    expect(pedagogicalRemedy(c, .5, { ...DEFAULT_EXPERIMENT, rotationFreedom: true }).kind).toBe("none-found");
    const both = pedagogicalRemedy(c, .5, { ...DEFAULT_EXPERIMENT, rotationFreedom: true, lateralFreedomMm: 8 });
    expect(both.kind).toBe("verified");
    if (both.kind === "verified") expect(both.config.end).toBe(c.end); // depth unchanged
  });
  test("zéro liberté, import verrouillé, mouvement non pris en charge", async () => {
    const { DEFAULT_EXPERIMENT } = await lab(); const { pedagogicalRemedy } = await poses();
    const { DEMO_ASSEMBLIES } = await import("../src/lib/standex/machine-demos");
    const c = await cfg("SMCO5-5X4", "centred");
    expect(pedagogicalRemedy(c, .5, DEFAULT_EXPERIMENT).kind).toBe("no-freedom");
    expect(pedagogicalRemedy({ ...c, machine: structuredClone(DEMO_ASSEMBLIES["builtin:arm-v1"]!) }, .5, { ...DEFAULT_EXPERIMENT, rotationFreedom: true }).kind).toBe("locked");
    expect(pedagogicalRemedy({ ...c, motion: "slide" }, .5, { ...DEFAULT_EXPERIMENT, rotationFreedom: true }).kind).toBe("unsupported");
  });
});

const states = async () => {
  const { DEFAULT_WORKSHOP } = await import("../src/lib/standex/magnetic-workshop"); const { DEFAULT_EXPERIMENT } = await lab(); const { pedagogicalPreset } = await poses();
  const base = { ...DEFAULT_WORKSHOP, sensorId: "GENERIC", mode: "education" as const, magnetModel: "generic" };
  const n = (id: "centred" | "offset" | "parallel", m = "N45-4X19") => ({ ...base, ...pedagogicalPreset(id, m)!.config });
  return {
    favorable: { config: n("offset"), settings: { ...DEFAULT_EXPERIMENT, magnetId: "N45-4X19" } },
    unfavorable: { config: n("centred"), settings: { ...DEFAULT_EXPERIMENT, magnetId: "N45-4X19" } },
    variable: { config: n("parallel", "SMCO5-5X4"), settings: { ...DEFAULT_EXPERIMENT } },
    unavailable: { config: n("offset"), settings: { ...DEFAULT_EXPERIMENT, magnetId: "N45-4X19", nearbyMaterial: true } },
  };
};

describe("Workshop monté : quatre états sans circuit électrique", () => {
  test("lampe, courant, ouvert/fermé et contact souhaité absents ; favorable ≠ contact fermé", async () => {
    const { setLocale } = await import("../src/lib/i18n/core"); setLocale("fr");
    const { default: MagneticWorkshop } = await import("../src/components/standex/workshop/workshop");
    const { DEFAULT_EXPERIMENT, evaluatePlacement } = await lab(); const { pedagogicalFrame } = await poses();
    for (const [state, d] of Object.entries(await states())) {
      expect(evaluatePlacement(d.settings as typeof DEFAULT_EXPERIMENT, pedagogicalFrame(d.config, .5).pose).state).toBe(state as never);
      const v = render(React.createElement(MagneticWorkshop, { pedagogical: true, initialPedagogicalDraft: { ...d, progress: .5 }, onClose: () => {}, onSave: () => {} }));
      const banner = await waitFor(() => v.getByTestId("pedagogical-verdict"));
      expect(banner.textContent).toContain({ favorable: "Placement favorable", variable: "Détection variable", unfavorable: "Placement défavorable", unavailable: "Estimation indisponible" }[state]!);
      expect(banner.textContent).toContain("Estimation indicative");
      if (state === "favorable") { expect(banner.getAttribute("data-cause")).toBe("none"); expect(v.queryByTestId("pedagogical-cause")).toBeNull(); }
      const html = v.container.innerHTML;
      expect(v.container.querySelector(".mw-contact-circuit")).toBeNull();
      expect(v.container.querySelector(".mw-target-track")).toBeNull();
      expect(v.queryByTestId("guide-contact")).toBeNull();
      for (const word of ["Contact fermé", "Contact ouvert", "Fermé", "Ouvert", "Contact souhaité", "lampe", "courant"]) expect(html).not.toContain(word);
      expect(v.container.querySelector(".mw-canvas")!.getAttribute("aria-label")).not.toMatch(/fermé|ouvert/i);
      // Legends and folded limits.
      const legend = v.getByTestId("pedagogical-legend").textContent!;
      expect(legend).toContain("Capteur générique, reed 66 monté");
      expect(legend).toContain("Positions où l’aimant rencontrerait ce corps");
      const sources = v.getByTestId("pedagogical-sources") as HTMLDetailsElement;
      expect(sources.open).toBe(false);
      expect(sources.contains(v.getByTestId("pedagogical-timeline-limits"))).toBe(true);
      v.unmount();
    }
  }, 30000);

  test("remède du bandeau : proposé via appliquer/annuler, invalidé au changement de pose", async () => {
    const { default: MagneticWorkshop } = await import("../src/components/standex/workshop/workshop");
    const d = (await states()).unfavorable;
    const v = render(React.createElement(MagneticWorkshop, { pedagogical: true, initialPedagogicalDraft: { ...d, settings: { ...d.settings, rotationFreedom: true }, progress: .5 }, onClose: () => {}, onSave: () => {} }));
    const remedy = await waitFor(() => v.getByTestId("pedagogical-remedy"));
    expect(remedy.textContent).toContain("rotation de -90°");
    expect(v.getByTestId("pedagogical-cause").textContent).toBe("Zone centrale entre les deux lobes");
    await act(async () => fireEvent.click(v.getByText("Proposer ce placement")));
    expect(v.getByText("Appliquer le placement proposé")).toBeTruthy();
    // Pose change (keyboard-equivalent slider input): remedy recomputed for the NEW pose.
    await act(async () => fireEvent.input(v.getByRole("slider", { name: "Décalage latéral" }), { target: { value: "8" } }));
    await waitFor(() => expect(v.getByTestId("pedagogical-verdict").textContent).toContain("Placement favorable"));
    expect(v.queryByTestId("pedagogical-remedy")).toBeNull();
    v.unmount();
  }, 20000);

  test("bornes : libellé en police courante, nombre et unité seuls en .t-metric", async () => {
    const { default: MagneticWorkshop } = await import("../src/components/standex/workshop/workshop");
    const { DEFAULT_WORKSHOP } = await import("../src/lib/standex/magnetic-workshop"); const { DEFAULT_EXPERIMENT } = await lab();
    const v = render(React.createElement(MagneticWorkshop, { pedagogical: true, initialPedagogicalDraft: { config: { ...DEFAULT_WORKSHOP, sensorId: "GENERIC", mode: "education" as const, magnetModel: "generic", geometry: "D3", magnetAngle: 0, lateralShift: 0, magnetTilt: 0, motion: "approach" }, settings: { ...DEFAULT_EXPERIMENT }, progress: .5 }, onClose: () => {}, onSave: () => {} }));
    const bounds = await waitFor(() => { const b = v.getAllByTestId("pedagogical-bound"); expect(b.length).toBeGreaterThan(0); return b; });
    for (const b of bounds) {
      expect(b.classList.contains("t-metric")).toBe(false);
      const metric = b.querySelector(".t-metric");
      if (metric) expect(metric.textContent).toMatch(/^[\d.,]+ mm$/);
    }
    v.unmount();
  }, 20000);
});

describe("corps générique = enveloppe mécanique testée", () => {
  test("16,2 × Ø2,2 mm, identique au profil et à l’obstacle reed", async () => {
    const { PROFILE } = await import("../src/lib/detection-lab/profile");
    const { reedCapsuleAt } = await import("../src/lib/detection-lab/obstacles");
    expect(2 * (PROFILE.reed.envelopeHalfLengthMm + PROFILE.reed.envelopeRadiusMm)).toBeCloseTo(16.2, 9);
    expect(2 * PROFILE.reed.envelopeRadiusMm).toBeCloseTo(2.2, 9);
    const box = reedCapsuleAt([0, 0, 0]);
    expect(box.h[0] * 2).toBeCloseTo(16.2, 9); expect(box.h[1] * 2).toBeCloseTo(2.2, 9);
  });
  test("coupe : section réelle dans le plan, projection signalée hors plan", async () => {
    const { PedagogicalCut } = await import("../src/components/standex/workshop/pedagogical-layer");
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} disconnect() {} };
    const frame = (z: number) => ({ origin: [0, 0, 0], basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], pose: { center: [8, 6, z], axis: [0, 1, 0] }, world: { center: [8, 6, z], axis: [0, 1, 0] } }) as never;
    const a = render(React.createElement(PedagogicalCut, { volume: null, frame: frame(0) }));
    expect(a.getByTestId("pedagogical-cut-body").getAttribute("data-section")).toBe("section"); a.unmount();
    const b = render(React.createElement(PedagogicalCut, { volume: null, frame: frame(5) }));
    expect(b.getByTestId("pedagogical-cut-body").getAttribute("data-section")).toBe("projection");
    expect(b.container.textContent).toContain("projection, hors du plan de coupe"); b.unmount();
  });
});

describe("contre-revue 4311e3ca", () => {
  // Expected values written from the review (independent of the implementation).
  const HIGH_C = 2.7121097617;
  test("2) nominal déjà favorable mais variable : cause hypothèses, jamais orientation", async () => {
    const { DEFAULT_EXPERIMENT, evaluatePlacement, classThresholds } = await lab(); const { diagnosePlacement } = await diag();
    expect(classThresholds("C")!.high).toBeCloseTo(HIGH_C, 9);
    for (const [id, center, nominal] of [["SMCO5-5X4", [0, 4.75, 0], 7.4734260482], ["N45-4X19", [0, 16.5, 0], 3.0716881913]] as const) {
      const s = { ...DEFAULT_EXPERIMENT, magnetId: id }, pose = { center: [...center] as [number, number, number], axis: [1, 0, 0] as [number, number, number] };
      const e = evaluatePlacement(s, pose);
      expect(e.state).toBe("variable");
      expect(e.nominal!.ok && e.nominal!.response).toBeCloseTo(nominal, 8);
      const d = diagnosePlacement(s, pose);
      expect(d.cause).toBe("hypotheses");
      expect(d.cause).not.toBe("orientation");
    }
  });
  test("3) N45 [30,0,0] ⟂ : axial + rotation sur place insuffisante + cause double démontrée, verdict inchangé", async () => {
    const { DEFAULT_EXPERIMENT, evaluatePlacement, classThresholds } = await lab(); const { diagnosePlacement } = await diag();
    const { evaluatePose } = await import("../src/lib/detection-lab/pose"); const { PILOT_MAGNETS } = await import("../src/lib/detection-lab/magnets");
    const { nominalScenario } = await lab();
    const s = { ...DEFAULT_EXPERIMENT, magnetId: "N45-4X19" }, pose = { center: [30, 0, 0] as [number, number, number], axis: [0, 1, 0] as [number, number, number] };
    const before = evaluatePlacement(s, pose);
    const par = evaluatePose(PILOT_MAGNETS.find(m => m.id === "N45-4X19")!, { center: [30, 0, 0], axis: [1, 0, 0] }, nominalScenario(), "B");
    expect(par.ok && par.response).toBeCloseTo(1.52, 1);
    expect(par.ok && par.response < classThresholds("C")!.high).toBe(true);
    const d = diagnosePlacement(s, pose);
    expect(d).toMatchObject({ cause: "axial", rotationInPlace: "insufficient", closerAndRotated: true });
    expect(evaluatePlacement(s, pose)).toEqual(before);
  });
  test("1) bandeau pendant la lecture : pas d'ancienne cause ni de remède ; indisponibilité conservée", async () => {
    const { PedagogicalBanner } = await import("../src/components/standex/workshop/pedagogical-controls");
    const { DEFAULT_EXPERIMENT, evaluatePlacement } = await lab();
    const s = { ...DEFAULT_EXPERIMENT, magnetId: "N45-4X19" };
    const unf = evaluatePlacement(s, { center: [0, 16, 0], axis: [0, 1, 0] });
    const a = render(React.createElement(PedagogicalBanner, { evidence: unf, diagnosis: null, remedy: { kind: "none-found" } }));
    expect(a.getByTestId("pedagogical-cause").textContent).toBe("Mettre en pause pour analyser la cause");
    expect(a.queryByTestId("pedagogical-remedy")).toBeNull();
    expect(a.container.textContent).not.toContain("zone centrale à éviter");
    a.unmount();
    const b = render(React.createElement(PedagogicalBanner, { evidence: { ...unf, state: "unavailable", cause: "reed_overlap" }, diagnosis: null }));
    expect(b.getByTestId("pedagogical-cause").textContent).toContain("Chevauchement possible du reed");
    b.unmount();
  });
  test("1) Workshop monté : Lancer le mouvement → cause en attente, Pause → cause recalculée", async () => {
    const { default: MagneticWorkshop } = await import("../src/components/standex/workshop/workshop");
    const d = (await states()).unfavorable;
    const v = render(React.createElement(MagneticWorkshop, { pedagogical: true, initialPedagogicalDraft: { ...d, progress: .5 }, onClose: () => {}, onSave: () => {} }));
    await waitFor(() => expect(v.getByTestId("pedagogical-cause").textContent).toBe("Zone centrale entre les deux lobes"));
    await act(async () => fireEvent.click(v.getByRole("button", { name: /Lancer le mouvement/ })));
    expect(v.getByTestId("pedagogical-verdict").textContent).not.toContain("zone centrale à éviter");
    expect(v.getByTestId("pedagogical-verdict").getAttribute("data-cause")).toMatch(/pending|none|unavailable|reed_overlap|collision/);
    await act(async () => fireEvent.click(v.getByRole("button", { name: /Pause/ })));
    expect(v.getByTestId("pedagogical-verdict").getAttribute("data-cause")).not.toBe("pending");
    v.unmount();
  }, 20000);
  test("4) Sources et limites suit la case hypothèses", async () => {
    const { default: MagneticWorkshop } = await import("../src/components/standex/workshop/workshop");
    const d = (await states()).unfavorable;
    for (const hypotheses of [true, false]) {
      const v = render(React.createElement(MagneticWorkshop, { pedagogical: true, initialPedagogicalDraft: { ...d, settings: { ...d.settings, hypotheses }, progress: .5 }, onClose: () => {}, onSave: () => {} }));
      const txt = (await waitFor(() => v.getByTestId("pedagogical-hypotheses-mode"))).textContent!;
      expect(txt).toContain(hypotheses ? "accord des neuf hypothèses" : "scénario nominal seul");
      v.unmount();
    }
  }, 20000);
  test("5) légendes longues de la coupe en HTML (retour à la ligne), pas en SVG", async () => {
    const { PedagogicalCut } = await import("../src/components/standex/workshop/pedagogical-layer");
    const frame = { origin: [0, 0, 0], basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], pose: { center: [8, 6, 5], axis: [0, 1, 0] }, world: { center: [8, 6, 5], axis: [0, 1, 0] } } as never;
    const vol = { cut: [{ x: 0, y: 0, x0: 0, x1: 1, y0: 0, y1: 1, zone: 0, response: 1, blocked: true }] } as never;
    const r = render(React.createElement(PedagogicalCut, { volume: vol, frame }));
    const svgText = r.container.querySelector("svg")!.textContent!;
    expect(svgText).not.toContain("projection"); expect(svgText).not.toContain("Hachuré");
    const cap = r.container.querySelector("figcaption")!.textContent!;
    expect(cap).toContain("projection, hors du plan de coupe"); expect(cap).toContain("Hachuré : chevauchement possible avec une pièce du montage");
    r.unmount();
  });
});
