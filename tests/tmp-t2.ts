import { DEFAULT_WORKSHOP } from "@/lib/standex/magnetic-workshop";
import { mountingFromWorkshop, computeMounting, moveCouple, workshopPatchFromMounting } from "@/lib/standex/mounting";
for (const a of [0,15,45,90,180,-45]) {
  const c = {...DEFAULT_WORKSHOP, mountAngle:a};
  const r = computeMounting(mountingFromWorkshop(c));
  console.log("mountAngle", a, r.coverage, r.reasons.join(","));
}
for (const u of [0,0.37,1]) {
  const c = {...DEFAULT_WORKSHOP, mountAngle:45};
  const m = mountingFromWorkshop(c, u as never);
  const moved = moveCouple(m, {rotationDeg:[0,45,0]} as never);
  const n = {...c, ...workshopPatchFromMounting(moved, c, u as never)};
  const back = mountingFromWorkshop(n, u as never);
  console.log("u", u, "mountAngle", n.mountAngle, computeMounting(back).coverage, JSON.stringify(back.travel));
}
