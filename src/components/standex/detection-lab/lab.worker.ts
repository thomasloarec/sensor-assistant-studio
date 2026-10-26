/// <reference lib="webworker" />
import { computeJob, type LabJob } from "./lab-runner";

self.onmessage = async (e: MessageEvent<{ id: number; job: LabJob }>) => {
  try {
    const result = await computeJob(e.data.job);
    self.postMessage({ id: e.data.id, ok: true, result });
  } catch {
    self.postMessage({ id: e.data.id, ok: false });
  }
};
