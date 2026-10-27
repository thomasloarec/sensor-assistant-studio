# Couverture pédagogique catalogue — 27 octobre 2026

Version : catalogue-b-analogy-1.1. Base : 525a210b. Préversion seulement, aucun transfert ni publication.

Inventaire exact du guide : 3004 lignes,5744 bornes numériques, pas3004mesures. Registre publié distinct : pull-in/drop-out et Min Activation/Max Release restent séparés des bornes up/to. MK14-1A66, MK11/M8-1A66 et MK38-1A66B sont reconnus ; MK38-1A85C/1B90C/1C90C restent distincts. F1 est frontal entre faces, jamais D1. Les sources couple exactes sont listées ci-dessous, aucune borne N42 empruntée à N45.
## Méthode et limites

Couche séparée : evaluatePose/B inchangé, même k×AT et neuf hypothèses. Aucun ajustement aux bornes up/to, aucune correction D4 injectée. Centre interne supposé au centre du corps, axe longitudinal X ; longueur prior explicite par modèle. Pour un prior différent de 14mm, homothétie de la pose et du cylindre dans le noyau66 (facteur longueur/14) : analogie, pas verre fabricant ni calcul de perméabilité des pattes. Les 66 explicites conservent la longueur de référence ; GP501 sélectionné a un prior différent et reste identifié. Classe non B–F : classe illustrative C explicitement signalée, jamais déduite de 1A/FormA. Les distances documentaires sont affichées sans devenir hystérésis.

Aimants cylindriques : moment documentaire converti via q·1e-8/volume en J uniforme ; pilotes originaux inchangés. Blocs nus : cylindre de volume équivalent. Boîtiers : petit cylindre interne supposé (diamètre≤5mm,longueur≤8mm bornés par enveloppe), moment publié quand disponible, sinon prior7,2 explicitement approximatif ; ceci ne mesure ni le centre ni le volume magnétique réel. Pas de substitution visuelle ni alias M04=N45. Inconnues de moment/matériaux/classe limitent un favorable à variable. Corps/montage : chevauchement OBB conservatif ; le surmoulage du capteur ne compte pas comme collision du reed. Volumes nominaux et états neuf hypothèses restent distincts.

## 29 modèles commerciaux + 2 illustrations

