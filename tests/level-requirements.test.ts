import { expect,test } from "bun:test";
import { INITIAL_CONTEXT } from "../src/lib/level/configuration";
import { seedConfiguration } from "../src/lib/level/intake";
import { assessLevelProject,levelRequirements,statedLevelGoal } from "../src/lib/level/requirements";
import { levelDossier,levelTechnicalFacts } from "../src/lib/level/dossier";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { projectReportSections } from "../src/lib/leadmagnet/project-report";
import { checkSubmission } from "../src/lib/leadmagnet/submission";
import { INITIAL_NDA } from "../src/lib/leadmagnet/nda";

const base={...INITIAL_CONTEXT,purpose:"Detect low liquid level in an industrial tank.",fluid:"water" as const,temperatureMin:"5",temperatureMax:"40",tankHeight:"250",mountingAccess:"top" as const,detectionGoal:"low" as const};
test("negated high alarm never reverses an explicit low-level objective in French or English",()=>{
  for(const purpose of ["Détecter uniquement le niveau bas, aucune alarme de niveau haut.","Detect low level only, no high level alarm.","Détecter le niveau bas et aucune alarme de niveau haut."])
    expect(statedLevelGoal({...base,purpose})).toBe("low");
});
test("magnetic permission and safe motor interface are not misclassified as prohibitions",()=>{
  for(const constraints of ["Aucune interdiction de champ magnétique. Aimant autorisé.","No restriction on magnetic fields; magnet allowed.","Ne pas alimenter directement le moteur 230 V 10 A ; utiliser un relais dimensionné.","Use a properly rated contactor for the motor; the sensor only provides a control signal."])
    expect(levelRequirements({...base,constraints}).filter(i=>i.study)).toEqual([]);
});
test("unreachable multiple targets remain untouched for an explicit engineering decision",()=>{
  const context={...base,tankHeight:"10000",detectionGoal:"multiple" as const,detectionCount:2,detectionHeights:["1000","9000"]};
  const before=JSON.stringify(context),config=seedConfiguration(context),assessment=assessLevelProject(context,config);
  expect(config.pointsMm).toEqual([1000,9000]);expect(assessment.selected).toBeNull();
  expect(assessment.warnings.join(" ")).toContain("dépasse la longueur");expect(JSON.stringify(context)).toBe(before);
});
test("all warnings survive review facts and report generation, without granting a certified product",()=>{
  const context={...base,constraints:"ATEX zone 0, SIL3 OSSD. Contact alimentaire, nettoyage CIP. Miel à forte viscosité."};
  const d=levelDossier(createDossier(),context,seedConfiguration(context),{lengthChoice:"undecided",lengthMm:null,connectorChoice:"undecided",termination:{kind:"bare_leads"}},"Test");
  for(const text of [JSON.stringify(levelTechnicalFacts(d,text=>text)),JSON.stringify(projectReportSections(d)),d.openQuestions.join(" ")]) {
    expect(text).toContain("Aucune certification");expect(text).toContain("CIP/SIP");expect(text).toContain("densité");
  }
  expect(d.freeConstraints).toBe(context.constraints);
});
test("only absent purpose or unrelated scope blocks submission; difficult sensor projects stay open for study",async()=>{
  for(const [purpose,constraints,scopeProblem] of [["Write a poem about cats.","",true],[base.purpose,"Aucun champ magnétique autorisé.",false]] as const) {
    const context={...base,purpose,constraints};
    const dossier=levelDossier(createDossier(),context,seedConfiguration(context),{lengthChoice:"undecided",lengthMm:null,connectorChoice:"undecided",termination:{kind:"bare_leads"}},"Test");
    const result=await checkSubmission({dossier,nda:INITIAL_NDA,consents:[],reviewAcknowledged:false,additionalConstraints:""});
    expect(result.ok).toBe(false);if(result.ok)return;
    expect(result.problems.some(p=>p.includes("ne décrit pas un projet"))).toBe(scopeProblem);
    expect(result.problems.some(p=>p.includes("champ"))).toBe(false);
  }
});
