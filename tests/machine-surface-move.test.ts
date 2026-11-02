import {expect,test} from "bun:test";
import {Vector3} from "three";
import {fixture} from "./helpers/machine-search-fixture";
import {surfaceMoveFrame,surfaceMovePatch} from "../src/lib/standex/machine-surface-move";
import {attachPatch} from "../src/components/standex/workshop/machine-guide";
import {componentPose,pointAt} from "../src/lib/standex/machine-assembly";
import {freePosePatch} from "../src/lib/standex/machine-mounting";
import type {Vec3} from "../src/lib/standex/magnetic-workshop";

test("sensor and magnet drag keep their support, orientation and offset across moving poses",()=>{
 for(const which of ["sensor","magnet"] as const){
  const {c,asset,attach}=fixture(16,100);
  const a={...attach,spinDeg:37,flip:true,offsetMm:1.5};
  Object.assign(c.machine!,attachPatch(which,a,c));
  c.machine!.motion="rotation";c.machine!.openingAngle=73;c.machine!.rotationAxis="z";
  for(const u of [0,.4,1]){
   const frame=surfaceMoveFrame(c.machine!,which,u)!;
   const delta=new Vector3(3,-2,0).applyQuaternion(frame.quaternion);
   const requested=new Vector3(...frame.position).add(delta).toArray() as Vec3;
   const patch=surfaceMovePatch(c,asset,which,requested,u)!;
   expect(patch).not.toBeNull();expect(freePosePatch(patch).freed).toHaveLength(0);
   const changed=which==="sensor"?patch.sensorAttach!:patch.magnetAttach!;
   expect({...changed,point:a.point}).toEqual(a);
   const next={...c.machine!,...patch},actual=componentPose(next,which,u).position;
   actual.forEach((v,i)=>expect(v).toBeCloseTo(requested[i]!,7));
   expect(changed.point[1]).toBeCloseTo(a.point[1],7);
   expect(new Vector3(...pointAt(next,a.partPath,changed.point,u)).distanceTo(new Vector3(...actual))).toBeGreaterThan(0);
  }
  const frame=surfaceMoveFrame(c.machine!,which)!;
  const outside=new Vector3(...frame.position).add(new Vector3(200,0,0).applyQuaternion(frame.quaternion)).toArray() as Vec3;
  expect(surfaceMovePatch(c,asset,which,outside)).toBeNull();
  expect(surfaceMovePatch(c,asset,which,[NaN,0,0])).toBeNull();
  asset.dispose();
 }
});

test("free components never silently acquire or switch a mounting face",()=>{
 const {c,asset}=fixture();delete c.machine!.magnetAttach;
 expect(surfaceMoveFrame(c.machine!,"magnet")).toBeNull();
 expect(surfaceMovePatch(c,asset,"magnet",[0,9,0])).toBeNull();asset.dispose();
});