|Capteur|Enveloppe mm|Aimant proposé|Famille/prior mm|Statut|Méthode aimant / moment|Source corps|
|---|---|---|---|---|---|---|
|MK01|18 × 3.4 × 3.7|HF3225-14.95X10X5|analogy / 12|analogy|equivalent-cylinder / 28.8|MK01.pdf p1|
|MK15|16 × 2.5 × 2.5|HF3225-14.95X10X5|analogy / 10|documented|equivalent-cylinder / 28.8|MK15.pdf p1|
|MK16|11.6 × 2.3 × 2.3|HF3225-14.95X10X5|analogy / 8|documented|equivalent-cylinder / 28.8|MK16.pdf p1|
|MK17|8.5 × 2.1 × 2.1|HF3225-14.95X10X5|analogy / 6|documented|equivalent-cylinder / 28.8|MK17.pdf p1|
|MK22|11.6 × 2.3 × 2.95|HF3225-14.95X10X5|analogy / 8|analogy|equivalent-cylinder / 28.8|MK22.pdf p1|
|MK30|22.5 × 3.5 × 3.5|HF3225-14.95X10X5|analogy / 14|analogy|equivalent-cylinder / 28.8|MK30.pdf p1|
|MK31|6.4 × 1.95 × 2.2|HF3225-14.95X10X5|analogy / 4|analogy|equivalent-cylinder / 28.8|MK31.pdf p1|
|MK06-4|12.06 × 3.3 × 3.3|HF3225-14.95X10X5|analogy / 8|documented|equivalent-cylinder / 28.8|MK06.pdf p1|
|MK24-A-J|5 × 1.6 × 2.2|HF3225-14.95X10X5|analogy / 3|analogy|equivalent-cylinder / 28.8|MK24.pdf p1|
|MK03|25.5 × 5.8 × 5.8|M03|66-assumed / 14|form66|equivalent-cylinder / 22.2|MK03.pdf p1|
|MK02|32.4 × 10 × 16.8|M02|analogy / 14|analogy|equivalent-cylinder / 22.2|MK02.pdf p1|
|MK04|23 × 5.9 × 13.9|M04|66 / 14|form66|equivalent-cylinder / 22.2|MK04.pdf p1|
|MK05|23 × 5.9 × 19.4|M05|66 / 14|form66|equivalent-cylinder / 22.2|MK05.pdf p1|
|MK13|23 × 5.9 × 13.9|M13|66 / 14|form66|equivalent-cylinder / 22.2|MK13.pdf p1|
|MK14|25.5 × 4 × 4|ALNICO500-4X19|66-assumed / 14|form66|moment-cylinder / 14.8|MK14.pdf p1|
|MK18|17 × 5 × 4.6|ALNICO500-4X19|analogy / 10|analogy|moment-cylinder / 14.8|MK18.pdf p1|
|MK20_1|10 × 3 × 2.7|ALNICO500-4X19|analogy / 6|analogy|moment-cylinder / 14.8|MK20_1.pdf p1|
|MK20_2|7.5 × 2.7 × 2.5|ALNICO500-4X19|analogy / 5|analogy|moment-cylinder / 14.8|MK20_2.pdf p1|
|MK21|28.5 × 6.25 × 19|M21P/1|66 / 14|form66|equivalent-cylinder / 22.2|MK21.pdf p1|
|MK21PR|28.5 × 6.25 × 19|M21P/1|analogy / 14|analogy|equivalent-cylinder / 22.2|MK21PR.pdf p1|
|MK26|32 × 6 × 10|HF3225-14.95X10X5|analogy / 14|analogy|equivalent-cylinder / 28.8|MK26.pdf p1|
|MK27|50 × 10 × 20|M27|analogy / 14|analogy|equivalent-cylinder / 95.4|MK27.pdf p1|
|MK11-M5|25 × 5 × 5|M11S|analogy / 14|analogy|equivalent-cylinder / 18|MK11-Stainless.pdf p1|
|MK11-M8|50 × 8 × 8|M11S|66-assumed / 14|form66|equivalent-cylinder / 18|MK11-Stainless.pdf p1|
|MK11-P-M8|38 × 8 × 8|M11P|analogy / 14|analogy|equivalent-cylinder / 22.2|MK11-Plastic.pdf p1|
|MK11-B-M6|38 × 6 × 6|M13B|analogy / 14|analogy|equivalent-cylinder / 18|MK11-Brass.pdf p1|
|MK36|15.5 × 9.3 × 9.3|M36-N42|analogy / 10|documented|equivalent-cylinder / inconnu (prior)|MK36.pdf p2|
|MK37|22 × 9.3 × 9.3|M37-N42|analogy / 14|documented|equivalent-cylinder / inconnu (prior)|MK37.pdf p2|
|MK38|31 × 8.5 × 8.5|M38-N42|analogy / 14|documented|equivalent-cylinder / inconnu (prior)|MK38.pdf p2|
|GENERIC|20 × 2.5 × 2.5|ALNICO500-4X19|analogy / 14|analogy|moment-cylinder / 14.8|illustratif p1|
|CUSTOM|60 × 5.6 × 20|HF3225-14.95X10X5|analogy / 14|analogy|equivalent-cylinder / 28.8|illustratif p1|

Toutes les coordonnées internes de cette table sont des hypothèses. Sources : catalogue existant et https://standexdetect.com/wp-content/uploads/sites/2/2025/10/brochure-reed-sensor-activation-guide.pdf

## Registre publié des couples exacts

