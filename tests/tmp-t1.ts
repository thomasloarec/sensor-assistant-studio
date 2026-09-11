import { DEFAULT_WORKSHOP, COFFEE_ASSEMBLY } from "@/lib/standex/magnetic-workshop";
import { mountingFromWorkshop, computeMounting, moveCouple, workshopPatchFromMounting } from "@/lib/standex/mounting";
const c = {...DEFAULT_WORKSHOP, mode:"education" as const, machine: structuredClone(COFFEE_ASSEMBLY)};
const m = mountingFromWorkshop(c);
console.log("machine base", computeMounting(m).coverage, m.travel);
for (const mv of [{translationMm:[5,0,0] as [number,number,number]}, {rotationDeg:[0,30,0] as [number,number,number]}, {translationMm:[2,3,4] as [number,number,number], rotationDeg:[0,45,0] as [number,number,number]}]) {
  const moved = moveCouple(m, mv as never);
  const n = {...c, ...workshopPatchFromMounting(moved, c)};
  const back = mountingFromWorkshop(n);
  console.log(JSON.stringify(mv), "travel", JSON.stringify(back.travel), "vs moved", JSON.stringify(moved.travel), "cov", computeMounting(back).coverage);
}
// empty space rigid
const e = mountingFromWorkshop({...DEFAULT_WORKSHOP});
for (const mv of [{rotationDeg:[0,45,0] as [number,number,number]}, {translationMm:[10,0,0] as [number,number,number]}]) {
  const moved = moveCouple(e, mv as never);
  const n = {...DEFAULT_WORKSHOP, ...workshopPatchFromMounting(moved, DEFAULT_WORKSHOP)};
  const back = mountingFromWorkshop(n);
  console.log("empty", JSON.stringify(mv), JSON.stringify(back.travel), JSON.stringify(moved.travel), computeMounting(back).coverage, back.motion.sensorYawDeg, JSON.stringify(back.anchor));
}
