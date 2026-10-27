import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3, DoubleSide } from 'three';
import { Html, Line } from '@react-three/drei';
import '@react-three/fiber';
import { t } from '@/lib/i18n/core';
import { PILOT_MAGNETS } from '@/lib/detection-lab/magnets';
import { EXPERIMENT, type ExperimentSettings, type SampledVolume, type SampleCell } from '@/lib/detection-lab/workshop-experiment';
import type { PedagogicalFrame } from '@/lib/standex/pedagogical-poses';

/** Boundary faces of sampled voxels. Never interpolate across null/zero samples. */
function surface(cells:SampleCell[],zone:1|2) {
  const selected=cells.filter(c=>c.zone===zone), keys=new Set(selected.map(c=>`${c.x},${c.y},${c.z}`));
  const positions:number[]=[];
  for(const c of selected){
    const {x0:a,x1:b,y0:d,y1:e,z0:f,z1:g}=c;
    const faces=[[[a,d,f],[a,e,f],[a,e,g],[a,d,g]],[[b,d,g],[b,e,g],[b,e,f],[b,d,f]],[[a,d,g],[b,d,g],[b,d,f],[a,d,f]],[[a,e,f],[b,e,f],[b,e,g],[a,e,g]],[[b,d,f],[b,e,f],[a,e,f],[a,d,f]],[[a,d,g],[a,e,g],[b,e,g],[b,d,g]]];
    const steps=[[-(b-a),0,0],[b-a,0,0],[0,-(e-d),0],[0,e-d,0],[0,0,-(g-f)],[0,0,g-f]];
    faces.forEach((face,i)=>{const step=steps[i];if(!step)return;if(keys.has(`${c.x+(step[0]??0)},${c.y+(step[1]??0)},${c.z+(step[2]??0)}`))return;for(const index of [0,1,2,0,2,3]){const p=face[index];if(p)positions.push(...p);}});
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.computeVertexNormals();return geometry;
}
export function PedagogicalLayer({frame,settings,volume,zones=true}:{frame:PedagogicalFrame;settings:ExperimentSettings;volume:SampledVolume|null;zones?:boolean}) {
  const magnet=PILOT_MAGNETS.find(m=>m.id===settings.magnetId);
  const rotation=useMemo(()=>new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(...frame.basis.map(v=>new Vector3(...v)) as [Vector3,Vector3,Vector3])),[frame.basis]);
  const q=useMemo(()=>new Quaternion().setFromUnitVectors(new Vector3(0,1,0),new Vector3(...frame.pose.axis).normalize()),[frame.pose.axis]);
  const geometries=useMemo(()=>volume?[surface(volume.cells,1),surface(volume.cells,2)]:[],[volume]);
  useEffect(()=>()=>geometries.forEach(g=>g.dispose()),[geometries]);
  if(!magnet)return null;
  return <group position={frame.origin} quaternion={rotation}>
    {zones&&geometries.map((geometry,i)=><mesh key={i} geometry={geometry} renderOrder={i}>
      <meshBasicMaterial color={i===0?'#d2a746':'#32a9a8'} opacity={i===0?.12:.22} transparent depthWrite={false} side={DoubleSide}/>
    </mesh>)}
    <mesh rotation={[0,0,Math.PI/2]}><capsuleGeometry args={[1.1,14,8,24]}/><meshPhysicalMaterial color="#cedcda" transparent opacity={.4} roughness={.15} depthWrite={false}/></mesh>
    <Line points={[[-12,0,0],[12,0,0]]} color="#254061" lineWidth={2}/>
    <Line points={[[-EXPERIMENT.effectiveLengthMm/2,0,0],[EXPERIMENT.effectiveLengthMm/2,0,0]]} color="#535759" lineWidth={4}/>
    <Html position={[0,-4,0]} center><span className="mw-scene-label">{t('Repère reed Form66 exploratoire')}</span></Html>
    <group position={frame.pose.center} quaternion={q}>
      {[-1,1].map(sign=><mesh key={sign} position={[0,sign*magnet.lengthMm/4,0]}><cylinderGeometry args={[magnet.diameterMm/2,magnet.diameterMm/2,magnet.lengthMm/2,32]}/><meshStandardMaterial color={sign>0?'#bb454d':'#3a72ac'} roughness={.35} metalness={.25}/></mesh>)}
      <Line points={[[0,-magnet.lengthMm/2-3,0],[0,magnet.lengthMm/2+3,0]]} color="#254061" lineWidth={2}/>
      {[-1,1].map(sign=><Html key={sign} position={[0,sign*(magnet.lengthMm/2+3),0]} center><span className="mw-scene-label">{sign>0?'N':'S'}</span></Html>)}
    </group>
  </group>;
}
export function PedagogicalCut({volume,frame}:{volume:SampledVolume|null;frame:PedagogicalFrame}) {
  return <svg className="mw-ped-cut" viewBox="0 0 640 590" role="img" aria-label={t('Coupe du même calcul au niveau du centre de l’aimant')}>
    <text x="36" y="30" className="t-caption">{t('Repère reed · millimètres')} · z = {frame.pose.center[2].toFixed(1)} mm</text>
    {volume?.cut.map(c=><rect key={`${c.x},${c.y}`} x={80+(c.x0+24)*10} y={60+(24-c.y1)*10} width={(c.x1-c.x0)*10} height={(c.y1-c.y0)*10} className={c.response===null?'mw-cut-collision':c.zone===2?'mw-cut-high':c.zone===1?'mw-cut-low':'mw-cut-empty'}/>)}
    <line x1="80" y1="300" x2="560" y2="300" className="mw-cut-axis"/>
    <line x1="320" y1="60" x2="320" y2="540" className="mw-cut-axis"/>
    {[-20,-10,0,10,20].map(n=><g key={n}><text x={320+n*10} y="565" textAnchor="middle" className="t-caption">{n}</text><text x="65" y={300-n*10+5} textAnchor="end" className="t-caption">{n}</text></g>)}
    <text x="580" y="565" className="t-caption">x mm</text><text x="36" y="55" className="t-caption">y mm</text>
    <line x1="239" y1="300" x2="401" y2="300" className="mw-cut-reed"/>
    <circle cx={320+frame.pose.center[0]*10} cy={300-frame.pose.center[1]*10} r="6" className="mw-cut-point"/>
  </svg>;
}