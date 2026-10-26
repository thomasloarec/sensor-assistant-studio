/** Orchestration hors fil principal des calculs du laboratoire.
 * Le noyau reste pur ; ce module ne fait que transporter paramètres et résultats.
 * - Worker dédié : `dispose()` le termine, donc tout calcul en cours s'arrête réellement
 *   (fermeture du panneau, révocation de session → démontage → dispose).
 * - Chaque résultat porte la clé de ses paramètres ; l'interface n'affiche que la clé courante. */
import type { Calibrations, PilotRow } from "@/lib/detection-lab/pilot";
import type { Cut, CutId } from "@/lib/detection-lab/classify";
import type { DistanceConvention, ResponseModel } from "@/lib/detection-lab/profile";

export type LabJob =
  | { kind: "calibrate"; model: ResponseModel; conv: DistanceConvention }
  | { kind: "cut"; cutId: CutId; magnetId: string; model: ResponseModel; conv: DistanceConvention; cal: Calibrations };
export type LabResult =
  | { kind: "calibrate"; cal: Calibrations; rows: PilotRow[] }
  | { kind: "cut"; cut: Cut };

export interface LabRunner {
  run(job: LabJob): Promise<LabResult>;
  dispose(): void;
}

export class LabDisposedError extends Error { constructor() { super("disposed"); } }

export async function computeJob(job: LabJob): Promise<LabResult> {
  const pilot = await import("@/lib/detection-lab/pilot");
  if (job.kind === "calibrate") {
    const cal = pilot.buildCalibrations(job.model, job.conv);
    return { kind: "calibrate", cal, rows: pilot.buildPilotTable(job.model, job.conv, cal) };
  }
  const [{ computeCutById }, { PILOT_MAGNETS }] = await Promise.all([import("@/lib/detection-lab/classify"), import("@/lib/detection-lab/magnets")]);
  const magnet = PILOT_MAGNETS.find((m) => m.id === job.magnetId);
  if (!magnet) throw new Error("magnet");
  return { kind: "cut", cut: computeCutById(job.cutId, magnet, job.model, job.conv, job.cal) };
}

export function createLabRunner(): LabRunner {
  if (typeof Worker === "undefined") return inProcessRunner();
  const worker = new Worker(new URL("./lab.worker.ts", import.meta.url), { type: "module" });
  let seq = 0, disposed = false;
  const pending = new Map<number, { resolve: (r: LabResult) => void; reject: (e: unknown) => void }>();
  worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: LabResult }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.result!); else p.reject(new Error("compute"));
  };
  worker.onerror = () => { for (const p of pending.values()) p.reject(new Error("worker")); pending.clear(); };
  return {
    run(job) {
      if (disposed) return Promise.reject(new LabDisposedError());
      const id = ++seq;
      return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker.postMessage({ id, job }); });
    },
    dispose() {
      disposed = true;
      worker.terminate();
      for (const p of pending.values()) p.reject(new LabDisposedError());
      pending.clear();
    },
  };
}

/** Repli sans Worker (tests, environnements sans support) : jamais de résolution après dispose. */
export function inProcessRunner(compute: (job: LabJob) => Promise<LabResult> = computeJob): LabRunner {
  let disposed = false;
  return {
    async run(job) {
      if (disposed) throw new LabDisposedError();
      const r = await compute(job);
      if (disposed) throw new LabDisposedError();
      return r;
    },
    dispose() { disposed = true; },
  };
}