|Couple|Lignes|Références|Approches / datum|Source|
|---|---|---|---|---|
|MK04 / M04|20|MK04-1A66B-500W; MK04-1A66C-500W; MK04-1A66D-500W; MK04-1A66E-500W|D1 / lateral_surface; D2 / lateral_surface; D3 / lateral_surface; D4 / lateral_surface; D5 / lateral_surface|https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/|
|MK05 / M05|20|MK05-1A66B-500W; MK05-1A66C-500W; MK05-1A66D-500W; MK05-1A66E-500W|D1 / lateral_surface; D2 / lateral_surface; D3 / lateral_surface; D4 / lateral_surface; D5 / lateral_surface|https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/|
|MK13 / M13|20|MK13-1A66B-500W; MK13-1A66C-500W; MK13-1A66D-500W; MK13-1A66E-500W|D1 / lateral_surface; D2 / lateral_surface; D3 / lateral_surface; D4 / lateral_surface; D5 / lateral_surface|https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/|
|MK14 / M02|20|MK14-1A66B-100W; MK14-1A66C-100W; MK14-1A66D-100W; MK14-1A66E-100W|D1 / lateral_surface; D2 / lateral_surface; D3 / lateral_surface; D4 / lateral_surface; D5 / lateral_surface|https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/|
|MK11-M8 / M02|20|MK11/M8-1A66B-500W; MK11/M8-1A66C-500W; MK11/M8-1A66D-500W; MK11/M8-1A66E-500W|D1 / lateral_surface; D2 / lateral_surface; D3 / lateral_surface; D4 / lateral_surface; D5 / lateral_surface|https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/|
|MK36 / M36-N42|1|MK36-1A|F1 / frontal_faces|https://standexdetect.com/wp-content/uploads/sites/2/2026/06/datasheet-reed-sensor-series-mk36.pdf|
|MK37 / M37-N42|2|MK37-1A; MK37-1B|F1 / frontal_faces|https://standexdetect.com/wp-content/uploads/sites/2/2026/06/datasheet-reed-sensor-series-mk37.pdf|
|MK38 / M38-N42|4|MK38-1A66B; MK38-1A85C; MK38-1B90C; MK38-1C90C|F1 / frontal_faces|https://standexdetect.com/wp-content/uploads/sites/2/2026/06/datasheet-reed-sensor-series-mk38.pdf|

## Huit aimants de brochure

|Aimant|Corps mm|Moment 10⁻⁶Vs·cm|Modèle|
|---|---|---|---|
|SMCO5-5X4|4 × 5 × 5|7.2|verified-cylinder|
|N45-4X19|19 × 4 × 4|30.8|verified-cylinder|
|NDFEB-10X5X1.9|10 × 1.9 × 5|10.3|equivalent-cylinder|
|HF3225-14.95X10X5|14.95 × 5 × 10|28.8|equivalent-cylinder|
|ALNICO500-5.5X22|22 × 5.5 × 5.5|36.6|moment-cylinder|
|ALNICO500-4X19|19 × 4 × 4|14.8|moment-cylinder|
|ALNICO500-3.7X22|22 × 3.7 × 3.7|19.8|moment-cylinder|
|N35-4X2|2 × 4 × 4|3.39|moment-cylinder|

## Comparaison documentaire / modèle sans recalage

Pour chaque famille, première ligne C-66 si présente, sinon première ligne disponible. Les colonnes source sont conservées. Estimation : dernière distance nominale atteignant borne haute / basse sur le rayon explicite x ou z, pas une distance fabricant par face. Pas de décalage up/to ajouté à la pose. D4/D5 font tourner l’axe de90° ; résultat null = aucune intersection testée dans0..50mm. Cette comparaison expose le désaccord, elle ne valide pas les datums ni la3D. Résolution de recherche0,5mm ; aucune promesse de précision.

