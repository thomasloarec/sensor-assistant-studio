/** Spatial sections of ONE computed orientation. No interpolation between orientations. */
import type { VolumeField } from './catalogue-pedagogical';
import type { SampledVolume } from '../detection-lab/workshop-experiment';
import { clearanceContains, type ClearanceRegion } from './zone-clearance';
export function sectionVolume(v:SampledVolume&{field?:VolumeField},z:number,thresholds:{low:number|null;high:number},regions:readonly ClearanceRegion[]=[]):SampledVolume{
 const f=v.field;if(!f)return {...v,cut:[]};
 const {xs,ys,zs}=f,cut:SampledVolume['cut']=[];
 if(z<zs[0]!||z>zs.at(-1)!)return {...v,cut,planeZ:z};
 const hi=Math.max(0,zs.findIndex(n=>n>=z)),lo=Math.max(0,hi-1),alpha=hi===lo?0:(z-zs[lo]!)/(zs[hi]!-zs[lo]!);
 const bound=(ns:number[],i:number):[number,number]=>[i===0?ns[i]!:(ns[i-1]!+ns[i]!)/2,i===ns.length-1?ns[i]!:(ns[i]!+ns[i+1]!)/2];
 for(let j=0;j<ys.length;j++)for(let i=0;i<xs.length;i++){
  const at=(k:number)=>(k*ys.length+j)*xs.length+i,a=at(lo),b=at(hi),x=xs[i]!,y=ys[j]!;
  const blocked=clearanceContains(regions,[x,y,z])||(alpha<1&&f.blocked[a])||(alpha>0&&f.blocked[b]);
  const va=f.values[a],vb=f.values[b];
  const response=blocked?null:alpha===0?va??null:alpha===1?vb??null:va==null||vb==null?null:va+(vb-va)*alpha;
  const [x0,x1]=bound(xs,i),[y0,y1]=bound(ys,j);
  cut.push({i,j,k:0,x,y,z,x0,x1,y0,y1,z0:z,z1:z,blocked:!!blocked,response,zone:response===null?0:response>=thresholds.high?2:thresholds.low!==null&&response>=thresholds.low?1:0});
 }
 return {...v,planeZ:z,cut};
}
type Point={x:number;y:number;v:number};
/** Marching triangles. A null corner forbids its triangle; alternating corners use an
 * outside centre, so an ambiguous cell can NEVER connect two separate lobes. */
export function contourPath(cut:SampledVolume['cut'],threshold:number):string{
 if(!cut.length)return '';
 const rows=new Map<string,typeof cut[number]>();for(const c of cut)rows.set(c.i+','+c.j,c);
 const paths:string[]=[];
 for(const a of cut){
  const b=rows.get((a.i+1)+','+a.j),c=rows.get((a.i+1)+','+(a.j+1)),d=rows.get(a.i+','+(a.j+1));
  if(!b||!c||!d)continue;
  const corners=[a,b,c,d];
  if(corners.some(p=>p.blocked||p.response===null))continue;
  const points=corners.map(p=>({x:p.x,y:p.y,v:p.response!}));
  const on=points.map(p=>p.v>=threshold),ambiguous=on[0]===on[2]&&on[1]===on[3]&&on[0]!==on[1];
  const mid={x:(a.x+c.x)/2,y:(a.y+c.y)/2,v:ambiguous?0:points.reduce((s,p)=>s+p.v,0)/4};
  for(let i=0;i<4;i++){
   const tri=[points[i]!,points[(i+1)%4]!,mid],polygon:Point[]=[];
   for(let j=0;j<3;j++){
    const p=tri[j]!,q=tri[(j+1)%3]!,pin=p.v>=threshold,qin=q.v>=threshold;
    if(pin)polygon.push(p);
    if(pin!==qin){const t=(threshold-p.v)/(q.v-p.v);polygon.push({x:p.x+t*(q.x-p.x),y:p.y+t*(q.y-p.y),v:threshold});}
   }
   if(polygon.length>=3)paths.push('M'+polygon.map(p=>`${p.x},${p.y}`).join('L')+'Z');
  }
 }
 return paths.join('');
}
