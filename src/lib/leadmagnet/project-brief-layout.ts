import type { ReportSection } from "./project-report";

export type Ink = "ink" | "blue" | "muted";
export type BriefItem =
  | {kind:"text";x:number;y:number;text:string;size:number;bold:boolean;ink:Ink}
  | {kind:"panel";x:number;y:number;width:number;height:number};
export interface BriefPage {group:NonNullable<ReportSection["group"]>;items:BriefItem[];bottom:number}
export type MeasureText = (text:string,size:number,bold:boolean)=>number;
export const BRIEF = {width:595.276,height:841.89,margin:42,top:126,bottom:770,line:14.4};

/** Prefer word boundaries; split only tokens wider than the available column.
 * Works with CJK, Unicode code points, long addresses and explicit paragraphs. */
export function briefLines(text:string,width:number,size:number,bold:boolean,measure:MeasureText):string[] {
  const lines:string[]=[];
  for(const paragraph of text.replace(/\r\n?/g,"\n").split("\n")) {
    let line="";
    for(const word of paragraph.trim().split(/\s+/u).filter(Boolean)) {
      const joined=line?`${line} ${word}`:word;
      if(measure(joined,size,bold)<=width){line=joined;continue;}
      if(line){lines.push(line);line="";}
      for(const character of word) {
        if(line && measure(line+character,size,bold)>width){lines.push(line);line="";}
        line+=character;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Pure pagination, separate from Canvas: all entries survive page breaks and
 * heading/first-row pairs stay together. Nothing is clipped or ellipsized. */
export function layoutProjectBrief(sections:ReportSection[],measure:MeasureText,subtitle:string,continuation:string):BriefPage[] {
  const pages:BriefPage[]=[];
  let page:BriefPage,y=BRIEF.top,sectionNumber=0;
  const width=BRIEF.width-2*BRIEF.margin;
  function start(group:BriefPage["group"]) {
    page={group,items:[],bottom:BRIEF.top};pages.push(page);y=BRIEF.top;
  }
  function text(value:string,x:number,baseline:number,size=10.2,bold=false,ink:Ink="ink") {
    page.items.push({kind:"text",x,y:baseline,text:value,size,bold,ink});
    page.bottom=Math.max(page.bottom,baseline+3);
  }
  function heading(section:ReportSection,continued=false) {
    text(String(sectionNumber).padStart(2,"0"),BRIEF.margin,y+13,9,true,"muted");
    const lines=briefLines(section.title+(continued?` · ${continuation}`:""),width-28,13,true,measure);
    for(const line of lines){text(line,BRIEF.margin+28,y+13,13,true,"blue");y+=18;}
    y+=9;
  }
  function next(section:ReportSection){start(section.group??"overview");heading(section,true);}
  for(const section of sections) {
    const group=section.group??"overview";
    if(!pages.length||page!.group!==group)start(group);
    if(section.layout==="hero") {
      for(const line of briefLines(section.entries[0]?.value??"",width,22,true,measure)) {
        if(y+30>BRIEF.bottom)start(group);
        text(line,BRIEF.margin,y+22,22,true,"blue");y+=28;
      }
      y+=8;
      for(const line of briefLines(subtitle,width,8.5,false,measure)) {
        if(y+15>BRIEF.bottom)start(group);
        text(line,BRIEF.margin,y+9,8.5,false,"muted");y+=12;
      }
      y+=16;continue;
    }
    sectionNumber++;
    const headingHeight=briefLines(section.title,width-28,13,true,measure).length*18+9;
    if(y+headingHeight+48>BRIEF.bottom)start(group);
    heading(section);
    const grid=section.layout==="grid",columnCount=grid?(section.columns??2):1,colWidth=(width-16*(columnCount-1))/columnCount;
    for(let index=0;index<section.entries.length;index+=columnCount) {
      const entries=section.entries.slice(index,index+columnCount);
      const columns=entries.flatMap((entry,col)=>{
        if(grid) return [{x:BRIEF.margin+col*(colWidth+16)+10,width:colWidth-20,lines:[
          ...briefLines(entry.label,colWidth-20,8.2,true,measure).map(s=>({s,size:8.2,bold:true,ink:"blue" as Ink})),
          ...briefLines(entry.value,colWidth-20,10.2,false,measure).map(s=>({s,size:10.2,bold:false,ink:"ink" as Ink})),
        ]}];
        if(entry.label===section.title)return [{x:BRIEF.margin,width,lines:briefLines(entry.value,width,10.2,false,measure).map(s=>({s,size:10.2,bold:false,ink:"ink" as Ink}))}];
        return [
          {x:BRIEF.margin,width:125,lines:briefLines(entry.label,120,8.5,true,measure).map(s=>({s,size:8.5,bold:true,ink:"blue" as Ink}))},
          {x:BRIEF.margin+140,width:width-140,lines:briefLines(entry.value,width-140,10.2,false,measure).map(s=>({s,size:10.2,bold:false,ink:"ink" as Ink}))},
        ];
      });
      const count=Math.max(...columns.map(c=>c.lines.length));
      let offset=0;
      while(offset<count) {
        const remaining=count-offset;
        if(y+Math.min(remaining,3)*BRIEF.line+16>BRIEF.bottom)next(section);
        const take=Math.min(remaining,Math.floor((BRIEF.bottom-y-16)/BRIEF.line));
        const height=take*BRIEF.line+10;
        if(grid)entries.forEach((_,col)=>page.items.push({kind:"panel",x:BRIEF.margin+col*(colWidth+16),y,width:colWidth,height}));
        for(const column of columns)column.lines.slice(offset,offset+take).forEach((line,i)=>text(line.s,column.x,y+12+i*BRIEF.line,line.size,line.bold,line.ink));
        y+=height+(grid?5:7);offset+=take;
        if(offset<count)next(section);
      }
    }
    y+=12;page!.bottom=y;
  }
  return pages;
}