|Capteur|Aimant|Référence|Approche|Source up/to mm|Dernière intersection nominale haute/basse mm|
|---|---|---|---|---|---|
|MK03|SMCO5-5X4|MK03-1A66C-X|D1|4.65 / 7.95|10 / 11.5|
|MK03|SMCO5-5X4|MK03-1A66C-X|D3|6.7 / 9|— / —|
|MK03|SMCO5-5X4|MK03-1A66C-X|D4|4.15 / 7.75|— / —|
|MK03|SMCO5-5X4|MK03-1A66C-X|D5|2.4 / 4.2|— / —|
|MK03|N45-4X19|MK03-1A66C-X|D1|12.35 / 16.75|17 / 19.5|
|MK03|N45-4X19|MK03-1A66C-X|D3|11.6 / 16.9|24.5 / 27|
|MK03|N45-4X19|MK03-1A66C-X|D4|7.45 / 11.55|— / —|
|MK03|N45-4X19|MK03-1A66C-X|D5|9 / 11.6|— / —|
|MK04|SMCO5-5X4|MK04-1A66C-X|D1|2.8 / 5.85|10 / 11.5|
|MK04|SMCO5-5X4|MK04-1A66C-X|D3|6.4 / 5.2|— / 14|
|MK04|SMCO5-5X4|MK04-1A66C-X|D4|2.3 / 5.65|— / —|
|MK04|SMCO5-5X4|MK04-1A66C-X|D5|— / 3.4|— / —|
|MK04|N45-4X19|MK04-1A66C-X|D1|10.5 / 14.65|17 / 19.5|
|MK04|N45-4X19|MK04-1A66C-X|D3|14.3 / 8.5|24.5 / 27|
|MK04|N45-4X19|MK04-1A66C-X|D4|5.6 / 9.45|— / —|
|MK04|N45-4X19|MK04-1A66C-X|D5|6.4 / 10.8|— / —|
|MK05|SMCO5-5X4|MK05-1A66C-X|D1|3 / 5.85|— / —|
|MK05|SMCO5-5X4|MK05-1A66C-X|D3|4.1 / 8.2|— / 14|
|MK05|SMCO5-5X4|MK05-1A66C-X|D4|2.5 / 7.4|— / —|
|MK05|SMCO5-5X4|MK05-1A66C-X|D5|— / 3.4|— / —|
|MK05|N45-4X19|MK05-1A66C-X|D1|10.7 / 14.65|17 / 19.5|
|MK05|N45-4X19|MK05-1A66C-X|D3|9 / 16.1|24.5 / 27|
|MK05|N45-4X19|MK05-1A66C-X|D4|5.8 / 11.2|— / —|
|MK05|N45-4X19|MK05-1A66C-X|D5|6.4 / 10.8|— / —|
|MK13|SMCO5-5X4|MK13-1A66C-X|D1|2.8 / 5.85|10 / 11.5|
|MK13|SMCO5-5X4|MK13-1A66C-X|D3|4.1 / 8.2|— / 14|
|MK13|SMCO5-5X4|MK13-1A66C-X|D4|2.3 / 5.65|— / —|
|MK13|SMCO5-5X4|MK13-1A66C-X|D5|— / 3.4|— / —|
|MK13|N45-4X19|MK13-1A66C-X|D1|10.5 / 14.65|17 / 19.5|
|MK13|N45-4X19|MK13-1A66C-X|D3|9 / 16.1|24.5 / 27|
|MK13|N45-4X19|MK13-1A66C-X|D4|5.6 / 9.45|— / —|
|MK13|N45-4X19|MK13-1A66C-X|D5|6.4 / 10.8|— / —|
|MK21|SMCO5-5X4|MK21-1A66C-X|D1|3.45 / 7.9|— / —|
|MK21|SMCO5-5X4|MK21-1A66C-X|D3|6 / 8.3|— / —|
|MK21|SMCO5-5X4|MK21-1A66C-X|D4|4.85 / 7.7|— / —|
|MK21|SMCO5-5X4|MK21-1A66C-X|D5|1.7 / 3.5|— / —|
|MK21|N45-4X19|MK21-1A66C-X|D1|11.15 / 16.7|17 / 19.5|
|MK21|N45-4X19|MK21-1A66C-X|D3|10.9 / 16.2|24.5 / 27|
|MK21|N45-4X19|MK21-1A66C-X|D4|8.65 / 11.5|— / —|
|MK21|N45-4X19|MK21-1A66C-X|D5|8.3 / 10.9|— / —|
|MK24-A-J|SMCO5-5X4|analogie sans borne|D1|— / —|12.5 / 12.5|
|MK24-A-J|SMCO5-5X4|analogie sans borne|D3|— / —|12.5 / 12.5|
|MK24-A-J|SMCO5-5X4|analogie sans borne|D4|— / —|— / —|
|MK24-A-J|SMCO5-5X4|analogie sans borne|D5|— / —|— / —|
|MK24-A-J|N45-4X19|analogie sans borne|D1|— / —|12.5 / 12.5|
|MK24-A-J|N45-4X19|analogie sans borne|D3|— / —|12.5 / 12.5|
|MK24-A-J|N45-4X19|analogie sans borne|D4|— / —|— / —|
|MK24-A-J|N45-4X19|analogie sans borne|D5|— / —|— / —|

