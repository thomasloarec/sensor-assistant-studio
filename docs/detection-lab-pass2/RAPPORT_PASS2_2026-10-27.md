# Laboratoire de détection reed — expérience de calibration (lot 2)

Généré par `bun scripts/detection-lab-pass2-report.ts` le 2026-10-27. Préversion interne staff. **Ordres de grandeur pédagogiques : aucune garantie de commutation au millimètre. Paramètres ajustés, pas des dimensions prouvées.**

## Proposition testée et provenance

- Proposition reçue : modèle B, longueur effective 16 mm, convention C1, repère axial D3/D5 fixé à +7 mm (extrémité du verre) indépendant de L, seuil θ = k·AT (up = AT max, to = AT min), k ajusté uniquement sur les 8 bornes D1 Form C/E × 2 aimants. Classes B/D et approches D3/D4/D5 hors apprentissage. Moment physique inchangé.
- Transcription Form : `src/data/detection-lab/brochure-form-rows.json` (SHA256 fichier `7131f8c90c119969273d7b3aa92cd853f116c0b20e9fca678765be393f185802`), inchangée, aucune correction.
- Classes AT : MK04 Series Datasheet — glossary « Magnetic Sensitivity », page 2, version 02 (28 Feb 2019) — https://standexdetect.com/wp-content/uploads/sites/2/2025/09/datasheet-reed-sensor-series-mk04.pdf (vérifiée le 2026-10-27). Classes AT relevées sur la fiche MK04 UNIQUEMENT : la disponibilité des lettres et les plages ne sont pas universalisables à d'autres boîtiers ni au reed nu. θ = k·AT est une hypothèse ajustée sur les distances D1 Form, pas une conversion physique mT/AT.
- Physique inchangée : `evaluatePose` reste l'unique entrée physique ; L entre par le scénario (facteur de longueur), le repère axial par le paramètre explicite des mêmes fonctions de recherche que le lot 1. Le profil 1.1 n'est pas modifié.

## Ajustements (apprentissage D1 C/E uniquement)

| Variante | L (mm) | repère axial (mm) | k ajusté (mT/AT) | médiane résidus D1 |
|---|---|---|---|---|
| V1-L16-d7 | 16.000 | 7 | 0.1336656 | 3.64 % |
| V2-L16-d4 | 16.000 | 4 | 0.1336656 | 3.64 % |
| V3-L8-d7 | 8.000 | 7 | 0.1662267 | 10.45 % |
| V4-Lfit-d7 | 15.634 | 7 | 0.1356055 | 3.68 % |

