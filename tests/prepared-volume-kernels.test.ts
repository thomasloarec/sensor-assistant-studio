import {describe,test,expect} from 'bun:test';
import {cylinderExteriorFieldX,cylinderField,cylinderSignedDistance,type Vec3} from '../src/lib/detection-lab/field';
import {prepareObstacleOverlap,obstacleOverlap,type Obb} from '../src/lib/detection-lab/obstacles';
import {buildMeshObstacle} from '../src/lib/detection-lab/mesh-obstacles';
const frames:[Vec3,Vec3,Vec3][]=[[[1,0,0],[0,1,0],[0,0,1]],[[.6,.8,0],[-.8,.6,0],[0,0,1]],[[1,0,0],[0,.8,.6],[0,-.6,.8]]];
describe('exact batch preparation',()=>{
 test('prepared broad phase still invokes the loaded surface narrow phase',()=>{
  const body:Obb={path:'magnet',c:[0,0,0],a:frames[0]!,h:[.2,.2,.2]};
  const mesh=buildMeshObstacle([[[-4,-4,0],[4,-4,0],[4,4,0]],[[-4,-4,0],[4,4,0],[-4,4,0]]])!;
  const obstacle:Obb={path:'surface',c:[0,0,0],a:frames[0]!,h:[5,5,5],mesh};
  const overlap=prepareObstacleOverlap(body,obstacle);
  expect(overlap([0,0,2])).toBe(false);
  expect(overlap([0,0,0])).toBe(true);
  for(const center of [[0,0,0],[0,0,2],[0,0,.2],[4.1,4.1,0],[4.3,4.3,0]] as Vec3[])
   expect(overlap(center)).toBe(obstacleOverlap({...body,c:center},obstacle));
 });
 test('cylindrical integration matches frozen vector field and exclusion, including faces and axis',()=>{
  for(const axis of [[1,0,0],[0,1,0],[.36,.48,.8]] as Vec3[])for(const center of [[0,0,0],[1,-2,3]] as Vec3[]){
   const body={radiusMm:2,lengthMm:6,jT:1.2,axis,center};
   const points:Vec3[]=[[0,0,0],[2,0,0],[3,0,0],[0,2,0],[0,3,0],[0,0,3]];
   for(let i=0;i<200;i++)points.push([Math.sin(i)*20,Math.cos(i*.7)*12,Math.sin(i*.3)*15]);
   for(const q of points){const expected=cylinderSignedDistance(body,q)<=0?NaN:cylinderField(body,q)[0];expect(cylinderExteriorFieldX(body,q)).toBe(expected);}
  }
 });
 test('prepared SAT preserves contact, rotation, dimensions and separated boxes',()=>{
  for(const a of frames)for(const b of frames){
   const body:Obb={path:'magnet',c:[0,0,0],a,h:[2,3,4]},obstacle:Obb={path:'sensor',c:[1,2,-3],a:b,h:[5,2,6]};
   const overlap=prepareObstacleOverlap(body,obstacle);
   for(let i=0;i<250;i++){const c:Vec3=[Math.sin(i)*20,Math.cos(i*.7)*12,Math.sin(i*.3)*15];expect(overlap(c)).toBe(obstacleOverlap({...body,c},obstacle));}
   for(const x of [7,7-.001,7+.001,7-.00100001]){const c:Vec3=[x,2,-3];expect(overlap(c)).toBe(obstacleOverlap({...body,c},obstacle));}
  }
 });
});