## Vérifications et couverture restante

Complément sources :60tests ciblés verts/658assertions, incluant inventaire3004/5744, variantes66/85/90,20lignes par couple etF1. Suite finale :2041tests/131fichiers verts,146186assertions,146,51s. Inventaire huit langues0manque,3888entrées. Compilation automatique OK15:59:19UTC. Aucun build/typecheck manuel. Les103empreintes et scans du premier ensemble restent le contrôle précédent, pas une nouvelle recette visuelle.

Fonctionnel : profils pour chaque entrée, bodies/identités conservés, adaptation sur produit dans atelier existant, volumes worker bornés au domaine±24mm avec résolution centrale0,25mm, coupe/chronologie même couche, annulation worker et clé versionnée avec configuration/axe exact/enveloppes. Trace ajoute hypothèses/prior/progress nonqualifiants ; reprise recalcule sans croire un verdict importé. Fix PCB et exploration séparée conservés.

Limites à ne pas masquer : le champ analytique de pavé existe déjà dans src/lib/standex/magnetics/field.ts (fieldAtPoint), avec ses tests ; aucune seconde implémentation créée. Ce premier raccordement catalogue utilise encore un proxy cylindre pour les blocs : remplacer ce proxy demande un adaptateur B deux lames au champ existant, sans retoucher le contrôle interaimants66. Pas de facteur physique de pattes/perméabilité, prior centre/axe non mesuré, pas de fit ni calibration catalogue, pas de remède catalogue automatisé (aucun mouvement interdit conseillé), diagnostic catalogue seulement orientation/chevauchement explicites ; distance détaillée/cause combinée à compléter. Pas de bouton reed intérieur pour ce premier lot. F1 convertit le gap entre faces en distance entre centres à partir des enveloppes visibles : hypothèse de faces du modèle, pas recalage. Coupe représente une enveloppe simplifiée, pas section exacte de chaque boîtier. Imports/mouvements nonchargés restent indisponibles. Trace importée conserve instant mais ne restaure ni binary ni droits ; résultat pédagogique importé GLB sansasset nonrecalculé.

Recette visuelle client réelle **non exécutée par agent** : l’accès de sa session était réservé lors du lot précédent, aucune garde modifiée. Ne pas confondre tests HappyDOM et WebGL. Recette à réaliser depuis / → Commencer → étape2 → Tester ce couple, sur390px/bureau, variantes66/GP501, aimants/câble/retour/imports. Aucun nouvel import réel validé depuis la permission extension signalée.

Sources supplémentaires fournies, pas réingérées ni revendiquées comme inspectées par agent : https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/ ; ficheMK05 2025/09 (66/90) ; ficheMK24 (AT sans équivalence66).
