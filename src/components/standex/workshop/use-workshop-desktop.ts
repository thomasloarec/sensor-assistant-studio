import { useEffect, useState } from 'react';
/** Same breakpoint as the workshop's column layout; one playback control in the DOM. */
export function useWorkshopDesktop(){
 const [desktop,setDesktop]=useState(false);
 useEffect(()=>{
  const mq=window.matchMedia('(min-width: 1024px)');
  const read=()=>setDesktop(mq.matches);
  read();mq.addEventListener('change',read);
  return ()=>mq.removeEventListener('change',read);
 },[]);
 return desktop;
}
