import { useEffect, useMemo, useRef, useState } from 'react';
import { BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3, DoubleSide } from 'three';
import { Html, Line } from '@react-three/drei';
import '@react-three/fiber';
import { t } from '@/lib/i18n/core';
import { PILOT_MAGNETS } from '@/lib/detection-lab/magnets';
import { PROFILE } from '@/lib/detection-lab/profile';
import { EXPERIMENT, type ExperimentSettings, type SampledVolume, type SampleCell } from '@/lib/detection-lab/workshop-experiment';
import type { PedagogicalFrame } from '@/lib/standex/pedagogical-poses';
import type { VolumeField } from '@/lib/standex/catalogue-pedagogical';

/** Boundary faces of sampled voxels. Never interpolate across null/zero samples. */
export function surface(cells:SampleCell[],zone:1|2) {
  const selected=cells.filter(c=>c.zone===zone), keys=new Set(selected.map(c=>`${c.i},${c.j},${c.k}`));
  const positions:number[]=[];
  for(const c of selected){
    const {x0:a,x1:b,y0:d,y1:e,z0:f,z1:g}=c;
    const faces=[[[a,d,f],[a,e,f],[a,e,g],[a,d,g]],[[b,d,g],[b,e,g],[b,e,f],[b,d,f]],[[a,d,g],[b,d,g],[b,d,f],[a,d,f]],[[a,e,f],[b,e,f],[b,e,g],[a,e,g]],[[b,d,f],[b,e,f],[a,e,f],[a,d,f]],[[a,d,g],[a,e,g],[b,e,g],[b,d,g]]];
    const steps=[[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];
    faces.forEach((face,i)=>{const step=steps[i];if(!step)return;if(keys.has(`${c.i+(step[0]??0)},${c.j+(step[1]??0)},${c.k+(step[2]??0)}`))return;for(const index of [0,1,2,0,2,3]){const p=face[index];if(p)positions.push(...p);}});
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.computeVertexNormals();return geometry;
}
/** Smooth threshold surface (surface nets) over the SAME sampled field: shared vertices, smooth
 * normals, local spatial interpolation at constant threshold only. Null or blocked nodes are
 * outside, so nothing bridges the central zero gap, obstacles stay masked and the domain
 * boundary is never closed. Rendering only — the verdict never reads this mesh. */
export function smoothSurface(field:VolumeField,threshold:number):BufferGeometry {
  const {xs,ys,zs,values,blocked}=field,nx=xs.length,ny=ys.length,nz=zs.length;
  const at=(i:number,j:number,k:number)=>(k*ny+j)*nx+i;
  const value=(idx:number)=>blocked[idx]?null:values[idx]??null;
  const inside=(idx:number)=>{const v=value(idx);return v!==null&&v>=threshold;};
  const coord=(i:number,j:number,k:number):[number,number,number]=>[xs[i]??0,ys[j]??0,zs[k]??0];
  const EDGES:[number,number][][]=[[[0,0,0],[1,0,0]],[[0,1,0],[1,1,0]],[[0,0,1],[1,0,1]],[[0,1,1],[1,1,1]],[[0,0,0],[0,1,0]],[[1,0,0],[1,1,0]],[[0,0,1],[0,1,1]],[[1,0,1],[1,1,1]],[[0,0,0],[0,0,1]],[[1,0,0],[1,0,1]],[[0,1,0],[0,1,1]],[[1,1,0],[1,1,1]]];
  const cellVertex=new Map<number,number>(),positions:number[]=[];
  for(let k=0;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
    const corners=[0,1,0,1,0,1,0,1].map((_,e)=>at(i+(e&1),j+((e>>1)&1),k+((e>>2)&1)));
    const mask=corners.map(inside);
    if(mask.every(Boolean)||mask.every(m=>!m))continue;
    let px=0,py=0,pz=0,crossings=0;
    for(const [ca,cb] of EDGES){
      const ia=at(i+(ca?.[0]??0),j+(ca?.[1]??0),k+(ca?.[2]??0)),ib=at(i+(cb?.[0]??0),j+(cb?.[1]??0),k+(cb?.[2]??0));
      if(inside(ia)===inside(ib))continue;
      const va=value(ia),vb=value(ib);
      const pa=coord(i+(ca?.[0]??0),j+(ca?.[1]??0),k+(ca?.[2]??0)),pb=coord(i+(cb?.[0]??0),j+(cb?.[1]??0),k+(cb?.[2]??0));
      const f=va!==null&&vb!==null&&vb!==va?Math.min(1,Math.max(0,(threshold-va)/(vb-va))):.5;
      px+=pa[0]+f*(pb[0]-pa[0]);py+=pa[1]+f*(pb[1]-pa[1]);pz+=pa[2]+f*(pb[2]-pa[2]);crossings++;
    }
    if(!crossings)continue;
    cellVertex.set((k*(ny-1)+j)*(nx-1)+i,positions.length/3);
    positions.push(px/crossings,py/crossings,pz/crossings);
  }
  const indices:number[]=[];
  const quad=(cells:(number|undefined)[],flip:boolean)=>{
    const vs=cells.flatMap(c=>c===undefined?[]:[cellVertex.get(c)]).filter((v):v is number=>v!==undefined);
    if(vs.length!==4)return;
    const [a,b,c,d]=vs as [number,number,number,number];
    if(flip)indices.push(a,c,b,a,d,c);else indices.push(a,b,c,a,c,d);
  };
  const cell=(i:number,j:number,k:number)=>i>=0&&j>=0&&k>=0&&i<nx-1&&j<ny-1&&k<nz-1?(k*(ny-1)+j)*(nx-1)+i:undefined;
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx-1;i++){
    const a=at(i,j,k),b=at(i+1,j,k);if(inside(a)===inside(b))continue;
    quad([cell(i,j-1,k-1),cell(i,j,k-1),cell(i,j,k),cell(i,j-1,k)],inside(a));
  }
  for(let k=0;k<nz;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx;i++){
    const a=at(i,j,k),b=at(i,j+1,k);if(inside(a)===inside(b))continue;
    quad([cell(i-1,j,k-1),cell(i-1,j,k),cell(i,j,k),cell(i,j,k-1)],inside(a));
  }
  for(let k=0;k<nz-1;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const a=at(i,j,k),b=at(i,j,k+1);if(inside(a)===inside(b))continue;
    quad([cell(i-1,j-1,k),cell(i,j-1,k),cell(i,j,k),cell(i-1,j,k)],inside(a));
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export function PedagogicalLayer({frame,settings,volume,zones=true,zonesOnly=false,thresholds}:{frame:PedagogicalFrame;settings:ExperimentSettings;volume:SampledVolume|null;zones?:boolean;zonesOnly?:boolean;thresholds?:{low:number|null;high:number}|null}) {
  const magnet=PILOT_MAGNETS.find(m=>m.id===settings.magnetId);
  const rotation=useMemo(()=>new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(...frame.basis.map(v=>new Vector3(...v)) as [Vector3,Vector3,Vector3])),[frame.basis]);
  const q=useMemo(()=>new Quaternion().setFromUnitVectors(new Vector3(0,1,0),new Vector3(...frame.pose.axis).normalize()),[frame.pose.axis]);
  const field=(volume as {field?:VolumeField}|null)?.field;
  const geometries=useMemo(()=>{
    if(!volume)return [];
    if(field&&thresholds)return [thresholds.low!==null?smoothSurface(field,thresholds.low):null,smoothSurface(field,thresholds.high)].filter((g):g is BufferGeometry=>!!g);
    return [surface(volume.cells,1),surface(volume.cells,2)];
  },[volume,field,thresholds]);
  useEffect(()=>()=>geometries.forEach(g=>g.dispose()),[geometries]);
  if(!magnet&&!zonesOnly)return null;
  return <group position={frame.origin} quaternion={rotation}>
    {zones&&geometries.map((geometry,i)=><mesh key={i} geometry={geometry} renderOrder={i}>
      <meshBasicMaterial color={i===0?'#d2a746':'#32a9a8'} opacity={i===0?.12:.22} transparent depthWrite={false} side={DoubleSide}/>
    </mesh>)}
    {!zonesOnly&&magnet&&<>
    {/* Generic sensor body = EXACTLY the tested mechanical envelope (glass ±7 mm + r 1.1 mm = 16,2 × Ø2,2 mm). Opaque. */}
    <mesh rotation={[0,0,Math.PI/2]} name="pedagogical-generic-body" userData={{lengthMm:2*(PROFILE.reed.envelopeHalfLengthMm+PROFILE.reed.envelopeRadiusMm),diameterMm:2*PROFILE.reed.envelopeRadiusMm}}><capsuleGeometry args={[PROFILE.reed.envelopeRadiusMm,2*PROFILE.reed.envelopeHalfLengthMm,8,24]}/><meshStandardMaterial color="#254061" roughness={.5} metalness={.1}/></mesh>
    <Line points={[[-12,0,0],[12,0,0]]} color="#254061" lineWidth={2}/>
    <Line points={[[-EXPERIMENT.effectiveLengthMm/2,0,0],[EXPERIMENT.effectiveLengthMm/2,0,0]]} color="#535759" lineWidth={4}/>
    <Html position={[0,-4,0]} center><span className="mw-scene-label mw-ped-body-label" data-testid="pedagogical-body-label">{t('Capteur générique, reed 66 monté')}</span></Html>
    <group position={frame.pose.center} quaternion={q}>
      {[-1,1].map(sign=><mesh key={sign} position={[0,sign*magnet.lengthMm/4,0]}><cylinderGeometry args={[magnet.diameterMm/2,magnet.diameterMm/2,magnet.lengthMm/2,32]}/><meshStandardMaterial color={sign>0?'#bb454d':'#3a72ac'} roughness={.35} metalness={.25}/></mesh>)}
      <Line points={[[0,-magnet.lengthMm/2-3,0],[0,magnet.lengthMm/2+3,0]]} color="#254061" lineWidth={2}/>
      {[-1,1].map(sign=><Html key={sign} position={[0,sign*(magnet.lengthMm/2+3),0]} center><span className="mw-scene-label">{sign>0?'N':'S'}</span></Html>)}
    </group>
    </>}
  </group>;
}
export function PedagogicalCut({volume,frame,body,reedMm}:{volume:SampledVolume|null;frame:PedagogicalFrame;body?:readonly number[]|undefined;reedMm?:number|undefined}) {
  const ref=useRef<SVGSVGElement>(null),[size,setSize]=useState({width:640,height:590});
  useEffect(()=>{const el=ref.current;if(!el)return;const observer=new ResizeObserver(entries=>{const r=entries[0]?.contentRect;if(r&&r.width>0&&r.height>0)setSize({width:r.width,height:r.height});});observer.observe(el);return()=>observer.disconnect();},[]);
  const scale=Math.max(.5,Math.min((size.width-100)/48,(size.height-110)/48));
  const cx=size.width/2+15,cy=size.height/2+5,x=(n:number)=>cx+n*scale,y=(n:number)=>cy-n*scale;
  const {envelopeRadiusMm:rr}=PROFILE.reed,inPlane=Math.abs(frame.pose.center[2])<rr,hatched=!!volume?.cut.some(c=>c.blocked);
  // Long legends live in HTML below the drawing so they wrap on small screens (never truncated in SVG).
  return <figure className="mw-ped-cut-figure"><svg ref={ref} className="mw-ped-cut" viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={t('Coupe du même calcul au niveau du centre de l’aimant')}>
    <defs><pattern id="mw-cut-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" className="mw-cut-blocked-bg"/><line x1="0" y1="0" x2="0" y2="6" className="mw-cut-blocked-line"/></pattern></defs>
    <text x="12" y="22" className="t-caption">{t('Repère reed · millimètres')}</text>
    <text x="12" y="42" className="t-caption">z = {frame.pose.center[2].toFixed(1)} mm</text>
    {volume?.cut.map(c=><rect key={`${c.x},${c.y}`} x={x(c.x0)} y={y(c.y1)} width={(c.x1-c.x0)*scale} height={(c.y1-c.y0)*scale} className={c.blocked?'mw-cut-blocked':c.response===null?'mw-cut-collision':c.zone===2?'mw-cut-high':c.zone===1?'mw-cut-low':'mw-cut-empty'}/>)}
    <line x1={x(-24)} y1={cy} x2={x(24)} y2={cy} className="mw-cut-axis"/>
    <line x1={cx} y1={y(24)} x2={cx} y2={y(-24)} className="mw-cut-axis"/>
    {[-20,0,20].map(n=><g key={n}><text x={x(n)} y={y(-24)+20} textAnchor="middle" className="t-caption">{n}</text><text x={x(-24)-10} y={y(n)+5} textAnchor="end" className="t-caption">{n}</text></g>)}
    <text x={x(24)+8} y={y(-24)+20} className="t-caption">x</text><text x={x(-24)-10} y={y(24)-8} className="t-caption">y</text>
    {body?(()=>{const [bx=0,by=0,bz=0]=body,cut=Math.abs(frame.pose.center[2])<bz/2;
      // Catalogue: the conservative rectangular envelope actually tested (X×Y), projection when the plane misses it.
      return <g data-testid="pedagogical-cut-body" data-section={cut?'section':'projection'} data-envelope="box"><rect x={x(-bx/2)} y={y(by/2)} width={bx*scale} height={by*scale} className={cut?'mw-cut-body':'mw-cut-body-projection'}/></g>;})():(()=>{const r=PROFILE.reed.envelopeRadiusMm,h=PROFILE.reed.envelopeHalfLengthMm,z=frame.pose.center[2],cut=Math.abs(z)<r,hw=cut?Math.sqrt(r*r-z*z):r;
      // Real section only if plane z crosses the capsule; otherwise an explicitly labelled projection outline.
      return <g data-testid="pedagogical-cut-body" data-section={cut?'section':'projection'}><rect x={x(-h-hw)} y={y(hw)} width={2*(h+hw)*scale} height={2*hw*scale} rx={hw*scale} className={cut?'mw-cut-body':'mw-cut-body-projection'}/>
        </g>;})()}
    <line data-testid="pedagogical-cut-reed" data-length-mm={reedMm??EXPERIMENT.effectiveLengthMm} x1={x(-(reedMm??EXPERIMENT.effectiveLengthMm)/2)} y1={cy} x2={x((reedMm??EXPERIMENT.effectiveLengthMm)/2)} y2={cy} className="mw-cut-datum"/>

    <circle cx={x(frame.pose.center[0])} cy={y(frame.pose.center[1])} r="6" className="mw-cut-point"/>
  </svg><figcaption className="mw-ped-cut-caption">
    <span className="t-caption">{t(body?'Enveloppe simplifiée testée · centre interne estimé, non mesuré':inPlane?'Capteur générique, reed 66 monté':'Capteur générique, reed 66 monté — projection, hors du plan de coupe')}</span>
    {volume&&Math.abs(frame.pose.center[2])>volume.extent&&<span className="t-caption" data-testid="cut-out-of-domain">{t('Plan de coupe hors du domaine calculé (±24 mm)')}</span>}
    {hatched&&<span className="t-caption">{t('Hachuré : chevauchement possible avec une pièce du montage — à vérifier')}</span>}
  </figcaption></figure>;
}