import {expect,test} from "bun:test";
import {BRIEF,briefLines,layoutProjectBrief} from "../src/lib/leadmagnet/project-brief-layout";
import {projectReportSections} from "../src/lib/leadmagnet/project-report";
import {createDossier} from "../src/lib/leadmagnet/dossier";
import {DEFAULT_WORKSHOP} from "../src/lib/standex/magnetic-workshop";
import {DEMO_ASSEMBLIES} from "../src/lib/standex/machine-demos";
import {t} from "../src/lib/i18n/core";
const measure=(s:string,size:number)=>Array.from(s).length*size*.55;

test("brief puts prospect and business context before application and actual machine settings",()=>{
 const d=createDossier();d.title="Door project";d.business.contactCompany="Company Example";
 d.workshop={...DEFAULT_WORKSHOP,machine:structuredClone(DEMO_ASSEMBLIES['builtin:drawer-v1']!)};
 d.workshop.start=9876;d.workshop.machine!.travel=[0,0,120];d.internalNotes=[{id:"n",author:"staff",createdAt:"",body:"PRIVATE NOTE"}];
 const sections=projectReportSections(d,{},t),titles=sections.map(s=>s.title);
 expect(titles.indexOf("Coordonnées et contexte")).toBeLessThan(titles.indexOf("Application"));
 expect(titles.indexOf("Contexte projet")).toBeLessThan(titles.indexOf("Application"));
 expect(titles.indexOf("Application")).toBeLessThan(titles.indexOf("Configuration du montage"));
 expect(JSON.stringify(sections)).toContain("Company Example");
 expect(JSON.stringify(sections)).toContain("120.0 mm");
 expect(JSON.stringify(sections)).not.toContain("9876");
 expect(JSON.stringify(sections)).not.toContain("PRIVATE NOTE");
});

test("word wrapping preserves words, paragraphs, Unicode and overlong references",()=>{
 const text="Résumé du projet\n"+"長い参照".repeat(30)+"\nhttps://example.com/"+"abcdef".repeat(90);
 const lines=briefLines(text,130,10,false,measure);
 expect(lines[0]).toBe("Résumé du projet");
 expect(lines.every(l=>measure(l,10)<=130)).toBe(true);
 expect(lines.join("").replace(/\s/g,"")).toBe(text.replace(/\s/g,""));
});

test("long grid values and narrative entries paginate without omission, overflow or orphan headings",()=>{
 const long=Array.from({length:650},(_,i)=>`word${i}`).join(" ");
 const sections=[{id:1,title:"Contact",group:"overview" as const,layout:"grid" as const,entries:[{label:"Company",value:long},{label:"Email",value:"example@example.com"}]},
 {id:2,title:"Application",group:"overview" as const,entries:[{label:"Description",value:long}]},
 {id:3,title:"Solution",group:"solution" as const,entries:[{label:"Sensor",value:"MK04"}]}];
 const pages=layoutProjectBrief(sections,measure,"Reference","continued");
 expect(pages.length).toBeGreaterThan(3);
 const rendered=pages.flatMap(p=>p.items.filter(i=>i.kind==="text").map(i=>i.text)).join(" ");
 for(let i=0;i<650;i++)expect(rendered.match(new RegExp(`\\bword${i}\\b`,"g"))).toHaveLength(2);
 for(const page of pages){
   const text=page.items.filter(i=>i.kind==="text");
   expect(text.length).toBeGreaterThan(2);
   for(const item of text){expect(item.y).toBeLessThanOrEqual(BRIEF.bottom);expect(item.x+measure(item.text,item.size)).toBeLessThanOrEqual(BRIEF.width-BRIEF.margin+.01);}
 }
 expect(pages.at(-1)?.group).toBe("solution");
});
