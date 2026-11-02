import { imagePagesPdf } from "../standex/studio-pdf";
import type { ReportSection } from "./project-report";
import { BRIEF, briefLines, layoutProjectBrief } from "./project-brief-layout";

/** A4 brief rendered locally at 300 dpi. The shared staff review exporter is
 * untouched; exact client data remains attached to the downloaded document. */
export async function projectBriefPdf(
  report:{sections:ReportSection[];hash:string},logoUrl:string,tr:(s:string)=>string,
  options:{title?:string;subtitle?:string;attachment?:Uint8Array}={},
):Promise<Uint8Array> {
  const font=(size:number,bold:boolean)=>`${bold?700:400} ${size}px "Source Sans 3", Arial, sans-serif`;
  await Promise.all([document.fonts.load(font(14,false)),document.fonts.load(font(22,true))]);
  await document.fonts.ready;
  const logo=new Image();logo.src=logoUrl;await logo.decode();
  const canvas=document.createElement("canvas");canvas.width=2480;canvas.height=3508;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("PDF_CANVAS_UNAVAILABLE");
  ctx.scale(canvas.width/BRIEF.width,canvas.height/BRIEF.height);
  const style=getComputedStyle(document.documentElement);
  const palette={paper:style.getPropertyValue("--surface").trim(),panel:style.getPropertyValue("--surface-sunken").trim(),
    blue:style.getPropertyValue("--standex-blue").trim(),ink:style.getPropertyValue("--ink").trim(),muted:style.getPropertyValue("--standex-gray").trim()};
  const measure=(s:string,size:number,bold:boolean)=>{ctx.font=font(size,bold);return ctx.measureText(s).width;};
  const sections=report.sections.map(s=>({...s,entries:[...s.entries]}));
  sections[sections.length-1]?.entries.push({label:"SHA-256",value:report.hash});
  const pages=layoutProjectBrief(sections,measure,options.subtitle??"",tr("suite"));
  /* i18n-canonical: document chapter labels translated at render time. */
  const chapters={overview:"Projet et application",solution:"Solution étudiée",discussion:"Préparer l’échange"};
  const images:Uint8Array[]=[];
  for(const [index,page] of pages.entries()) {
    ctx.fillStyle=palette.paper;ctx.fillRect(0,0,BRIEF.width,BRIEF.height);
    ctx.drawImage(logo,BRIEF.margin,32,187,187*logo.naturalHeight/logo.naturalWidth);
    ctx.font=font(10,true);ctx.fillStyle=palette.muted;ctx.textAlign="right";
    ctx.fillText(tr("Brief projet"),BRIEF.width-BRIEF.margin,52);
    ctx.font=font(8,false);ctx.fillText("Sensor Studio",BRIEF.width-BRIEF.margin,67);ctx.textAlign="left";
    ctx.fillStyle=palette.blue;ctx.fillRect(BRIEF.margin,96,24,3);
    ctx.font=font(10,true);ctx.fillText(tr(chapters[page.group]),BRIEF.margin+34,101);
    for(const item of page.items) {
      if(item.kind==="panel") {ctx.fillStyle=palette.panel;ctx.fillRect(item.x,item.y,item.width,item.height);}
      else {ctx.fillStyle=palette[item.ink];ctx.font=font(item.size,item.bold);ctx.fillText(item.text,item.x,item.y);}
    }
    if(index===pages.length-1 && BRIEF.bottom-page.bottom>100) {
      const y=page.bottom+20;ctx.fillStyle=palette.blue;ctx.font=font(10,true);ctx.fillText(tr("Notes pour l’échange"),BRIEF.margin,y);
      ctx.strokeStyle=palette.panel;ctx.lineWidth=1;
      for(let line=1;line<=3;line++){ctx.beginPath();ctx.moveTo(BRIEF.margin,y+line*20);ctx.lineTo(BRIEF.width-BRIEF.margin,y+line*20);ctx.stroke();}
    }
    ctx.fillStyle=palette.muted;ctx.font=font(7.5,false);
    ctx.fillText(tr("Standex DETECT · Sensor Studio"),BRIEF.margin,807);
    const footer=briefLines(options.title??"",350,7.5,false,measure)[0]??"";
    ctx.fillText(footer,BRIEF.margin,820);
    ctx.textAlign="right";ctx.fillText(`${index+1} / ${pages.length}`,BRIEF.width-BRIEF.margin,807);ctx.textAlign="left";
    const bytes=atob(canvas.toDataURL("image/jpeg",0.96).split(",")[1]!);
    images.push(Uint8Array.from(bytes,c=>c.charCodeAt(0)));
  }
  return imagePagesPdf(images,canvas.width,canvas.height,options.attachment);
}
