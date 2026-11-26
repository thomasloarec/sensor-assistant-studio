import {expect,test} from "bun:test";
import {createDossier,toClientDto,dossierHash} from "../src/lib/leadmagnet/dossier";
import {levelDossier,levelStudySchema} from "../src/lib/level/dossier";
import {INITIAL_CONTEXT,configurationIssues,assessConfiguration} from "../src/lib/level/configuration";
import {seedConfiguration} from "../src/lib/level/intake";
import {standardLengthsMm} from "../src/lib/leadmagnet/cable-options";
import {parseServerSnapshot} from "../src/lib/leadmagnet/dossier-io";
import {projectReportSections} from "../src/lib/leadmagnet/project-report";
import {buildSnapshot,checkSubmission,submissionBinding,technicalSummary,type SubmissionInput} from "../src/lib/leadmagnet/submission";
import {validatePendingSnapshot} from "../src/lib/leadmagnet/customer-access.server";
import {INITIAL_NDA} from "../src/lib/leadmagnet/nda";
import {collectSegments,applySegments,englishReportBody} from "../src/lib/leadmagnet/english-translation";
import {setLocale} from "../src/lib/i18n/core";
const context={...INITIAL_CONTEXT,fluid:"other" as const,fluidName:"Liquide de refroidissement automobile",temperatureMin:"5",temperatureMax:"40",purpose:"Détecter le niveau de liquide de refroidissement dans un purgeur automobile utilisé par les garagistes.",mountingAccess:"top" as const,tankHeight:"250",detectionGoal:"low" as const,detectionHeight:"12.5",responsePriority:"movement" as const};
function fixture(){return levelDossier(createDossier(),context,seedConfiguration(context),{lengthChoice:"standard_to_confirm",lengthMm:1000,connectorChoice:"bare",termination:{kind:"bare_leads"}},"Purgeur automobile");}
test("coolant purge intake has a valid top-mounted LS04 proposal despite legacy 5% input",()=>{
 const d=fixture(),c=d.levelStudy!.configuration;
 expect(c.pointsMm[0]).toBeGreaterThan(12.5);expect(configurationIssues(c)).toEqual([]);
 expect(assessConfiguration(context,c).selected?.family).toBe("LS04");
 for(const family of ["LS01","LS02","LS03","LS04","LS05"])expect(standardLengthsMm(family)).toEqual([500,1000,5000]);
});
test("server round trip preserves raw level choices, cable and family without importing qualifications",()=>{
 const d=fixture(),dto=toClientDto(d);
 const parsed=parseServerSnapshot({...dto,levelStudy:{...dto.levelStudy,qualified:true,ndaStatus:"in_force"}});
 expect(parsed.ok).toBe(true);if(!parsed.ok)return;
 expect(parsed.dossier.levelStudy).toEqual(dto.levelStudy);expect(parsed.dossier.selectedSensorId).toBe("LS04");
 expect(parsed.dossier.workshop).toBeNull();
 const malformed={...dto,levelStudy:{...dto.levelStudy,configuration:{...dto.levelStudy!.configuration,tankHeightMm:Infinity}}};
 expect(levelStudySchema.safeParse(malformed.levelStudy).success).toBe(false);
 const bad=parseServerSnapshot(malformed);if(bad.ok){expect(bad.dossier.levelStudy).toBeUndefined();expect(bad.dossier.selectedSensorId).toBeNull();}
});
test("PDF sections and send summary contain the same level facts, cm and percent, without magnetic cable estimates",()=>{
 setLocale("fr");const d=fixture(),sections=projectReportSections(d),text=JSON.stringify(sections),summary=technicalSummary(d);
 for(const value of ["Liquide de refroidissement automobile","LS04","100 cm","20 %"]){expect(text).toContain(value);expect(summary).toContain(value);}
 expect(sections.some(s=>s.title==="Configuration technique")).toBe(true);
 expect(text).not.toContain("trajet incomplet");expect(summary).not.toContain("trajet incomplet");
});
test("level data enters the existing consent-bound submission boundary; changes require renewed consent",async()=>{
 const d=fixture();d.business={...d.business,contactEmail:"qa@example.invalid",industry:"Automotive",industryConfirmed:true,siteCity:"Paris",siteCountry:"FR",undefinedFields:["annualVolume","projectPhase","seriesStartDate","seriesDurationYears"]};
 const initial:SubmissionInput={dossier:d,nda:INITIAL_NDA,consents:[],reviewAcknowledged:false,additionalConstraints:"",serverRevision:1};
 expect((await checkSubmission(initial)).ok).toBe(false);
 const binding=await submissionBinding(initial);
 const input:SubmissionInput={...initial,consents:[{kind:"supabase_dossier",binding,grantedAt:new Date().toISOString(),contentSummary:"Projet de capteur de niveau",recipients:["Standex"]}]};
 expect((await checkSubmission(input)).ok).toBe(true);
 const snapshot=await buildSnapshot(input);expect(await validatePendingSnapshot(snapshot)).toBe(snapshot);
 expect(snapshot.dto.levelStudy).toEqual(d.levelStudy);
 const changed=structuredClone(d);changed.levelStudy!.cableLengthMm=500;
 expect(await dossierHash(toClientDto(changed))).not.toBe(await dossierHash(toClientDto(d)));
 expect((await checkSubmission({...input,dossier:changed})).ok).toBe(false);
 expect((await checkSubmission({...input,nda:{...INITIAL_NDA,required:true,status:"requested"}})).ok).toBe(false);
});


test("English report includes translated level application and selected cable without magnetic path placeholders",()=>{
 const dto=toClientDto(fixture()),segments=collectSegments(dto);
 expect(segments.some(s=>s.id==="level.fluidName")).toBe(true);
 const translated=applySegments(dto,{"level.purpose":"Detect coolant level in an automotive purge tank.","level.fluidName":"Automotive coolant"});
 const body=englishReportBody(translated,{revision:1});
 expect(body).toContain("Automotive coolant");expect(body).toContain("Detect coolant level");
 expect(body).toContain("LS04");expect(body).toContain("100 cm");expect(body).toContain("20 %");
 expect(body).not.toContain("incomplete or invalid path");expect(body).not.toContain("Workshop sensor");
 expect(dto.levelStudy!.context.fluidName).toBe(context.fluidName);
});
