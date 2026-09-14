# Audit par couple capteur–aimant — Atelier 3D

Date : 14 septembre 2026. Portée : couples par défaut, distances publiées réellement
exploitées, manques explicites. Aucune valeur n'est déduite d'une forme, d'un moment
magnétique ou d'un capteur voisin.

## 1. Sources utilisées

| Source | Usage |
| --- | --- |
| `src/data/registries/published-references.json` (`published-2026-09-14-v3`, 445 lignes) | seule source des distances Max Pull-in / Min Drop-out (D1–D5) et Min Activation / Max Release (F1) |
| Reed Technology Academy (provenance de chaque ligne du registre) | référence par ligne, citée telle quelle |
| Brochure Reed Switch Sensors A5 V04 EN, p. 38 | tableau MK04/M04 D1–D5, classes B à E |
| `public/datasheets/Packaged-Magnets.pdf` V03, 18 juin 2026 | géométrie des boîtiers d'aimants |
| Fiches produit M21P/1, M21P/2, M04 (standexdetect.com) | variantes de trous oblongs, cotes MK04/MK04R |
| Fiches `datasheet-reed-sensor-series-mk36/37/38.pdf` V00, 17 janvier 2025, p. 2 | tableaux « Activation Distances » : Min Activation / Max Release, actionneurs M36-N42 / M37-N42 / M38-N42 |
| Fiche `datasheet-reed-sensor-series-mk27.pdf` | aucun tableau de seuils : le « up to 40 mm » n'est jamais converti en seuil |

Les colonnes « up / to » de la nouvelle brochure restent **non qualifiées** : elles
n'alimentent aucun calcul. Le verrou précédent `QUALIFIED_APPROACHES = { MK03: ["D1","D3"] }`
est supprimé : il confondait ces colonnes avec les tableaux explicites déjà saisis.
La qualification est maintenant établie **ligne par ligne** (famille + classe + aimant +
approche présents au registre), via `sourceQualified()` / `publishedPairFor()`.

## 2. Couples par défaut (tableau central `src/lib/standex/default-pairs.ts`)

Ce tableau est appliqué à **chaque sélection réelle** d'un capteur : catalogue,
atelier, recommandations, exemple machine et import de modèle. Un aimant
explicitement choisi dans un dossier enregistré est conservé ; le nouveau défaut
ne s'applique qu'au changement de capteur.

| Capteur | Aimant par défaut | Variantes proposées | Distances publiées pour ce couple | Remarque |
| --- | --- | --- | --- | --- |
| MK02 | M02 | M02, 4003004003 | non | détecteur ferreux à aimant intégré : contact non simulé, limite affichée |
| MK03 | M03 | M03, M02, 4003004003 | non pour M03 ; oui pour M02 et 4003004003 (B–E, D1–D5, 40 lignes) | M03 sans table : distances non renseignées tant que la source manque |
| MK04 | M04 | M04 | oui (B–E, D1–D5, 20 lignes) | B/D1 15 / 17,5 ; D2 6,5 / 8 ; D3 9,3 / 11,4 ; D4 et D5 8,5 / 10,1 |
| MK05 | M05 | M05 | oui (B–E, D1–D5, 20 lignes) | — |
| MK13 | M13 | M13 | oui (B–E, D1–D5, 20 lignes) | — |
| MK11-B-M6 | M13B | M13B | non | la fiche Packaged Magnets V03 nomme **M11B** : correspondance documentaire signalée, M13B n'est pas présenté comme référence constructeur vérifiée |
| MK11-P-M8 | M11P | M11P | non | — |
| MK11-M5 | M11S | M11S | non | boîtier à la géométrie de la variante M5 |
| MK11-M8 | M11S | M11S, M02, 4003004003 | non pour M11S ; oui pour M02 et 4003004003 (B–E, D1–D5, 40 lignes) | boîtier à la géométrie de la variante M8 |
| MK21 | M21P/1 | M21P/2, M21 | oui (B–E, D1–D5, 18 lignes) via la famille documentée « M21/P(1,2) » | brochure p. 37 : la planche MAGNETS IN HOUSINGS nomme la famille « M21/P(1,2) » avec un seul jeu de cotes ; p. 38 : l'aimant 2500000021 / M21 est listé comme valable. Provenance affichée à l'écran ; identité d'AIMANT seulement |
| MK21PR | M21P/1 | M21P/2, M21 | **non** : le registre ne contient aucune ligne pour la famille capteur MK21PR | aucune source n'établit que MK21PR partage la table du MK21 : les seuils du MK21 ne lui sont pas empruntés |
| MK27 | M27 | M27 | non | une ligne de la fiche l'étiquette **MK27** : correspondance documentaire signalée |
| MK36 | M36-N42 | M36-N42, M36 | oui (F1, contact 1A, 1 ligne) | Min Activation 17 / Max Release 25 ; variante d'aimantation N42 explicitée |
| MK37 | M37-N42 | M37-N42, M37 | oui (F1, contacts 1A et 1B, 2 lignes) | 1A 19 / 32 ; 1B 16 / 26 affiché séparément, hors moteur normalement ouvert |
| MK38 | M38-N42 | M38-N42, M38 | oui (F1, 4 modèles de contact, 4 lignes) | 1A66B 21 / 36 ; 1A85C 20 / 36 ; 1B90C et 1C90C 17 / 28 ; 66B et 85C restent des modèles distincts |

Les autres capteurs du catalogue reçoivent d'abord un aimant réellement documenté
au registre quand il existe (M02 ou 4003004003), sinon le boîtier M02 comme
paire visuelle, sans aucune distance.

Trous oblongs : M21P/1 horizontaux, M21P/2 verticaux — géométries réellement
différentes en 3D et en vue plane, vérifiées par test.