Ajustement de L par accord inter-aimants sur D1 seul (Σ log² θ_N45/θ_SmCo) : **L = 15.634 mm** (RMS log 0.0314). k ne dépend pas du repère axial (D1 n'utilise pas le repère) : V1 et V2 partagent le même k.

Ces valeurs sont des paramètres ajustés sur 8 bornes d'apprentissage, pas des dimensions prouvées.

## Score des contrôles — critère explicite

Contrôles = toutes les bornes publiées C/E D3/D4/D5 des deux aimants (23 publiées, 1 manquante : SmCo E D5 up « - » dans la source). Critère reçu : médiane ≤ 10 % ET ≤ 3/23 bornes > 20 % ET aucune indisponible. Score secondaire : sans la seule borne suspectée C-N45-D3 to = 17.7 (identique au D1 to du même couple — anomalie de source suspectée, jamais corrigée, jamais exclue du score primaire).

| Variante | score | publiées | calculables | indisponibles | manquantes | médiane \|écart\| % | > 20 % | critère |
|---|---|---|---|---|---|---|---|---|
| V1-L16-d7 | primaire (23 bornes) | 23 | 21 | 2 | 1 | 38.88 | 15 | NON ATTEINT |
| V1-L16-d7 | secondaire (sans anomalie) | 22 | 20 | 2 | 1 | 38.00 | 14 | NON ATTEINT |
| V2-L16-d4 | primaire (23 bornes) | 23 | 23 | 0 | 1 | 13.98 | 6 | NON ATTEINT |
| V2-L16-d4 | secondaire (sans anomalie) | 22 | 22 | 0 | 1 | 13.51 | 5 | NON ATTEINT |
| V3-L8-d7 | primaire (23 bornes) | 23 | 22 | 1 | 1 | 39.14 | 17 | NON ATTEINT |
| V3-L8-d7 | secondaire (sans anomalie) | 22 | 21 | 1 | 1 | 38.29 | 16 | NON ATTEINT |
| V4-Lfit-d7 | primaire (23 bornes) | 23 | 21 | 2 | 1 | 39.20 | 15 | NON ATTEINT |
| V4-Lfit-d7 | secondaire (sans anomalie) | 22 | 20 | 2 | 1 | 38.29 | 14 | NON ATTEINT |

Détail par approche (score primaire) :

| Variante | approche | calculables | médiane \|écart\| % | > 20 % |
|---|---|---|---|---|---|
| V1-L16-d7 | D3 | 8/8 | 43.71 | 8 |
| V1-L16-d7 | D4 | 8/8 | 11.71 | 2 |
| V1-L16-d7 | D5 | 5/7 | 49.05 | 5 |
| V2-L16-d4 | D3 | 8/8 | 13.51 | 1 |
| V2-L16-d4 | D4 | 8/8 | 11.71 | 2 |
| V2-L16-d4 | D5 | 7/7 | 14.48 | 3 |
| V3-L8-d7 | D3 | 8/8 | 41.23 | 8 |
| V3-L8-d7 | D4 | 8/8 | 17.36 | 3 |
| V3-L8-d7 | D5 | 6/7 | 48.77 | 6 |
| V4-Lfit-d7 | D3 | 8/8 | 43.95 | 8 |
| V4-Lfit-d7 | D4 | 8/8 | 12.19 | 2 |
| V4-Lfit-d7 | D5 | 5/7 | 49.32 | 5 |

Un résidu systématique n'est pas une marge validée. Si le critère n'est pas atteint : pas de volume 3D.

## Classes B et D (hors apprentissage) — résumé chiffré

Classes B/D jamais utilisées pour ajuster k ni L. D1 est un contrôle isolé ; D3/D4/D5 sont des contrôles au même titre que C/E. Détail ligne à ligne dans les CSV.

| Variante | sous-ensemble | publiées | calculables | indisponibles | médiane \|écart\| % | > 20 % |
|---|---|---|---|---|---|---|
| V1-L16-d7 | B/D — D1 seul | 8 | 8 | 0 | 1.60 | 0 |
| V1-L16-d7 | B/D — D3/D4/D5 | 24 | 22 | 2 | 34.16 | 14 |
| V2-L16-d4 | B/D — D1 seul | 8 | 8 | 0 | 1.60 | 0 |
| V2-L16-d4 | B/D — D3/D4/D5 | 24 | 24 | 0 | 12.20 | 3 |
| V3-L8-d7 | B/D — D1 seul | 8 | 8 | 0 | 6.36 | 1 |
| V3-L8-d7 | B/D — D3/D4/D5 | 24 | 23 | 1 | 33.25 | 18 |
| V4-Lfit-d7 | B/D — D1 seul | 8 | 8 | 0 | 0.95 | 0 |
| V4-Lfit-d7 | B/D — D3/D4/D5 | 24 | 22 | 2 | 34.47 | 14 |

## Disponibilité réelle des classes

La transcription Form 66 contient les classes A..F ; **G est absente de la source** — les lignes G des tableaux portent le statut « no_source » et ne sont jamais présentées comme validées. Tableaux CSV (`tableau_V*.csv`, 112 lignes chacun : 7 classes × 4 approches × 2 bornes × 2 aimants).

## Coupes perpendiculaires raffinées (audit géométrique, profil 1.1, B/C1)

Maillage continu du domaine dessiné : pas vertical 0,25 mm partout (y = 0..24) ; pas horizontal 0,25 mm dans la bande |x| ≤ 5 mm, 1 mm ailleurs (cellules extérieures 1 × 0,25 mm, pas des carrés de 1 mm) ; frontières de cellules aux milieux entre nœuds, tronquées au domaine — sans recouvrement ni trou, cellules dessinées à leurs bornes réelles. États de lecture distingués : collision NOMINALE (invalidité géométrique du corps dessiné), collision dans une hypothèse ±1 mm (pose nominale valide), réponse nominale nulle (zone centrale du modèle B), diagnostic défavorable. Ces largeurs ne sont pas des probabilités.

| Coupe | aimant | cellules | nœuds communs vérifiés | désaccords |
|---|---|---|---|---|
| 2-perpendicular-centred-C | SMCO5-5X4 | 7663 | 275 | 0 |
| 3-perpendicular-offset-C | SMCO5-5X4 | 7663 | 275 | 0 |
| 2-perpendicular-centred-C | N45-4X19 | 7663 | 275 | 0 |
| 3-perpendicular-offset-C | N45-4X19 | 7663 | 275 | 0 |

Demi-largeur de la zone centrale à réponse nominale nulle (modèle B, scénario nominal) selon le pas de balayage — intervalle [dernier point nul ; premier point positif], statuts explicites :

| aimant | profondeur y (mm) | pas 1 | pas 0,25 | pas 0,125 |
|---|---|---|---|---|---|
| SMCO5-5X4 | 14 | [1.000 ; 2.000] | [1.750 ; 2.000] | [1.875 ; 2.000] |
| SMCO5-5X4 | 18 | [1.000 ; 2.000] | [1.750 ; 2.000] | [1.875 ; 2.000] |
| SMCO5-5X4 | 22 | [1.000 ; 2.000] | [1.750 ; 2.000] | [1.875 ; 2.000] |
| SMCO5-5X4 | 24 | [1.000 ; 2.000] | [1.750 ; 2.000] | [1.875 ; 2.000] |
| N45-4X19 | 14 | [2.000 ; 3.000] | [2.000 ; 2.250] | [2.000 ; 2.125] |
| N45-4X19 | 18 | [1.000 ; 2.000] | [1.750 ; 2.000] | [1.875 ; 2.000] |
| N45-4X19 | 22 | [1.000 ; 2.000] | [1.750 ; 2.000] | [1.875 ; 2.000] |
| N45-4X19 | 24 | [1.000 ; 2.000] | [1.750 ; 2.000] | [1.875 ; 2.000] |

Figures : `svg/2-perpendicular-centred-C_*_B_fine.svg` et `svg/3-perpendicular-offset-C_*_B_fine.svg` (+ CSV). La capsule de collision testée, le verre publié 14 mm et l'aimant aux repères sont dessinés à taille réelle.

## Vérification collision N45 (reproduction)

Coupe 1 mm du lot 1 (2-perpendicular-centred-C, N45, B/C1) recalculée : **108 cellules favorables, 0 à y = 5 mm**. La pose centre [0, 5, 0], axe [0, 1, 0] renvoie **collision (collision)** : le corps du cylindre est bien testé dans `pose.ts` et, sur les cellules contrôlées de cette coupe, les cellules proches du reed à y = 5 sont indisponibles pour collision.

Point distinct : la capsule de collision du lot 1 (segment ±7 mm épaissi du rayon 1.1 mm, étendue réelle ±8.1 mm, longueur 16.2 mm) est une **approximation conservative**, pas l'encombrement publié. Son surdimensionnement se mesure au verre publié KSK-1A66 (14 mm max) : +2.2 mm en longueur axiale. C'est une exclusion géométrique conservative, pas une dimension de lame.

## Conclusions factuelles

- Les quatre variantes sont évaluées avec le même apprentissage (8 bornes D1 C/E) et le même critère ; les tableaux complets A..G sont dans les CSV.
- L = 16 mm est un paramètre ajusté : il ne prouve pas des pattes de 1 mm. Sans géométrie des pattes par boîtier, aucune longueur de patte n'est inventée.
- Les plages AT viennent de la fiche MK04 uniquement ; θ = k·AT est une hypothèse ajustée, pas une conversion physique mT/AT universalisable.
- Source Standex sur les pattes : Datenbuch Reed Technology 2022, pp. 45-47 (https://standexdetect.com/wp-content/uploads/sites/2/2025/08/Datenbuch-Reed-Technology-EN-2022.pdf) et fiche KSK-1A66 : modifier les pattes (coupe, formage) altère la sensibilité. Le modèle futur devra combiner reed + configuration magnétique du montage + aimant ; les décalages documentaires Form→produit ne sont pas une preuve d'identité physique.
- Le repère fixe +4 mm (V2) est un diagnostic non validé physiquement ; il n'a pas été ajusté sur les contrôles.

## Temps de calcul (machine de génération)

| Étape | Durée |
|---|---|
| Ajustement de L (accord inter-aimants D1) | 36 ms |
| Ajustement de k (V1-L16-d7) | 811 ms |
| Tableau A..G (V1-L16-d7) | 3235 ms |
| Ajustement de k (V2-L16-d4) | 830 ms |
| Tableau A..G (V2-L16-d4) | 3158 ms |
| Ajustement de k (V3-L8-d7) | 709 ms |
| Tableau A..G (V3-L8-d7) | 3322 ms |
| Ajustement de k (V4-Lfit-d7) | 808 ms |
| Tableau A..G (V4-Lfit-d7) | 3701 ms |
| Seuils partagés lot 1 (B/C1) | 451 ms |
| Coupe raffinée 2-perpendicular-centred-C SMCO5-5X4 | 3050 ms |
| Coupe raffinée 3-perpendicular-offset-C SMCO5-5X4 | 2839 ms |
| Coupe raffinée 2-perpendicular-centred-C N45-4X19 | 1333 ms |
| Coupe raffinée 3-perpendicular-offset-C N45-4X19 | 1496 ms |
| Nœuds communs 2-perpendicular-centred-C SMCO5-5X4 | 522 ms |
| Nœuds communs 3-perpendicular-offset-C SMCO5-5X4 | 467 ms |
| Nœuds communs 2-perpendicular-centred-C N45-4X19 | 284 ms |
| Nœuds communs 3-perpendicular-offset-C N45-4X19 | 273 ms |
| Largeurs zone centrale SMCO5-5X4 | 1 ms |
| Largeurs zone centrale N45-4X19 | 2 ms |
| Coupe 1 mm lot 1 (N45, B) | 253 ms |

## Limites

- Expérience de calibration et figures de revue uniquement : pas de volume 3D, pas d'intégration atelier ni client, pas de remplacement du profil 1.1.
- MK04 D3 reste en quarantaine (lot 1) ; les adaptations documentaires MK03/MK13 ne sont pas des contrôles indépendants.
- La bande fine couvre |x| ≤ 5 mm sur toute la hauteur ; au-delà, le pas reste 1 mm.
