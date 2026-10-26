/** Contrôle staff fail-closed du laboratoire. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { StaffLabEntry } from "@/components/standex/detection-lab/staff-gate";
import { setLocale } from "@/lib/i18n/core";
import { readFileSync } from "node:fs";
import DetectionLab from "@/components/standex/detection-lab/detection-lab";

beforeEach(() => {
  if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });
  setLocale("fr");
});
afterEach(() => cleanup());

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("accès staff", () => {
  test("chargement, non-staff et erreur : rien n'est rendu ni monté", async () => {
    let mounted = 0;
    for (const check of [() => new Promise<boolean>(() => {}), async () => false, async () => { throw new Error("x"); }]) {
      const r = render(<StaffLabEntry check={check} renderLab={() => { mounted++; return null; }} />);
      await flush();
      expect(r.container.textContent).toBe("");
      r.unmount();
    }
    expect(mounted).toBe(0);
  });
  test("staff : entrée visible ; révocation de session : masquée", async () => {
    let staff = true, fire = () => {};
    const check = async () => staff;
    const subscribe = (cb: () => void) => { fire = cb; return () => {}; };
    const r = render(<StaffLabEntry check={check} subscribe={subscribe} renderLab={() => <p>LAB</p>} />);
    await flush();
    expect(r.container.textContent).toContain("Laboratoire de détection");
    await act(async () => { (r.container.querySelector("button") as HTMLButtonElement).click(); });
    expect(r.container.textContent).toContain("LAB");
    staff = false;
    await act(async () => fire());
    await flush();
    expect(r.container.textContent).toBe("");
  });
  test("le rôle vient uniquement du serveur, le module est chargé paresseusement", () => {
    const gate = readFileSync("src/components/standex/detection-lab/staff-gate.tsx", "utf8");
    expect(gate).toContain("checkLeadBackend");
    expect(gate).not.toMatch(/localStorage|user_metadata|URLSearchParams|location\.search/);
    const internal = readFileSync("src/routes/internal.tsx", "utf8");
    expect(internal).toContain('lazy(() => import("@/components/standex/detection-lab/detection-lab"))');
    expect(internal).not.toMatch(/import DetectionLab|from "@\/components\/standex\/detection-lab\/detection-lab"/);
  });
});

describe("rendu du laboratoire", () => {
  test("état occupé puis tableau avec seuils partagés, en anglais", async () => {
    setLocale("en");
    const r = render(<DetectionLab onClose={() => {}} />);
    expect(r.container.textContent).toContain("Computing shared thresholds");
    for (let i = 0; i < 100 && !r.container.textContent?.includes("Consistency table"); i++) await flush();
    expect(r.container.textContent).toContain("Thresholds shared between magnets");
    expect(r.container.querySelectorAll("table tbody tr").length).toBeGreaterThan(100);
    setLocale("fr");
  }, 60_000);
});
