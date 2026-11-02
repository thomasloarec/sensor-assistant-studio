import { expect, test } from "bun:test";
import { Vector3 } from "three";
import { attachPose, parseAttachment, type Attachment } from "../src/lib/standex/machine-mounting";
import { rotate, COFFEE_ASSEMBLY, componentPose, pointAt } from "../src/lib/standex/machine-assembly";
import { DEFAULT_WORKSHOP, parseWorkshopConfig, type Vec3 } from "../src/lib/standex/magnetic-workshop";
import { catalogueFrame } from "../src/lib/standex/catalogue-pedagogical";
import { attachPatch } from "../src/components/standex/workshop/machine-guide";
import { mountingFootprint } from "../src/lib/standex/machine-detection-positions";

const normal = new Vector3(1, 2, 3).normalize().toArray() as Vec3;
const original: Attachment = {kind:"surface", support:"moving", partPath:"0/1",
  point:[10,20,30], normal, offsetMm:1, spinDeg:37, flip:false, depthRef:"collar", axisSource:"face"};
const config = {...DEFAULT_WORKSHOP, sensorId:"MK03", magnetModel:"NDFEB250175H-6X10", magnetization:"axial" as const,
  machine:{...structuredClone(COFFEE_ASSEMBLY),motion:"rotation" as const,openingAngle:77}};
const near = (a:Vec3,b:Vec3) => a.forEach((v,i)=>expect(v).toBeCloseTo(b[i]!,7));

test("side/end orientations and reversal keep the whole contact face at the original support, including motion",()=>{
  for(const surfaceOrientation of ["side","end"] as const) for(const flip of [false,true]) {
    const a={...original,surfaceOrientation,flip},p=attachPose(a,{lengthMm:10,heightMm:6});
    const axis=rotate(surfaceOrientation==="end"?[1,0,0]:[0,1,0],p.rotation);
    expect(Math.abs(new Vector3(...axis).dot(new Vector3(...normal)))).toBeCloseTo(1,7);
    const contact = new Vector3(...p.position).addScaledVector(new Vector3(...normal),-(surfaceOrientation==="end"?5:3)-a.offsetMm);
    near(contact.toArray() as Vec3,a.point);
    const machine={...config.machine,...attachPatch("magnet",a,config)};
    const offset=machine.magnetPosition.map((v,i)=>v-a.point[i]!) as Vec3;
    const movedCentre=componentPose(machine,"magnet",.7).position;
    near(movedCentre,pointAt(machine,a.partPath,machine.magnetPosition,.7));
    expect(Math.hypot(...offset)).toBeCloseTo((surfaceOrientation==="end"?5:3)+a.offsetMm,7);
    const footprint=mountingFootprint(config,a);
    footprint.forEach(v=>expect(new Vector3(...v).dot(new Vector3(...normal))).toBeCloseTo(0,7));
    expect(parseWorkshopConfig({...config,machine})?.machine?.magnetAttach).toEqual(a);
  }
});

test("reversal changes the actual pole axis and end mounting turns it through 90 degrees",()=>{
  const axis=(a:Attachment)=>catalogueFrame({...config,machine:{...config.machine,...attachPatch("magnet",a,config)}},0).world.axis;
  const before=axis(original),flipped=axis({...original,flip:true}),end=axis({...original,surfaceOrientation:"end"});
  near(flipped,before.map(v=>-v) as Vec3);
  expect(new Vector3(...before).normalize().dot(new Vector3(...end).normalize())).toBeCloseTo(0,7);
});

test("old attachments preserve their default orientation; invalid new settings are rejected",()=>{
  expect(parseAttachment(original)).toEqual(original);
  expect(parseAttachment({...original,surfaceOrientation:"floating"})).toBeNull();
});
