import { z } from "zod";
import { assessConfiguration, FAMILY_LABELS, proposedContactForm, type LevelContext, type LevelConfiguration } from "./configuration";
import { formatCm, formatLevel } from "./dimensions";
import { type DesignDossier } from "../leadmagnet/dossier";
import { terminationLabel, type Termination } from "../leadmagnet/connectors";
import { CHOSEN_BARE_LEADS, DELEGATED_CONNECTOR } from "../leadmagnet/project-checklist";

// Only raw user choices survive import. No qualification, consent or NDA authority.
export const levelStudySchema = z.object({
  version: z.literal(1),
  context: z.object({
    fluid:z.enum(["water","oil","other","unknown"]), fluidName:z.string(),
    temperatureMin:z.string(), temperatureMax:z.string(), purpose:z.string(),
    tank:z.enum(["vented","pressurised","unknown"]), bodyExposure:z.enum(["permanent","intermittent","unknown"]),
    cableExposure:z.enum(["dry","wet","unknown"]), constraints:z.string(),
    mountingAccess:z.enum(["unknown","free","top","side","bottom"]), tankHeight:z.string(),
    detectionGoal:z.enum(["unknown","high","low","multiple","continuous"]), detectionHeight:z.string(),
    detectionCount:z.number().int().min(2).max(12).optional(), detectionHeights:z.array(z.string()).max(12).optional(),
    responsePriority:z.enum(["unknown","limit","movement"]),
  }),
  configuration: z.object({
    mode:z.enum(["points","continuous"]), count:z.number().int().min(1).max(12),
    orientation:z.enum(["vertical","horizontal"]), mounting:z.enum(["top","support","bottom"]),
    mountingHeightMm:z.number().finite().nonnegative(), travelPreference:z.enum(["short","long"]),
    floatTravelMm:z.number().finite().positive(), reachMm:z.number().finite().positive(),
    tankHeightMm:z.number().finite().positive().max(10000), pointsMm:z.array(z.number().finite().nonnegative()).min(1).max(12),
    pointsPerFloat:z.union([z.literal(1),z.literal(2)]), closedWhen:z.enum(["low","high"]),
    connection:z.enum(["standard","DK","DL","GZ"]), custom:z.boolean(), customDescription:z.string(),
  }),
  cableLengthMm:z.number().finite().positive().nullable(),
  connectorChoice:z.enum(["undecided","bare","preference"]),
});
export type LevelStudy = z.infer<typeof levelStudySchema>;

export function levelDossier(base:DesignDossier, context:LevelContext, configuration:LevelConfiguration,
  cable:{lengthChoice:DesignDossier["cabling"]["lengthChoice"];lengthMm:number|null;connectorChoice:LevelStudy["connectorChoice"];termination:Termination}, title:string):DesignDossier {
  const assessment=assessConfiguration(context,configuration);
  const levelStudy:LevelStudy={version:1,context,configuration,cableLengthMm:cable.lengthMm,connectorChoice:cable.connectorChoice};
  return {...base,title,levelStudy,selectedSensorId:assessment.selected?.family??null,
    requirements:[{key:"detection_goal",label:"Application",value:context.purpose,unit:null,state:context.purpose?"confirmed":"unknown",source:"user"}],
    mounting:{kind:"other",description:configuration.orientation+" · "+configuration.mounting},
    cabling:{...base.cabling,lengthChoice:cable.lengthChoice}, termination:cable.termination,
    delegatedDecisions:[...(cable.connectorChoice==="undecided"?[DELEGATED_CONNECTOR]:cable.connectorChoice==="bare"?[CHOSEN_BARE_LEADS]:[]),...(cable.lengthChoice==="undecided"?["cable"]:[])],
    freeConstraints:context.constraints,openQuestions:assessment.selected?.reasons??[],
  };
}

