import {writeFileSync} from 'node:fs';
import {SENSOR_CATALOG} from '../src/lib/standex/sensor-catalog';
import {DEFAULT_WORKSHOP} from '../src/lib/standex/magnetic-workshop';
import {defaultMagnetFor} from '../src/lib/standex/default-pairs';
import {catalogueModel,cataloguePlacement,CATALOGUE_MODEL_VERSION} from '../src/lib/standex/catalogue-pedagogical';
import {guideRangesFor,ACTIVATION_GUIDE} from '../src/lib/standex/activation-guide';
import {BARE_MAGNETS} from '../src/lib/standex/magnet-catalog';
const lines=['# Couverture pédagogique catalogue — 27 octobre 2026','',`Version : ${CATALOGUE_MODEL_VERSION}. Base : 525a210b. Préversion seulement, aucun transfert ni publication.`,'',
'## Méthode et limites','',
'Couche séparée : evaluatePose/B inchangé, même k×AT et neuf hypothèses. Aucun ajustement aux bornes up/to, aucune correction D4 injectée. Centre interne supposé au centre du corps, axe longitudinal X ; longueur prior explicite par modèle. Pour un prior différent de 14mm, homothétie de la pose et du cylindre dans le noyau66 (facteur longueur/14) : analogie, pas verre fabricant ni calcul de perméabilité des pattes. Les 66 explicites conservent la longueur de référence ; GP501 sélectionné a un prior différent et reste identifié. Classe non B–F : classe illustrative C explicitement signalée, jamais déduite de 1A/FormA. Les distances documentaires sont affichées sans devenir hystérésis.',
'',
'Aimants cylindriques : moment documentaire converti via q·1e-8/volume en J uniforme ; pilotes originaux inchangés. Blocs et boîtiers : cylindre de volume équivalent, moment publié quand disponible, sinon prior7,2 explicitement approximatif. Pas de substitution visuelle ni alias M04=N45. Inconnues de moment/matériaux/classe limitent un favorable à variable. Corps/montage : chevauchement OBB conservatif ; le surmoulage du capteur ne compte pas comme collision du reed. Volumes nominaux et états neuf hypothèses restent distincts.',
'','## 29 modèles commerciaux + 2 illustrations','',
'|Capteur|Enveloppe mm|Aimant proposé|Famille/prior mm|Statut|Méthode aimant / moment|Source corps|','|---|---|---|---|---|---|---|'];
for(const s of SENSOR_CATALOG){const c={...DEFAULT_WORKSHOP,sensorId:s.id,magnetModel:defaultMagnetFor(s.id)},m=catalogueModel(c);lines.push(`|${s.id}|${s.body.join(' × ')}|${m.magnetId}|${m.family} / ${m.lengthMm}|${m.status}|${m.magnetGeometry} / ${m.moment??'inconnu (prior)'}|${s.sourceFile??'illustratif'} p${s.sourcePage}|`);}
lines.push('','Toutes les coordonnées internes de cette table sont des hypothèses. Sources : catalogue existant et '+ACTIVATION_GUIDE.source.url,'',
'## Huit aimants de brochure','',
'|Aimant|Corps mm|Moment 10⁻⁶Vs·cm|Modèle|','|---|---|---|---|');
for(const b of BARE_MAGNETS.filter(b=>b.moment!==null)){const m=catalogueModel({...DEFAULT_WORKSHOP,magnetModel:b.id});lines.push(`|${b.id}|${b.body.join(' × ')}|${b.moment}|${m.magnetGeometry}|`);}
lines.push('','## Comparaison documentaire / modèle sans recalage','',
'Pour chaque famille, première ligne C-66 si présente, sinon première ligne disponible. Les colonnes source sont conservées. Estimation : dernière distance nominale atteignant borne haute / basse sur le rayon explicite x ou z, pas une distance fabricant par face. Pas de décalage up/to ajouté à la pose. D4/D5 font tourner l’axe de90° ; résultat null = aucune intersection testée dans0..50mm. Cette comparaison expose le désaccord, elle ne valide pas les datums ni la3D. Résolution de recherche0,5mm ; aucune promesse de précision.',
'','|Capteur|Aimant|Référence|Approche|Source up/to mm|Dernière intersection nominale haute/basse mm|','|---|---|---|---|---|---|');
for(const sensorId of ['MK03','MK04','MK05','MK13','MK21','MK24-A-J'])for(const magnetModel of ['SMCO5-5X4','N45-4X19']){
 const rows=guideRangesFor(sensorId,magnetModel),preferred=rows.find(r=>r.sensorReference.includes('66C'))??rows.find(r=>r.sensorReference.includes('66'))??rows[0];
 for(const approach of ['D1','D3','D4','D5']){
  const r=rows.find(r=>r.sensorReference===preferred?.sensorReference&&r.approachId===approach);
  const c={...DEFAULT_WORKSHOP,sensorId,magnetModel,sensitivity:'C',guideReference:preferred?.sensorReference??null};
  let high:number|null=null,low:number|null=null;
  for(let d=0;d<=50;d+=.5){const end=approach==='D3'||approach==='D5',cross=approach==='D4'||approach==='D5';const e=cataloguePlacement(c,{center:end?[d,0,0]:[0,0,d],axis:cross?[0,0,1]:[1,0,0]},[],catalogueModel(c),true);if(e.zone===2)high=d;if(e.zone>=1)low=d;}
  lines.push(`|${sensorId}|${magnetModel}|${r?.sensorReference??'analogie sans borne'}|${approach}|${r?.upMm??'—'} / ${r?.toMm??'—'}|${high??'—'} / ${low??'—'}|`);
 }
}
lines.push('','## Vérifications et couverture restante','',
'2037 tests /131fichiers verts (146131assertions), dont7 nouveaux tests de couche catalogue et27client existants. Inventaire huit langues0manque,3888entrées ; scans0/6/6/0 (exceptions UI/Three préexistantes).103empreintes scientifiques/NDA inchangées. Compilation automatique OK15:49:16UTC. Aucun build/typecheck manuel.',
'',
'Fonctionnel : profils pour chaque entrée, bodies/identités conservés, adaptation sur produit dans atelier existant, volumes worker bornés au domaine±24mm avec résolution centrale0,25mm, coupe/chronologie même couche, annulation worker et clé versionnée avec configuration/axe exact/enveloppes. Trace ajoute hypothèses/prior/progress nonqualifiants ; reprise recalcule sans croire un verdict importé. Fix PCB et exploration séparée conservés.',
'',
'Limites à ne pas masquer : pas de bloc analytique (proxy cylindre), pas de facteur physique de pattes/perméabilité, prior centre/axe non mesuré, pas de fit ni calibration catalogue, pas de remède catalogue automatisé (aucun mouvement interdit conseillé), diagnostic catalogue seulement orientation/chevauchement explicites ; distance détaillée/cause combinée à compléter. Pas de bouton reed intérieur pour ce premier lot. Pas de recalage de distances auxfaces. Coupe représente une enveloppe simplifiée, pas section exacte de chaque boîtier. Imports/mouvements nonchargés restent indisponibles. Trace importée conserve instant mais ne restaure ni binary ni droits ; résultat pédagogique importé GLB sansasset nonrecalculé.',
'',
'Recette visuelle client réelle **non exécutée par agent** : l’accès de sa session était réservé lors du lot précédent, aucune garde modifiée. Ne pas confondre tests HappyDOM et WebGL. Recette à réaliser depuis / → Commencer → étape2 → Tester ce couple, sur390px/bureau, variantes66/GP501, aimants/câble/retour/imports. Aucun nouvel import réel validé depuis la permission extension signalée.',
'',
'Sources supplémentaires fournies, pas réingérées ni revendiquées comme inspectées par agent : https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/ ; ficheMK05 2025/09 (66/90) ; ficheMK24 (AT sans équivalence66).');
writeFileSync('docs/qa-catalogue-pedagogical-2026-10-27.md',lines.join('\n')+'\n');
console.log('Coverage report written:',SENSOR_CATALOG.length,'entries');