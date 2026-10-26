/** Contrôle staff fail-closed du laboratoire. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { StaffLabEntry } from "@/components/standex/detection-lab/staff-gate";
import { setLocale } from "@/lib/i18n/core";
import { readFileSync } from "node:fs";
import DetectionLab from "@/components/standex/detection-lab/detection-lab";
import { computeJob, inProcessRunner, type LabJob, type LabResult } from "@/components/standex/detection-lab/lab-runner";

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
    const r = render(<DetectionLab onClose={() => {}} runner={inProcessRunner()} />);
    expect(r.container.textContent).toContain("Computing shared thresholds");
    for (let i = 0; i < 100 && !r.container.textContent?.includes("Consistency table"); i++) await flush();
    expect(r.container.textContent).toContain("Thresholds shared between magnets");
    expect(r.container.querySelectorAll("table tbody tr").length).toBeGreaterThan(100);
    setLocale("fr");
  }, 60_000);
});

describe("annulation et réactivité", () => {
  // Exécuteur contrôlé : chaque calcul attend un feu vert explicite.
  function gatedRunner() {
    const jobs: { job: LabJob; go: () => Promise<void> }[] = [];
    let disposed = false;
    const runner = {
      run: (job: LabJob) => new Promise<LabResult>((resolve, reject) => {
        jobs.push({ job, go: async () => { const r = await computeJob(job); if (disposed) reject(new Error("disposed")); else resolve(r); } });
      }),
      dispose: () => { disposed = true; },
    };
    return { runner, jobs, isDisposed: () => disposed };
  }
  test("course : un résultat A tardif n'est jamais affiché sous B/C2", async () => {
    setLocale("fr");
    const g = gatedRunner();
    const r = render(<DetectionLab onClose={() => {}} runner={g.runner} />);
    await flush();
    const [model, conv] = Array.from(r.container.querySelectorAll("select")) as HTMLSelectElement[];
    await act(async () => { model!.value = "B"; model!.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => { conv!.value = "C2"; conv!.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(g.jobs.map((j) => j.job.kind === "calibrate" && `${j.job.model}${j.job.conv}`)).toEqual(["AC1", "BC1", "BC2"]);
    await act(async () => { await g.jobs[0]!.go(); await g.jobs[1]!.go(); });
    expect(r.container.textContent).toContain("Calcul des seuils partagés");
    expect(r.container.querySelector("table")).toBeNull();
    await act(async () => { await g.jobs[2]!.go(); });
    expect(r.container.querySelector("table")).not.toBeNull();
  }, 60_000);
  test("fermeture : l'exécuteur est arrêté, aucun résultat ne revient", async () => {
    const g = gatedRunner();
    const r = render(<DetectionLab onClose={() => {}} runner={g.runner} />);
    await flush();
    r.unmount();
    expect(g.isDisposed()).toBe(true);
    const run = inProcessRunner(async (j) => computeJob(j));
    const p = run.run({ kind: "calibrate", model: "A", conv: "C1" });
    run.dispose();
    await expect(p).rejects.toThrow();
  }, 60_000);
  test("session révoquée : le laboratoire monté est démonté, donc son exécuteur arrêté", async () => {
    let staff = true, fire = () => {}, disposed = 0;
    const runner = { run: () => new Promise<LabResult>(() => {}), dispose: () => { disposed++; } };
    const r = render(<StaffLabEntry check={async () => staff} subscribe={(cb) => { fire = cb; return () => {}; }} renderLab={(close) => <DetectionLab onClose={close} runner={runner} />} />);
    await flush();
    await act(async () => { (r.container.querySelector("button") as HTMLButtonElement).click(); });
    await flush();
    staff = false;
    await act(async () => fire());
    await flush();
    expect(r.container.textContent).toBe("");
    expect(disposed).toBe(1);
  });
});