type Translator=(text:string)=>string;
export function levelProjectFacts(study:LevelStudy,tr:Translator):[string,string][] {
  const c=study.context, unknown=tr("À définir");
  return [
    [tr("Application"),c.purpose||unknown],
    [tr("Liquide"),c.fluidName||tr(c.fluid==="water"?"Eau":c.fluid==="oil"?"Huile":c.fluid==="other"?"Autre liquide":"À définir")],
    [tr("Températures"),`${c.temperatureMin||"?"} ${tr("à")} ${c.temperatureMax||"?"} °C`],
    [tr("Cuve"),tr(c.tank==="vented"?"À pression atmosphérique":c.tank==="pressurised"?"Sous pression ou sous vide":"À définir")],
    [tr("Immersion du corps du capteur"),tr(c.bodyExposure==="permanent"?"En permanence":c.bodyExposure==="intermittent"?"Par intermittence":"À définir")],
    [tr("Sortie de câble et câble"),tr(c.cableExposure==="wet"?"Seront immergés, même occasionnellement":c.cableExposure==="dry"?"Restent hors du liquide":"À définir")],
    [tr("Le liquide peut-il faire des vaguelettes ?"),tr(c.responsePriority==="movement"?"Oui, de petits mouvements sont à ignorer":c.responsePriority==="limit"?"Non, le niveau reste plutôt stable":"À définir")],
    ...(c.detectionGoal==="multiple"?[[tr("Niveaux demandés"),(c.detectionHeights??[]).map(p=>p.trim()?formatLevel(Number(p),Number(c.tankHeight)||100):unknown).join(" ; ")||unknown] as [string,string]]:[]),
  ];
}
export function levelTechnicalFacts(d:Pick<DesignDossier,"levelStudy"|"cabling"|"termination">,tr:Translator):[string,string][] {
  const study=d.levelStudy! ,c=study.configuration, selected=assessConfiguration(study.context,c).selected;
  return [
    [tr("Capteur"),c.custom?tr("Forme spécifique"):selected?.family??tr("Configuration à étudier")],
    [tr("Votre capteur"),c.custom?c.customDescription:selected?tr(FAMILY_LABELS[selected.family]):tr("À définir")],
    [tr("Détection"),c.mode==="continuous"?tr("En continu"):`${c.count} ${tr("point(s)")} · ${c.pointsMm.map(p=>formatLevel(p,c.tankHeightMm)).join(" ; ")}`],
    [tr("Hauteur utile de la cuve"),formatCm(c.tankHeightMm)+" cm"],
    [tr("Montage"),c.orientation==="horizontal"?tr("Montage latéral")+" · "+c.connection:tr(c.mounting==="top"?"Ouverture imposée en haut":c.mounting==="support"?"Capteur droit, hauteur de fixation libre":"Insertion par le fond")],
    [tr(c.orientation==="vertical"?"Longueur souhaitée":"Nombre de capteurs"),c.orientation==="vertical"?formatCm(c.reachMm)+" cm":String(c.count)],
    ...(c.mode==="points"&&c.count===1?[[tr("Niveau à détecter"),tr(c.closedWhen==="high"?"Niveau haut":"Niveau bas")],[tr("Forme de contact proposée"),selected&&proposedContactForm(c,selected.family)?`${tr("Forme")} ${proposedContactForm(c,selected.family)}`:tr("À confirmer avec Standex")]] as [string,string][]:[]),
    [tr("Câble"),study.cableLengthMm===null?tr("À définir"):formatCm(study.cableLengthMm)+" cm"],
    [tr("Choix de longueur"),tr(d.cabling.lengthChoice==="standard_to_confirm"?"Standard":d.cabling.lengthChoice==="custom_to_confirm"?"Sur mesure":"À définir")],
    [tr("Terminaison"),study.connectorChoice==="undecided"?tr("À définir"):study.connectorChoice==="bare"?tr("Fils nus"):d.termination.kind==="bare_leads"?tr("À confirmer avec Standex"):tr(terminationLabel(d.termination))],
    [tr("À retenir"),tr("Illustration du besoin")+" · "+tr("Seuils à confirmer par Standex")],
  ];
}
