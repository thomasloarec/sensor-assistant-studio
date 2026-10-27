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

| Variante | score | publiées | calculables | indisponibles | manquantes | médiane |écart| % | > 20 % | critère |
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

| Variante | approche | calculables | médiane |écart| % | > 20 % |
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

## Disponibilité réelle des classes

La transcription Form 66 contient les classes A..F ; **G est absente de la source** — les lignes G des tableaux portent le statut « no_source » et ne sont jamais présentées comme validées. D1 des classes B/D : contrôles isolés hors apprentissage, listés dans les tableaux CSV (`tableau_V*.csv`, 112 lignes chacun : 7 classes × 4 approches × 2 bornes × 2 aimants).

## Coupes perpendiculaires raffinées (audit géométrique, profil 1.1, B/C1)

Pas 0,25 mm dans la zone locale |x| ≤ 5 mm et y ≤ 5 mm, 1 mm ailleurs, cellules à dimension réelle sans recouvrement. Trois états de lecture distingués : collision (invalidité géométrique), réponse nominale nulle (zone centrale du modèle B), diagnostic défavorable. Ces largeurs ne sont pas des probabilités.

| Coupe | aimant | cellules | nœuds communs vérifiés | désaccords |
|---|---|---|---|---|
| 2-perpendicular-centred-C | SMCO5-5X4 | 2020 | 66 | 0 |
| 3-perpendicular-offset-C | SMCO5-5X4 | 2020 | 66 | 0 |
| 2-perpendicular-centred-C | N45-4X19 | 2020 | 66 | 0 |
| 3-perpendicular-offset-C | N45-4X19 | 2020 | 66 | 0 |

Demi-largeur de la zone centrale à réponse nominale nulle (modèle B, scénario nominal) selon le pas de balayage :

| aimant | profondeur y (mm) | pas 1,25 | pas 0,25 | pas 0,125 |
|---|---|---|---|---|---|
| SMCO5-5X4 | 6 | 2.500 | 2.000 | 2.000 |
| SMCO5-5X4 | 8 | 2.500 | 2.250 | 2.125 |
| SMCO5-5X4 | 10 | 2.500 | 2.000 | 2.000 |
| N45-4X19 | 6 | — | — | — |
| N45-4X19 | 8 | — | — | — |
| N45-4X19 | 10 | — | — | — |

Figures : `svg/2-perpendicular-centred-C_*_B_fine.svg` et `svg/3-perpendicular-offset-C_*_B_fine.svg` (+ CSV). L'enveloppe de verre publiée (capsule pointillée) et l'aimant aux repères sont dessinés à taille réelle.

## Vérification collision N45 (reproduction)

Coupe 1 mm du lot 1 (2-perpendicular-centred-C, N45, B/C1) recalculée : **108 cellules favorables, 0 à y = 5 mm**. La pose centre [0, 5, 0], axe [0, 1, 0] renvoie **collision (collision)** : le corps du cylindre est bien testé dans `pose.ts` et les cellules proches du reed à y = 5 sont indisponibles pour collision — aucune collision n'est manquée ni inventée.

Point distinct : l'enveloppe conservative du lot 1 (capsule ±7 mm, rayon 1.1 mm, encombrement publié KSK-1A66) est **surdimensionnée axialement** par rapport à la demi-longueur effective du profil 1.1 (4 mm) ; avec L = 16 mm elle serait au contraire plus courte que la zone d'intégration (8 mm). C'est une exclusion géométrique conservative, pas une dimension de lame.

## Conclusions factuelles

- Les quatre variantes sont évaluées avec le même apprentissage (8 bornes D1 C/E) et le même critère ; les tableaux complets A..G sont dans les CSV.
- L = 16 mm est un paramètre ajusté : il ne prouve pas des pattes de 1 mm. Sans géométrie des pattes par boîtier, aucune longueur de patte n'est inventée.
- Les plages AT viennent de la fiche MK04 uniquement ; θ = k·AT est une hypothèse ajustée, pas une conversion physique mT/AT universalisable.
- Source Standex sur les pattes : Datenbuch Reed Technology 2022, pp. 45-47 (https://standexdetect.com/wp-content/uploads/sites/2/2025/08/Datenbuch-Reed-Technology-EN-2022.pdf) et fiche KSK-1A66 : modifier les pattes (coupe, formage) altère la sensibilité. Le modèle futur devra combiner reed + configuration magnétique du montage + aimant ; les décalages documentaires Form→produit ne sont pas une preuve d'identité physique.
- Le repère fixe +4 mm (V2) est un diagnostic non validé physiquement ; il n'a pas été ajusté sur les contrôles.

## Temps de calcul (machine de génération)

| Étape | Durée |
|---|---|
| Ajustement de L (accord inter-aimants D1) | 26 ms |
| Ajustement de k (V1-L16-d7) | 557 ms |
| Tableau A..G (V1-L16-d7) | 2209 ms |
| Ajustement de k (V2-L16-d4) | 492 ms |
| Tableau A..G (V2-L16-d4) | 2074 ms |
| Ajustement de k (V3-L8-d7) | 466 ms |
| Tableau A..G (V3-L8-d7) | 2014 ms |
| Ajustement de k (V4-Lfit-d7) | 521 ms |
| Tableau A..G (V4-Lfit-d7) | 2038 ms |
| Seuils partagés lot 1 (B/C1) | 303 ms |
| Coupe raffinée 2-perpendicular-centred-C SMCO5-5X4 | 347 ms |
| Coupe raffinée 3-perpendicular-offset-C SMCO5-5X4 | 323 ms |
| Coupe raffinée 2-perpendicular-centred-C N45-4X19 | 196 ms |
| Coupe raffinée 3-perpendicular-offset-C N45-4X19 | 190 ms |
| Nœuds communs 2-perpendicular-centred-C SMCO5-5X4 | 296 ms |
| Nœuds communs 3-perpendicular-offset-C SMCO5-5X4 | 295 ms |
| Nœuds communs 2-perpendicular-centred-C N45-4X19 | 198 ms |
| Nœuds communs 3-perpendicular-offset-C N45-4X19 | 165 ms |
| Largeurs zone centrale SMCO5-5X4 | 1 ms |
| Largeurs zone centrale N45-4X19 | 0 ms |
| Coupe 1 mm lot 1 (N45, B) | 180 ms |

## Limites

- Expérience de calibration et figures de revue uniquement : pas de volume 3D, pas d'intégration atelier ni client, pas de remplacement du profil 1.1.
- MK04 D3 reste en quarantaine (lot 1) ; les adaptations documentaires MK03/MK13 ne sont pas des contrôles indépendants.
- La zone fine couvre |x| ≤ 5 mm et y ≤ 5 mm ; au-delà, le pas reste 1 mm.