### Identité de famille documentée « M21/P(1,2) »

Seule correspondance de ce type déclarée (`PUBLISHED_MAGNET_FAMILY` dans
`src/lib/standex/magnetics/registries.ts`) : les variantes **M21P/1** et **M21P/2**
lisent les lignes publiées du **M21**, parce que la source les désigne comme une
seule famille d'aimants — brochure Reed Switch Sensors A5 V04 EN page 37 imprimée
(planche MAGNETS IN HOUSINGS, libellé « M21/P(1,2) », cotes uniques L 28,6 × W 19 ×
H 6,35 mm), page 38 (liste des aimants valables : « 2500000021 / M21 »), et fiche
magnet-in-housing V03 qui liste P1 et P2 dans cette même famille. Ce n'est pas une
extrapolation depuis une forme : les deux variantes ne diffèrent que par
l'orientation des trous oblongs. La provenance est affichée sous le tableau des
distances. Cette identité porte **uniquement sur l'aimant** : aucune variante de
capteur (MK21M, MK21PR) n'en est déduite.

## 3. Couverture réelle du registre, par famille

| Famille | Aimants | Classes | Approches | Lignes |
| --- | --- | --- | --- | --- |
| MK03 | 4003004003, M02 | B–E | D1–D5 | 40 |
| MK04 | M04 | B–E | D1–D5 | 20 |
| MK05 | M05 | B–E | D1–D5 | 20 |
| MK06-4 | 4003004003, M02 | A–E | D1–D5 | 48 |
| MK11-M8 | 4003004003, M02 | B–E | D1–D5 | 40 |
| MK13 | M13 | B–E | D1–D5 | 20 |
| MK14 | 4003004003, M02 | B–E | D1–D5 | 40 |
| MK15 | 4003004003, M02 | B–E | D1–D5 | 40 |
| MK16 | 4003004003, M02 | B–E | D1–D5 | 38 |
| MK17 | 4003004003, M02 | B–E | D1–D5 | 40 |
| MK18 | 4003004003, M02 | B–E | D1–D5 | 34 |
| MK20_1 | 4003004003, M02 | B–E | D1–D5 | 40 |
| MK21 | M21 | B–E | D1–D5 | 18 |
| MK36 | M36-N42 | 1A | F1 | 1 |
| MK37 | M37-N42 | 1A, 1B | F1 | 2 |
| MK38 | M38-N42 | 1A66B, 1A85C, 1B90C, 1C90C | F1 | 4 |

La classe A n'existe qu'en MK06-4 : elle n'est proposée que là, jamais interpolée.

MK36, MK37 et MK38 ne publient **aucune** classe de sensibilité B–E dans ces lignes :
la colonne porte le **modèle de contact** de la fiche (`classKind: "switch_model"`)
et l'atelier l'intitule « Configuration du contact ». Aucune classe n'est fabriquée.

### Approche F1 — faces en vis-à-vis

Le dessin de la page 2 place deux collerettes face à face : la distance est mesurée
**entre les faces**, le long de l'axe longitudinal des cylindres. Ce n'est ni le D1
latéral ni une distance entre centres. Ces lignes portent donc une approche propre
(`F1`), leur datum (`frontal_faces`) et leur nature de seuil
(`min_activation_max_release`) ; la conversion vers l'entrefer de la scène ajoute les
demi-longueurs projetées des deux corps. La note affichée rappelle que ces valeurs
sont **indicatives et dépendantes de l'environnement**, pas un seuil nominal mesuré.
Aucune valeur n'est empruntée entre M36, M37 et M38 (vérifié par test).

## 4. Ce que l'atelier fait maintenant

- Mode d'affichage : **« Données Standex »** quand la ligne du couple existe,
  **« Distances non renseignées pour ce couple »** sinon, **« Démonstration ·
  distances fictives »** réservée aux capteurs explicitement fictifs (GENERIC,
  CUSTOM). Un vrai capteur ne bascule plus d'office dans le modèle fictif.
- Classes de sensibilité proposées : uniquement celles publiées pour le couple.
- Contacts 3D, vue plane, chronologie, verdict, résumé et export lisent la même
  source : jamais un résultat MK03 sous un titre MK04.
- Les distances documentaires restent lisibles même quand la pose réelle n'est pas
  caractérisée. Le gabarit D1/D3 reste **schématique** : datums non caractérisés.
- Hors domaine (pose non localisée, perturbation, limite) le contact reste
  indéterminé et le message affiché est : « Le comportement du capteur nécessite
  des tests en environnement réel. »
- Nouvelle option d'affichage **« Nom capteur »** (3D, vue plane, modèle importé) :
  elle ne change aucune géométrie. Le repère de l'aimant (bande + étiquette
  « Aimant ») est indépendant et reste visible quand les noms sont masqués.

## 5. Manques assumés

- Aucune table pour M03, M11S, M11P, M13B, M27. M21P/1 et M21P/2 n'ont pas de
  table propre : elles lisent celle du M21 par identité de famille documentée
  (section 2), avec provenance visible.
- Aucune ligne pour les familles capteur MK21PR et MK21M : rien n'est emprunté au
  MK21.
- M36, M37, M38 : tables frontales F1 disponibles ; aucune classe de sensibilité,
  aucun tableau latéral D1–D5 pour ces familles.
- MK27 : la fiche ne publie aucun tableau de seuils ; distances non renseignées.
- Contacts 1B et 1C : lisibles comme documentation, jamais simulés.
- Aucun datum caractérisé : aucune pose importée n'est validée par le gabarit.
- Colonnes « up / to » de la brochure toujours en attente de qualification Standex.
- MK02 : mécanisme ferreux réel non simulé.
