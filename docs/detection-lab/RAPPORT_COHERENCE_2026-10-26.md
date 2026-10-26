# Laboratoire de détection reed — rapport de cohérence (pilote)

Généré par `bun scripts/detection-lab-report.ts` le 2026-10-26 à partir du noyau `src/lib/detection-lab/`. Préversion interne staff. **Ordres de grandeur pédagogiques : aucune garantie de commutation au millimètre, aucun résultat qualifié.**

## Provenance

- Transcription Form : `src/data/detection-lab/brochure-form-rows.json` (version brochure-form-transcription-2026-10-26, SHA256 fichier `7131f8c90c119969273d7b3aa92cd853f116c0b20e9fca678765be393f185802`) — 96 lignes = 384 plages (768 bornes), pas 384 mesures indépendantes. Aucune correction.
- PDF : https://standexdetect.com/wp-content/uploads/sites/2/2025/10/brochure-reed-sensor-activation-guide.pdf — SHA256 711bc6f75bec192fc6765dd6e299f2cdd322bb49ec62880c486b16a57b926f8f.
- Tableaux commerciaux : `src/data/studio-v2/activation-guide.json` (guide-40p-owner-extraction-2026-09-15, 3 004 entrées, inchangées, non toutes fiables).
- Classes AT : https://standexdetect.com/wp-content/uploads/sites/2/2025/09/datasheet-reed-sensor-series-mk04.pdf p2 (A5-10 … G35-40 AT, MK04 uniquement). Disponibilité des lettres non universalisée.
- Pull-in/drop-out distincts : https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/. Les bornes up/to sont les deux bornes d'une PLAGE typique pour un aimant appairé, pas une hystérésis ni une bande de dispersion ; aucune transposition vers un autre aimant.

Exceptions connues :
- MK04 D3 : 71 plages inversées sur 96 (up > to) — quarantaine, donnée inconnue.
- MK04 D1/D4/D5 : décalages identiques à MK13 (non utilisés pour une estimation dans ce lot).
- MK12 : ne suit pas une règle de décalage constant.
- MK21 66 D4 up : décalage non constant.
- La brochure n'est pas reproduite sans exceptions.

## Conversion du moment

Valeur q en 10⁻⁶ V·s·cm → q·10⁻⁸ Wb·m → m = q·10⁻⁸/μ0 (A·m²), μ0 = 4π·10⁻⁷. V = πr²h (m³), J_eff = μ0·m/V. Aimantation supposée uniforme et rigide (pas de démagnétisation partielle, de perméabilité du reed ni de pièce ferreuse).

| Aimant | q | m (A·m²) | V (m³) | J_eff (T) |
|---|---|---|---|---|
| MAGNET SmCo5 5 x 4mm | 7.2 | 0.0572958 | 7.8540e-8 | 0.9167 |
| MAGNET NdFeB N45 4 x 19mm | 30.8 | 0.2450986 | 2.3876e-7 | 1.2900 |

μ0 = 1.256637061e-6.

## Moteur

Cylindre fini à aimantation axiale, solution analytique exacte (nappe de courant équivalente, Derby & Olbert 2010, intégrale elliptique de Bulirsch). Intérieur de l'aimant et collision avec l'enveloppe de verre exclus. Réponse calculée par quadrature de Gauss-Legendre sur chaque lame.

| Contrôle | Résultat |
|---|---|
| Axe : formule fermée vs analytique (z = 5 mm) | écart relatif 0.00e+0 |
| Limite lointaine vs dipôle (r = 100 mm) | écart relatif 8.07e-5 |
| Quadrature 12 vs 24 points/lame (pose test) | écart relatif 1.67e-15 |
| Maximum de lobe D4 : pas x 1 mm vs 0,5 mm (SmCo, C, A) | 8.6170 vs 8.6170 mm |
| Bissection des racines | tolérance 0.0001 mm ; section dorée 0.001 mm |

## Profil d'hypothèses

`reed-lab-hypotheses` v1.0.0 figé le 2026-10-26.

- H-L1 longueur effective nominale 8 mm (non publiée), enveloppe de verre rayon 1 mm, demi-longueur 5 mm.
- Scénarios déterministes (un facteur à la fois + nominal, 9 au total, identiques sur tout un parcours) : nominal, L-30%, L+30%, x-1mm, x+1mm, y-1mm, y+1mm, m-10%, m+10%. Position interne : déplacements ±1 mm selon x (axe des lames) et ±1 mm selon y (normale d'approche) — l'ensemble effectivement échantillonné n'est PAS le pavé continu.
- Retrait de frontière : favorable si tous les scénarios ≥ θ_up·(1+0.2) ; défavorable si tous ≤ θ_to·(1−0.2) ; sinon variable. Aucun pourcentage de confiance.
- Les seuils sont calibrés sur le seul scénario nominal ; les scénarios font varier la physique à seuil fixe.

Conventions :
- C1 (retenue) : Distance publiée = jeu entre la face de l'aimant la plus proche et le repère actif (axe du reed pour D1/D4/D5, extrémité de la longueur effective nominale pour D3). Le centre de l'aimant est décalé de la demi-dimension projetée.
- C2 (variante d'audit) : Variante : distance publiée = du repère actif au CENTRE de l'aimant (demi-dimension ignorée). Présentée pour l'audit, non prouvée.

Approches :
- D1 : Aimant parallèle aux lames (aimantation selon x), centré en x, approche latérale selon y. Datum ambigu dans la source (registre R2b).
- D3 : Aimant coaxial aux lames, approche par l'extrémité selon x. Datum ambigu dans la source (registre R2b).
- D4 : H-D4 : aimant perpendiculaire aux lames (aimantation selon y), approche selon y ; distance = maximum de lobe sur x.
- D5 : H-D5 : aimant parallèle aux lames (aimantation selon x), approche selon y ; distance = maximum du lobe SECONDAIRE (au-delà du premier minimum en x). Hypothèse : deux variantes perpendiculaires essayées donnent Bx ≡ 0 sur l'axe (reed dans le plan médian de l'aimant) et ont été rejetées.

Modèles :
- Réponse A : |moyenne de Bx sur la longueur effective| (poids de Gauss normalisés), mT.
- Réponse B : M1, M2 = moyennes de Bx sur chaque lame ; réponse = min(|M1|, |M2|) si M1·M2 > 0, sinon 0. Le minimum n'est PAS la moyenne géométrique.

## Seuils implicites, désaccord, seuil partagé et prédictions croisées

Un seuil par reed 66 + classe + modèle + convention et par borne, PARTAGÉ entre les deux aimants (et les boîtiers via l'adaptation documentaire). Ajustement conjoint identifié : moindres carrés sur les distances D1 Form des deux aimants. Aucun facteur par aimant ni par D.

| Modèle | Conv. | Classe | Borne | θ SmCo (mT) | θ N45 (mT) | désaccord | θ partagé | D1 SmCo ajusté / publié | D1 N45 ajusté / publié | SmCo→N45 | N45→SmCo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A | C1 | C | up | 4.858 | 3.216 | ×1.51 | 3.543 | 8.56 / 7.3 | 14.28 / 15 | 12.05 / 15 | 8.96 / 7.3 |
| A | C1 | C | to | 3.264 | 2.278 | ×1.43 | 2.482 | 10.12 / 8.9 | 17.01 / 17.7 | 14.89 / 17.7 | 10.52 / 8.9 |
| A | C1 | E | up | 7.162 | 4.423 | ×1.62 | 4.932 | 7.24 / 5.9 | 11.95 / 12.7 | 9.51 / 12.7 | 7.66 / 5.9 |
| A | C1 | E | to | 5.406 | 3.584 | ×1.51 | 3.941 | 8.12 / 6.9 | 13.51 / 14.2 | 11.33 / 14.2 | 8.51 / 6.9 |
| B | C1 | C | up | 4.858 | 3.216 | ×1.51 | 3.543 | 8.56 / 7.3 | 14.28 / 15 | 12.05 / 15 | 8.96 / 7.3 |
| B | C1 | C | to | 3.264 | 2.278 | ×1.43 | 2.482 | 10.12 / 8.9 | 17.01 / 17.7 | 14.89 / 17.7 | 10.52 / 8.9 |
| B | C1 | E | up | 7.162 | 4.423 | ×1.62 | 4.932 | 7.24 / 5.9 | 11.95 / 12.7 | 9.51 / 12.7 | 7.66 / 5.9 |
| B | C1 | E | to | 5.406 | 3.584 | ×1.51 | 3.941 | 8.12 / 6.9 | 13.51 / 14.2 | 11.33 / 14.2 | 8.51 / 6.9 |
| A | C2 | C | up | 10.013 | 4.237 | ×2.36 | 5.110 | 9.61 / 7.3 | 13.71 / 15 | 9.44 / 15 | 10.33 / 7.3 |
| A | C2 | C | to | 6.206 | 2.932 | ×2.12 | 3.479 | 11.13 / 8.9 | 16.42 / 17.7 | 12.42 / 17.7 | 11.86 / 8.9 |
| A | C2 | E | up | 15.991 | 5.950 | ×2.69 | 7.307 | 8.33 / 5.9 | 11.38 / 12.7 | 6.63 / 12.7 | 9.05 / 5.9 |
| A | C2 | E | to | 11.391 | 4.755 | ×2.40 | 5.730 | 9.19 / 6.9 | 12.95 / 14.2 | 8.66 / 14.2 | 9.88 / 6.9 |
| B | C2 | C | up | 10.013 | 4.237 | ×2.36 | 5.110 | 9.61 / 7.3 | 13.71 / 15 | 9.44 / 15 | 10.33 / 7.3 |
| B | C2 | C | to | 6.206 | 2.932 | ×2.12 | 3.479 | 11.13 / 8.9 | 16.42 / 17.7 | 12.42 / 17.7 | 11.86 / 8.9 |
| B | C2 | E | up | 15.991 | 5.950 | ×2.69 | 7.307 | 8.33 / 5.9 | 11.38 / 12.7 | 6.63 / 12.7 | 9.05 / 5.9 |
| B | C2 | E | to | 11.391 | 4.755 | ×2.40 | 5.730 | 9.19 / 6.9 | 12.95 / 14.2 | 8.66 / 14.2 | 9.88 / 6.9 |

Lecture : un désaccord ×1,4 à ×1,6 (C1) ou ×2,1 à ×2,7 (C2) entre les seuils implicites des deux aimants signifie que le modèle ne reproduit pas, avec un seul seuil, le rapport des distances publiées. Il est affiché, pas compensé.

## Bilan par modèle et convention

| Modèle | Conv. | lignes | apprentissage | contrôles | manquants | indisponibles | quarantaine | |écart| moyen contrôles (mm) | médiane |%| | contrôles > 20 % |
|---|---|---|---|---|---|---|---|---|---|---|
| A | C1 | 104 | 8 | 84 | 4 | 0 | 8 | 1.37 | 20.16 | 42 |
| B | C1 | 104 | 8 | 84 | 4 | 0 | 8 | 1.24 | 15.50 | 36 |
| A | C2 | 104 | 8 | 84 | 4 | 0 | 8 | 3.73 | 44.04 | 66 |
| B | C2 | 104 | 8 | 84 | 4 | 0 | 8 | 3.08 | 35.63 | 53 |

Les deux modèles restent **candidats non départagés** : B (C1) est meilleur sur la médiane, mais les écarts > 20 % restent nombreux dans les deux. Aucune correction n'a été appliquée pour franchir un seuil de 20 %. La convention C2 dégrade nettement les contrôles ; elle n'est pas déclarée réfutée pour autant, le datum source restant ambigu.

## Tableau complet — modèle A, convention C1

| source | page | référence | aimant | cl. | D | borne | publié | estimé | écart mm | écart % | statut | anomalies | θ partagé |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D1 | up | 7.3 | 8.556 | 1.256 | 17.2 | training | — | 3.543 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D1 | to | 8.9 | 10.115 | 1.215 | 13.7 | training | — | 2.482 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D3 | up | 7.5 | 9.444 | 1.944 | 25.9 | control | écart > 20 % | 3.543 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D3 | to | 9.8 | 11.239 | 1.439 | 14.7 | control | — | 2.482 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D4 | up | 6.8 | 8.617 | 1.817 | 26.7 | control | écart > 20 % | 3.543 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D4 | to | 8.7 | 10.081 | 1.381 | 15.9 | control | — | 2.482 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D5 | up | 3.2 | 4.005 | 0.805 | 25.2 | control | écart > 20 % | 3.543 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D5 | to | 5 | 4.906 | -0.094 | -1.9 | control | — | 2.482 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D1 | up | 15 | 14.284 | -0.717 | -4.8 | training | — | 3.543 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D1 | to | 17.7 | 17.005 | -0.695 | -3.9 | training | — | 2.482 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D3 | up | 12.4 | 13.241 | 0.841 | 6.8 | control | — | 3.543 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D3 | to | 17.7 | 15.981 | -1.719 | -9.7 | control | — | 2.482 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D4 | up | 10.1 | 10.877 | 0.777 | 7.7 | control | — | 3.543 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D4 | to | 12.5 | 12.943 | 0.443 | 3.5 | control | — | 2.482 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D5 | up | 9.8 | 7.640 | -2.160 | -22.0 | control | écart > 20 % | 3.543 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D5 | to | 12.4 | 9.174 | -3.226 | -26.0 | control | virgule décimale dans la source (« 12,4 ») ; écart > 20 % | 2.482 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D1 | up | 5.9 | 7.243 | 1.343 | 22.8 | training | écart > 20 % | 4.932 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D1 | to | 6.9 | 8.120 | 1.220 | 17.7 | training | — | 3.941 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D3 | up | 5.6 | 7.966 | 2.366 | 42.3 | control | écart > 20 % | 4.932 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D3 | to | 6.8 | 8.949 | 2.149 | 31.6 | control | écart > 20 % | 3.941 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D4 | up | 5.7 | 7.391 | 1.691 | 29.7 | control | écart > 20 % | 4.932 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D4 | to | 6.7 | 8.209 | 1.509 | 22.5 | control | écart > 20 % | 3.941 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D5 | up | — | 3.255 | — | — | missing | borne non publiée | 4.932 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D5 | to | 2.7 | 3.755 | 1.055 | 39.1 | control | écart > 20 % | 3.941 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D1 | up | 12.7 | 11.951 | -0.749 | -5.9 | training | — | 4.932 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D1 | to | 14.2 | 13.514 | -0.686 | -4.8 | training | — | 3.941 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D3 | up | 9.4 | 11.021 | 1.621 | 17.2 | control | — | 4.932 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D3 | to | 11.3 | 12.493 | 1.193 | 10.6 | control | — | 3.941 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D4 | up | 7.3 | 9.195 | 1.895 | 26.0 | control | écart > 20 % | 4.932 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D4 | to | 9.3 | 10.312 | 1.012 | 10.9 | control | — | 3.941 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D5 | up | 7.3 | 6.356 | -0.944 | -12.9 | control | — | 4.932 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D5 | to | 8.6 | 7.213 | -1.387 | -16.1 | control | virgule décimale dans la source (« 8,6 ») | 3.941 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D1 | up | 4.65 | 5.906 | 1.256 | 27.0 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 3.543 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D1 | to | 7.95 | 9.165 | 1.215 | 15.3 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 2.482 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D3 | up | 6.7 | 8.643 | 1.944 | 29.0 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.543 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D3 | to | 9 | 10.439 | 1.439 | 16.0 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D4 | up | 4.15 | 5.967 | 1.817 | 43.8 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.543 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D4 | to | 7.75 | 9.131 | 1.381 | 17.8 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D5 | up | 2.4 | 3.205 | 0.805 | 33.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.543 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D5 | to | 4.2 | 4.106 | -0.094 | -2.2 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D1 | up | 12.35 | 11.633 | -0.717 | -5.8 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 3.543 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D1 | to | 16.75 | 16.055 | -0.695 | -4.2 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 2.482 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D3 | up | 11.6 | 12.441 | 0.841 | 7.3 | control | adaptation documentaire Form→produit (décalage empirique) | 3.543 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D3 | to | 16.9 | 15.181 | -1.719 | -10.2 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D4 | up | 7.45 | 8.227 | 0.777 | 10.4 | control | adaptation documentaire Form→produit (décalage empirique) | 3.543 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D4 | to | 11.55 | 11.993 | 0.443 | 3.8 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D5 | up | 9 | 6.840 | -2.160 | -24.0 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.543 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D5 | to | 11.6 | 8.374 | -3.226 | -27.8 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 2.482 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D1 | up | 3.25 | 4.593 | 1.343 | 41.3 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 4.932 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D1 | to | 5.95 | 7.170 | 1.220 | 20.5 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 3.941 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D3 | up | 4.8 | 7.166 | 2.366 | 49.3 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 4.932 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D3 | to | 6 | 8.149 | 2.149 | 35.8 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.941 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D4 | up | 3.05 | 4.741 | 1.691 | 55.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 4.932 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D4 | to | 5.75 | 7.259 | 1.509 | 26.3 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.941 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D5 | up | — | 2.455 | — | — | missing | borne non publiée ; adaptation documentaire Form→produit (décalage empirique) | 4.932 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D5 | to | 1.9 | 2.955 | 1.055 | 55.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.941 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D1 | up | 10.05 | 9.301 | -0.749 | -7.5 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 4.932 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D1 | to | 13.25 | 12.564 | -0.686 | -5.2 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 3.941 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D3 | up | 8.6 | 10.220 | 1.621 | 18.8 | control | adaptation documentaire Form→produit (décalage empirique) | 4.932 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D3 | to | 10.5 | 11.693 | 1.193 | 11.4 | control | adaptation documentaire Form→produit (décalage empirique) | 3.941 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D4 | up | 4.65 | 6.545 | 1.895 | 40.8 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 4.932 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D4 | to | 8.35 | 9.362 | 1.012 | 12.1 | control | adaptation documentaire Form→produit (décalage empirique) | 3.941 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D5 | up | 6.5 | 5.556 | -0.944 | -14.5 | control | adaptation documentaire Form→produit (décalage empirique) | 4.932 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D5 | to | 7.8 | 6.412 | -1.387 | -17.8 | control | adaptation documentaire Form→produit (décalage empirique) | 3.941 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D1 | up | 2.8 | 4.056 | 1.256 | 44.8 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 3.543 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D1 | to | 5.85 | 7.065 | 1.215 | 20.8 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 2.482 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D3 | up | 4.1 | 6.043 | 1.944 | 47.4 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.543 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D3 | to | 8.2 | 9.639 | 1.439 | 17.6 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D4 | up | 2.3 | 4.117 | 1.817 | 79.0 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.543 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D4 | to | 5.65 | 7.031 | 1.381 | 24.4 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 2.482 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D5 | up | — | 0.605 | — | — | missing | borne non publiée ; adaptation documentaire Form→produit (décalage empirique) | 3.543 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D5 | to | 3.4 | 3.306 | -0.094 | -2.8 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D1 | up | 10.5 | 9.784 | -0.717 | -6.8 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 3.543 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D1 | to | 14.65 | 13.955 | -0.695 | -4.7 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 2.482 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D3 | up | 9 | 9.841 | 0.841 | 9.3 | control | adaptation documentaire Form→produit (décalage empirique) | 3.543 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D3 | to | 16.1 | 14.381 | -1.719 | -10.7 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D4 | up | 5.6 | 6.377 | 0.777 | 13.9 | control | adaptation documentaire Form→produit (décalage empirique) | 3.543 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D4 | to | 9.45 | 9.893 | 0.443 | 4.7 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D5 | up | 6.4 | 4.240 | -2.160 | -33.8 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.543 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D5 | to | 10.8 | 7.574 | -3.226 | -29.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 2.482 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D1 | up | 1.4 | 2.743 | 1.343 | 95.9 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 4.932 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D1 | to | 3.85 | 5.070 | 1.220 | 31.7 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 3.941 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D3 | up | 2.2 | 4.566 | 2.366 | 107.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 4.932 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D3 | to | 5.2 | 7.349 | 2.149 | 41.3 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.941 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D4 | up | 1.2 | 2.891 | 1.691 | 140.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 4.932 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D4 | to | 3.65 | 5.159 | 1.509 | 41.4 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.941 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D5 | up | — | — | — | — | missing | borne non publiée ; estimation indisponible : negative_after_offset ; adaptation documentaire Form→produit (décalage empirique) | 4.932 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D5 | to | 1.1 | 2.155 | 1.055 | 95.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.941 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D1 | up | 8.2 | 7.451 | -0.749 | -9.1 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 4.932 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D1 | to | 11.15 | 10.464 | -0.686 | -6.2 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 3.941 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D3 | up | 6 | 7.620 | 1.621 | 27.0 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 4.932 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D3 | to | 9.7 | 10.893 | 1.193 | 12.3 | control | adaptation documentaire Form→produit (décalage empirique) | 3.941 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D4 | up | 2.8 | 4.695 | 1.895 | 67.7 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 4.932 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D4 | to | 6.25 | 7.262 | 1.012 | 16.2 | control | adaptation documentaire Form→produit (décalage empirique) | 3.941 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D5 | up | 3.9 | 2.956 | -0.944 | -24.2 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 4.932 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D5 | to | 7 | 5.612 | -1.387 | -19.8 | control | adaptation documentaire Form→produit (décalage empirique) | 3.941 |
| MK04 | 12 | MK04-1A66C-X | SMCO5-5X4 | C | D3 | up | 6.4 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 3.543 |
| MK04 | 12 | MK04-1A66C-X | SMCO5-5X4 | C | D3 | to | 5.2 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 2.482 |
| MK04 | 13 | MK04-1A66C-X | N45-4X19 | C | D3 | up | 14.3 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 3.543 |
| MK04 | 13 | MK04-1A66C-X | N45-4X19 | C | D3 | to | 8.5 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 2.482 |
| MK04 | 12 | MK04-1A66E-X | SMCO5-5X4 | E | D3 | up | 3.4 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) | 4.932 |
| MK04 | 12 | MK04-1A66E-X | SMCO5-5X4 | E | D3 | to | 4.1 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) | 3.941 |
| MK04 | 13 | MK04-1A66E-X | N45-4X19 | E | D3 | up | 7.9 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 4.932 |
| MK04 | 13 | MK04-1A66E-X | N45-4X19 | E | D3 | to | 5.7 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 3.941 |

## Tableau complet — modèle B, convention C1

| source | page | référence | aimant | cl. | D | borne | publié | estimé | écart mm | écart % | statut | anomalies | θ partagé |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D1 | up | 7.3 | 8.556 | 1.256 | 17.2 | training | — | 3.543 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D1 | to | 8.9 | 10.115 | 1.215 | 13.7 | training | — | 2.482 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D3 | up | 7.5 | 6.928 | -0.572 | -7.6 | control | — | 3.543 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D3 | to | 9.8 | 8.777 | -1.023 | -10.4 | control | — | 2.482 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D4 | up | 6.8 | 8.598 | 1.798 | 26.4 | control | écart > 20 % | 3.543 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D4 | to | 8.7 | 10.068 | 1.367 | 15.7 | control | — | 2.482 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D5 | up | 3.2 | 3.942 | 0.742 | 23.2 | control | écart > 20 % | 3.543 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D5 | to | 5 | 4.862 | -0.138 | -2.8 | control | — | 2.482 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D1 | up | 15 | 14.284 | -0.717 | -4.8 | training | — | 3.543 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D1 | to | 17.7 | 17.005 | -0.695 | -3.9 | training | — | 2.482 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D3 | up | 12.4 | 10.873 | -1.527 | -12.3 | control | — | 3.543 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D3 | to | 17.7 | 13.659 | -4.040 | -22.8 | control | écart > 20 % | 2.482 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D4 | up | 10.1 | 10.868 | 0.768 | 7.6 | control | — | 3.543 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D4 | to | 12.5 | 12.937 | 0.437 | 3.5 | control | — | 2.482 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D5 | up | 9.8 | 7.624 | -2.176 | -22.2 | control | écart > 20 % | 3.543 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D5 | to | 12.4 | 9.163 | -3.237 | -26.1 | control | virgule décimale dans la source (« 12,4 ») ; écart > 20 % | 2.482 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D1 | up | 5.9 | 7.243 | 1.343 | 22.8 | training | écart > 20 % | 4.932 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D1 | to | 6.9 | 8.120 | 1.220 | 17.7 | training | — | 3.941 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D3 | up | 5.6 | 5.398 | -0.202 | -3.6 | control | — | 4.932 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D3 | to | 6.8 | 6.417 | -0.383 | -5.6 | control | — | 3.941 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D4 | up | 5.7 | 7.364 | 1.664 | 29.2 | control | écart > 20 % | 4.932 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D4 | to | 6.7 | 8.187 | 1.487 | 22.2 | control | écart > 20 % | 3.941 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D5 | up | — | 3.166 | — | — | missing | borne non publiée | 4.932 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D5 | to | 2.7 | 3.684 | 0.984 | 36.5 | control | écart > 20 % | 3.941 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D1 | up | 12.7 | 11.951 | -0.749 | -5.9 | training | — | 4.932 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D1 | to | 14.2 | 13.514 | -0.686 | -4.8 | training | — | 3.941 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D3 | up | 9.4 | 8.604 | -0.796 | -8.5 | control | — | 4.932 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D3 | to | 11.3 | 10.111 | -1.189 | -10.5 | control | — | 3.941 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D4 | up | 7.3 | 9.181 | 1.881 | 25.8 | control | écart > 20 % | 4.932 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D4 | to | 9.3 | 10.302 | 1.002 | 10.8 | control | — | 3.941 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D5 | up | 7.3 | 6.332 | -0.968 | -13.3 | control | — | 4.932 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D5 | to | 8.6 | 7.194 | -1.406 | -16.4 | control | virgule décimale dans la source (« 8,6 ») | 3.941 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D1 | up | 4.65 | 5.906 | 1.256 | 27.0 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 3.543 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D1 | to | 7.95 | 9.165 | 1.215 | 15.3 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 2.482 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D3 | up | 6.7 | 6.128 | -0.572 | -8.5 | control | adaptation documentaire Form→produit (décalage empirique) | 3.543 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D3 | to | 9 | 7.977 | -1.023 | -11.4 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D4 | up | 4.15 | 5.948 | 1.798 | 43.3 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.543 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D4 | to | 7.75 | 9.117 | 1.367 | 17.6 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D5 | up | 2.4 | 3.142 | 0.742 | 30.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.543 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D5 | to | 4.2 | 4.062 | -0.138 | -3.3 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D1 | up | 12.35 | 11.633 | -0.717 | -5.8 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 3.543 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D1 | to | 16.75 | 16.055 | -0.695 | -4.2 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 2.482 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D3 | up | 11.6 | 10.073 | -1.527 | -13.2 | control | adaptation documentaire Form→produit (décalage empirique) | 3.543 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D3 | to | 16.9 | 12.860 | -4.040 | -23.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 2.482 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D4 | up | 7.45 | 8.218 | 0.768 | 10.3 | control | adaptation documentaire Form→produit (décalage empirique) | 3.543 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D4 | to | 11.55 | 11.987 | 0.437 | 3.8 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D5 | up | 9 | 6.824 | -2.176 | -24.2 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.543 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D5 | to | 11.6 | 8.363 | -3.237 | -27.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 2.482 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D1 | up | 3.25 | 4.593 | 1.343 | 41.3 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 4.932 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D1 | to | 5.95 | 7.170 | 1.220 | 20.5 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 3.941 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D3 | up | 4.8 | 4.598 | -0.202 | -4.2 | control | adaptation documentaire Form→produit (décalage empirique) | 4.932 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D3 | to | 6 | 5.617 | -0.383 | -6.4 | control | adaptation documentaire Form→produit (décalage empirique) | 3.941 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D4 | up | 3.05 | 4.714 | 1.664 | 54.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 4.932 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D4 | to | 5.75 | 7.237 | 1.487 | 25.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.941 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D5 | up | — | 2.366 | — | — | missing | borne non publiée ; adaptation documentaire Form→produit (décalage empirique) | 4.932 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D5 | to | 1.9 | 2.884 | 0.984 | 51.8 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.941 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D1 | up | 10.05 | 9.301 | -0.749 | -7.5 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 4.932 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D1 | to | 13.25 | 12.564 | -0.686 | -5.2 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 3.941 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D3 | up | 8.6 | 7.804 | -0.796 | -9.3 | control | adaptation documentaire Form→produit (décalage empirique) | 4.932 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D3 | to | 10.5 | 9.311 | -1.189 | -11.3 | control | adaptation documentaire Form→produit (décalage empirique) | 3.941 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D4 | up | 4.65 | 6.531 | 1.881 | 40.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 4.932 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D4 | to | 8.35 | 9.352 | 1.002 | 12.0 | control | adaptation documentaire Form→produit (décalage empirique) | 3.941 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D5 | up | 6.5 | 5.532 | -0.968 | -14.9 | control | adaptation documentaire Form→produit (décalage empirique) | 4.932 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D5 | to | 7.8 | 6.394 | -1.406 | -18.0 | control | adaptation documentaire Form→produit (décalage empirique) | 3.941 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D1 | up | 2.8 | 4.056 | 1.256 | 44.8 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 3.543 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D1 | to | 5.85 | 7.065 | 1.215 | 20.8 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 2.482 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D3 | up | 4.1 | 3.529 | -0.572 | -13.9 | control | adaptation documentaire Form→produit (décalage empirique) | 3.543 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D3 | to | 8.2 | 7.177 | -1.023 | -12.5 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D4 | up | 2.3 | 4.098 | 1.798 | 78.2 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.543 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D4 | to | 5.65 | 7.018 | 1.367 | 24.2 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 2.482 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D5 | up | — | 0.542 | — | — | missing | borne non publiée ; adaptation documentaire Form→produit (décalage empirique) | 3.543 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D5 | to | 3.4 | 3.262 | -0.138 | -4.1 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D1 | up | 10.5 | 9.784 | -0.717 | -6.8 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 3.543 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D1 | to | 14.65 | 13.955 | -0.695 | -4.7 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 2.482 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D3 | up | 9 | 7.473 | -1.527 | -17.0 | control | adaptation documentaire Form→produit (décalage empirique) | 3.543 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D3 | to | 16.1 | 12.059 | -4.040 | -25.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 2.482 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D4 | up | 5.6 | 6.368 | 0.768 | 13.7 | control | adaptation documentaire Form→produit (décalage empirique) | 3.543 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D4 | to | 9.45 | 9.887 | 0.437 | 4.6 | control | adaptation documentaire Form→produit (décalage empirique) | 2.482 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D5 | up | 6.4 | 4.224 | -2.176 | -34.0 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.543 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D5 | to | 10.8 | 7.563 | -3.237 | -30.0 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 2.482 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D1 | up | 1.4 | 2.743 | 1.343 | 95.9 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 4.932 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D1 | to | 3.85 | 5.070 | 1.220 | 31.7 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 3.941 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D3 | up | 2.2 | 1.998 | -0.202 | -9.2 | control | adaptation documentaire Form→produit (décalage empirique) | 4.932 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D3 | to | 5.2 | 4.817 | -0.383 | -7.4 | control | adaptation documentaire Form→produit (décalage empirique) | 3.941 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D4 | up | 1.2 | 2.864 | 1.664 | 138.7 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 4.932 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D4 | to | 3.65 | 5.137 | 1.487 | 40.8 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.941 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D5 | up | — | — | — | — | missing | borne non publiée ; estimation indisponible : negative_after_offset ; adaptation documentaire Form→produit (décalage empirique) | 4.932 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D5 | to | 1.1 | 2.084 | 0.984 | 89.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.941 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D1 | up | 8.2 | 7.451 | -0.749 | -9.1 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 4.932 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D1 | to | 11.15 | 10.464 | -0.686 | -6.2 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 3.941 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D3 | up | 6 | 5.204 | -0.796 | -13.3 | control | adaptation documentaire Form→produit (décalage empirique) | 4.932 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D3 | to | 9.7 | 8.511 | -1.189 | -12.3 | control | adaptation documentaire Form→produit (décalage empirique) | 3.941 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D4 | up | 2.8 | 4.681 | 1.881 | 67.2 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 4.932 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D4 | to | 6.25 | 7.252 | 1.002 | 16.0 | control | adaptation documentaire Form→produit (décalage empirique) | 3.941 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D5 | up | 3.9 | 2.932 | -0.968 | -24.8 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 4.932 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D5 | to | 7 | 5.594 | -1.406 | -20.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.941 |
| MK04 | 12 | MK04-1A66C-X | SMCO5-5X4 | C | D3 | up | 6.4 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 3.543 |
| MK04 | 12 | MK04-1A66C-X | SMCO5-5X4 | C | D3 | to | 5.2 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 2.482 |
| MK04 | 13 | MK04-1A66C-X | N45-4X19 | C | D3 | up | 14.3 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 3.543 |
| MK04 | 13 | MK04-1A66C-X | N45-4X19 | C | D3 | to | 8.5 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 2.482 |
| MK04 | 12 | MK04-1A66E-X | SMCO5-5X4 | E | D3 | up | 3.4 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) | 4.932 |
| MK04 | 12 | MK04-1A66E-X | SMCO5-5X4 | E | D3 | to | 4.1 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) | 3.941 |
| MK04 | 13 | MK04-1A66E-X | N45-4X19 | E | D3 | up | 7.9 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 4.932 |
| MK04 | 13 | MK04-1A66E-X | N45-4X19 | E | D3 | to | 5.7 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 3.941 |

## Tableau complet — modèle A, convention C2

| source | page | référence | aimant | cl. | D | borne | publié | estimé | écart mm | écart % | statut | anomalies | θ partagé |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D1 | up | 7.3 | 9.610 | 2.310 | 31.6 | training | écart > 20 % | 5.110 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D1 | to | 8.9 | 11.132 | 2.232 | 25.1 | training | écart > 20 % | 3.479 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D3 | up | 7.5 | 9.818 | 2.318 | 30.9 | control | écart > 20 % | 5.110 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D3 | to | 9.8 | 11.530 | 1.730 | 17.6 | control | — | 3.479 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D4 | up | 6.8 | 9.267 | 2.467 | 36.3 | control | écart > 20 % | 5.110 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D4 | to | 8.7 | 10.688 | 1.988 | 22.9 | control | écart > 20 % | 3.479 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D5 | up | 3.2 | 5.679 | 2.479 | 77.5 | control | écart > 20 % | 5.110 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D5 | to | 5 | 6.549 | 1.549 | 31.0 | control | écart > 20 % | 3.479 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D1 | up | 15 | 13.711 | -1.289 | -8.6 | training | — | 5.110 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D1 | to | 17.7 | 16.417 | -1.283 | -7.3 | training | — | 3.479 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D3 | up | 12.4 | 20.300 | 7.900 | 63.7 | control | écart > 20 % | 5.110 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D3 | to | 17.7 | 22.872 | 5.172 | 29.2 | control | écart > 20 % | 3.479 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D4 | up | 10.1 | 18.527 | 8.427 | 83.4 | control | écart > 20 % | 5.110 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D4 | to | 12.5 | 20.476 | 7.976 | 63.8 | control | écart > 20 % | 3.479 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D5 | up | 9.8 | 8.226 | -1.574 | -16.1 | control | — | 5.110 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D5 | to | 12.4 | 9.714 | -2.686 | -21.7 | control | virgule décimale dans la source (« 12,4 ») ; écart > 20 % | 3.479 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D1 | up | 5.9 | 8.332 | 2.432 | 41.2 | training | écart > 20 % | 7.307 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D1 | to | 6.9 | 9.187 | 2.287 | 33.1 | training | écart > 20 % | 5.730 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D3 | up | 5.6 | 8.423 | 2.823 | 50.4 | control | écart > 20 % | 7.307 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D3 | to | 6.8 | 9.351 | 2.551 | 37.5 | control | écart > 20 % | 5.730 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D4 | up | 5.7 | 8.082 | 2.382 | 41.8 | control | écart > 20 % | 7.307 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D4 | to | 6.7 | 8.874 | 2.174 | 32.4 | control | écart > 20 % | 5.730 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D5 | up | — | 4.962 | — | — | missing | borne non publiée | 7.307 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D5 | to | 2.7 | 5.440 | 2.740 | 101.5 | control | écart > 20 % | 5.730 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D1 | up | 12.7 | 11.379 | -1.321 | -10.4 | training | — | 7.307 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D1 | to | 14.2 | 12.947 | -1.253 | -8.8 | training | — | 5.730 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D3 | up | 9.4 | 18.248 | 8.848 | 94.1 | control | écart > 20 % | 7.307 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D3 | to | 11.3 | 19.608 | 8.308 | 73.5 | control | écart > 20 % | 5.730 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D4 | up | 7.3 | 16.957 | 9.657 | 132.3 | control | écart > 20 % | 7.307 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D4 | to | 9.3 | 18.000 | 8.700 | 93.5 | control | écart > 20 % | 5.730 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D5 | up | 7.3 | 6.993 | -0.307 | -4.2 | control | — | 7.307 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D5 | to | 8.6 | 7.816 | -0.784 | -9.1 | control | virgule décimale dans la source (« 8,6 ») | 5.730 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D1 | up | 4.65 | 6.960 | 2.310 | 49.7 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 5.110 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D1 | to | 7.95 | 10.181 | 2.232 | 28.1 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 3.479 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D3 | up | 6.7 | 9.018 | 2.318 | 34.6 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D3 | to | 9 | 10.730 | 1.730 | 19.2 | control | adaptation documentaire Form→produit (décalage empirique) | 3.479 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D4 | up | 4.15 | 6.617 | 2.467 | 59.4 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D4 | to | 7.75 | 9.738 | 1.988 | 25.6 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D5 | up | 2.4 | 4.879 | 2.479 | 103.3 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D5 | to | 4.2 | 5.749 | 1.549 | 36.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D1 | up | 12.35 | 11.061 | -1.289 | -10.4 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 5.110 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D1 | to | 16.75 | 15.467 | -1.283 | -7.7 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 3.479 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D3 | up | 11.6 | 19.500 | 7.900 | 68.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D3 | to | 16.9 | 22.072 | 5.172 | 30.6 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D4 | up | 7.45 | 15.877 | 8.427 | 113.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D4 | to | 11.55 | 19.526 | 7.976 | 69.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D5 | up | 9 | 7.426 | -1.574 | -17.5 | control | adaptation documentaire Form→produit (décalage empirique) | 5.110 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D5 | to | 11.6 | 8.915 | -2.686 | -23.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D1 | up | 3.25 | 5.681 | 2.432 | 74.8 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 7.307 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D1 | to | 5.95 | 8.236 | 2.287 | 38.4 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 5.730 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D3 | up | 4.8 | 7.623 | 2.823 | 58.8 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D3 | to | 6 | 8.551 | 2.551 | 42.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D4 | up | 3.05 | 5.433 | 2.382 | 78.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D4 | to | 5.75 | 7.924 | 2.174 | 37.8 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D5 | up | — | 4.162 | — | — | missing | borne non publiée ; adaptation documentaire Form→produit (décalage empirique) | 7.307 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D5 | to | 1.9 | 4.640 | 2.740 | 144.2 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D1 | up | 10.05 | 8.729 | -1.321 | -13.1 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 7.307 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D1 | to | 13.25 | 11.997 | -1.253 | -9.5 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 5.730 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D3 | up | 8.6 | 17.448 | 8.848 | 102.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D3 | to | 10.5 | 18.808 | 8.308 | 79.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D4 | up | 4.65 | 14.307 | 9.657 | 207.7 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D4 | to | 8.35 | 17.050 | 8.700 | 104.2 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D5 | up | 6.5 | 6.193 | -0.307 | -4.7 | control | adaptation documentaire Form→produit (décalage empirique) | 7.307 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D5 | to | 7.8 | 7.016 | -0.784 | -10.1 | control | adaptation documentaire Form→produit (décalage empirique) | 5.730 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D1 | up | 2.8 | 5.110 | 2.310 | 82.5 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 5.110 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D1 | to | 5.85 | 8.082 | 2.232 | 38.1 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 3.479 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D3 | up | 4.1 | 6.418 | 2.318 | 56.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D3 | to | 8.2 | 9.930 | 1.730 | 21.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D4 | up | 2.3 | 4.767 | 2.467 | 107.3 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D4 | to | 5.65 | 7.638 | 1.988 | 35.2 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D5 | up | — | 2.279 | — | — | missing | borne non publiée ; adaptation documentaire Form→produit (décalage empirique) | 5.110 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D5 | to | 3.4 | 4.949 | 1.549 | 45.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D1 | up | 10.5 | 9.211 | -1.289 | -12.3 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 5.110 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D1 | to | 14.65 | 13.367 | -1.283 | -8.8 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 3.479 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D3 | up | 9 | 16.900 | 7.900 | 87.8 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D3 | to | 16.1 | 21.272 | 5.172 | 32.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D4 | up | 5.6 | 14.027 | 8.427 | 150.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D4 | to | 9.45 | 17.426 | 7.976 | 84.4 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D5 | up | 6.4 | 4.826 | -1.574 | -24.6 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D5 | to | 10.8 | 8.114 | -2.686 | -24.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D1 | up | 1.4 | 3.832 | 2.432 | 173.7 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 7.307 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D1 | to | 3.85 | 6.136 | 2.287 | 59.4 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 5.730 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D3 | up | 2.2 | 5.023 | 2.823 | 128.3 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D3 | to | 5.2 | 7.751 | 2.551 | 49.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D4 | up | 1.2 | 3.583 | 2.382 | 198.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D4 | to | 3.65 | 5.824 | 2.174 | 59.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D5 | up | — | 1.562 | — | — | missing | borne non publiée ; adaptation documentaire Form→produit (décalage empirique) | 7.307 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D5 | to | 1.1 | 3.840 | 2.740 | 249.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D1 | up | 8.2 | 6.879 | -1.321 | -16.1 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 7.307 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D1 | to | 11.15 | 9.897 | -1.253 | -11.2 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 5.730 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D3 | up | 6 | 14.848 | 8.848 | 147.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D3 | to | 9.7 | 18.008 | 8.308 | 85.7 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D4 | up | 2.8 | 12.457 | 9.657 | 344.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D4 | to | 6.25 | 14.950 | 8.700 | 139.2 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D5 | up | 3.9 | 3.593 | -0.307 | -7.9 | control | adaptation documentaire Form→produit (décalage empirique) | 7.307 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D5 | to | 7 | 6.216 | -0.784 | -11.2 | control | adaptation documentaire Form→produit (décalage empirique) | 5.730 |
| MK04 | 12 | MK04-1A66C-X | SMCO5-5X4 | C | D3 | up | 6.4 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 5.110 |
| MK04 | 12 | MK04-1A66C-X | SMCO5-5X4 | C | D3 | to | 5.2 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 3.479 |
| MK04 | 13 | MK04-1A66C-X | N45-4X19 | C | D3 | up | 14.3 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 5.110 |
| MK04 | 13 | MK04-1A66C-X | N45-4X19 | C | D3 | to | 8.5 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 3.479 |
| MK04 | 12 | MK04-1A66E-X | SMCO5-5X4 | E | D3 | up | 3.4 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) | 7.307 |
| MK04 | 12 | MK04-1A66E-X | SMCO5-5X4 | E | D3 | to | 4.1 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) | 5.730 |
| MK04 | 13 | MK04-1A66E-X | N45-4X19 | E | D3 | up | 7.9 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 7.307 |
| MK04 | 13 | MK04-1A66E-X | N45-4X19 | E | D3 | to | 5.7 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 5.730 |

## Tableau complet — modèle B, convention C2

| source | page | référence | aimant | cl. | D | borne | publié | estimé | écart mm | écart % | statut | anomalies | θ partagé |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D1 | up | 7.3 | 9.610 | 2.310 | 31.6 | training | écart > 20 % | 5.110 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D1 | to | 8.9 | 11.132 | 2.232 | 25.1 | training | écart > 20 % | 3.479 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D3 | up | 7.5 | 7.244 | -0.256 | -3.4 | control | — | 5.110 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D3 | to | 9.8 | 9.018 | -0.782 | -8.0 | control | — | 3.479 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D4 | up | 6.8 | 9.239 | 2.438 | 35.9 | control | écart > 20 % | 5.110 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D4 | to | 8.7 | 10.669 | 1.969 | 22.6 | control | écart > 20 % | 3.479 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D5 | up | 3.2 | 5.587 | 2.387 | 74.6 | control | écart > 20 % | 5.110 |
| Form | 4 | MK03Form-C 66-er | SMCO5-5X4 | C | D5 | to | 5 | 6.487 | 1.486 | 29.7 | control | écart > 20 % | 3.479 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D1 | up | 15 | 13.711 | -1.289 | -8.6 | training | — | 5.110 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D1 | to | 17.7 | 16.417 | -1.283 | -7.3 | training | — | 3.479 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D3 | up | 12.4 | 17.877 | 5.477 | 44.2 | control | écart > 20 % | 5.110 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D3 | to | 17.7 | 20.507 | 2.807 | 15.9 | control | — | 3.479 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D4 | up | 10.1 | 18.513 | 8.413 | 83.3 | control | écart > 20 % | 5.110 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D4 | to | 12.5 | 20.468 | 7.968 | 63.7 | control | écart > 20 % | 3.479 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D5 | up | 9.8 | 8.201 | -1.599 | -16.3 | control | — | 5.110 |
| Form | 5 | MK03Form-C 66-er | N45-4X19 | C | D5 | to | 12.4 | 9.698 | -2.701 | -21.8 | control | virgule décimale dans la source (« 12,4 ») ; écart > 20 % | 3.479 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D1 | up | 5.9 | 8.332 | 2.432 | 41.2 | training | écart > 20 % | 7.307 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D1 | to | 6.9 | 9.187 | 2.287 | 33.1 | training | écart > 20 % | 5.730 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D3 | up | 5.6 | 5.788 | 0.188 | 3.4 | control | — | 7.307 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D3 | to | 6.8 | 6.758 | -0.042 | -0.6 | control | — | 5.730 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D4 | up | 5.7 | 8.041 | 2.341 | 41.1 | control | écart > 20 % | 7.307 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D4 | to | 6.7 | 8.842 | 2.142 | 32.0 | control | écart > 20 % | 5.730 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D5 | up | — | 4.826 | — | — | missing | borne non publiée | 7.307 |
| Form | 4 | MK03Form-E 66-er | SMCO5-5X4 | E | D5 | to | 2.7 | 5.336 | 2.636 | 97.6 | control | écart > 20 % | 5.730 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D1 | up | 12.7 | 11.379 | -1.321 | -10.4 | training | — | 7.307 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D1 | to | 14.2 | 12.947 | -1.253 | -8.8 | training | — | 5.730 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D3 | up | 9.4 | 15.764 | 6.364 | 67.7 | control | écart > 20 % | 7.307 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D3 | to | 11.3 | 17.167 | 5.867 | 51.9 | control | écart > 20 % | 5.730 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D4 | up | 7.3 | 16.934 | 9.634 | 132.0 | control | écart > 20 % | 7.307 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D4 | to | 9.3 | 17.983 | 8.683 | 93.4 | control | écart > 20 % | 5.730 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D5 | up | 7.3 | 6.953 | -0.347 | -4.8 | control | — | 7.307 |
| Form | 5 | MK03Form-E 66-er | N45-4X19 | E | D5 | to | 8.6 | 7.787 | -0.813 | -9.5 | control | virgule décimale dans la source (« 8,6 ») | 5.730 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D1 | up | 4.65 | 6.960 | 2.310 | 49.7 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 5.110 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D1 | to | 7.95 | 10.181 | 2.232 | 28.1 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 3.479 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D3 | up | 6.7 | 6.444 | -0.256 | -3.8 | control | adaptation documentaire Form→produit (décalage empirique) | 5.110 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D3 | to | 9 | 8.218 | -0.782 | -8.7 | control | adaptation documentaire Form→produit (décalage empirique) | 3.479 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D4 | up | 4.15 | 6.588 | 2.438 | 58.8 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D4 | to | 7.75 | 9.719 | 1.969 | 25.4 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D5 | up | 2.4 | 4.787 | 2.387 | 99.4 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK03 | 4 | MK03-1A66C-X | SMCO5-5X4 | C | D5 | to | 4.2 | 5.686 | 1.486 | 35.4 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D1 | up | 12.35 | 11.061 | -1.289 | -10.4 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 5.110 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D1 | to | 16.75 | 15.467 | -1.283 | -7.7 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 3.479 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D3 | up | 11.6 | 17.077 | 5.477 | 47.2 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D3 | to | 16.9 | 19.707 | 2.807 | 16.6 | control | adaptation documentaire Form→produit (décalage empirique) | 3.479 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D4 | up | 7.45 | 15.863 | 8.413 | 112.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D4 | to | 11.55 | 19.518 | 7.968 | 69.0 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D5 | up | 9 | 7.401 | -1.599 | -17.8 | control | adaptation documentaire Form→produit (décalage empirique) | 5.110 |
| MK03 | 5 | MK03-1A66C-X | N45-4X19 | C | D5 | to | 11.6 | 8.899 | -2.701 | -23.3 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D1 | up | 3.25 | 5.681 | 2.432 | 74.8 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 7.307 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D1 | to | 5.95 | 8.236 | 2.287 | 38.4 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 5.730 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D3 | up | 4.8 | 4.988 | 0.188 | 3.9 | control | adaptation documentaire Form→produit (décalage empirique) | 7.307 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D3 | to | 6 | 5.958 | -0.042 | -0.7 | control | adaptation documentaire Form→produit (décalage empirique) | 5.730 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D4 | up | 3.05 | 5.391 | 2.341 | 76.8 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D4 | to | 5.75 | 7.892 | 2.142 | 37.3 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D5 | up | — | 4.026 | — | — | missing | borne non publiée ; adaptation documentaire Form→produit (décalage empirique) | 7.307 |
| MK03 | 4 | MK03-1A66E-X | SMCO5-5X4 | E | D5 | to | 1.9 | 4.536 | 2.636 | 138.7 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D1 | up | 10.05 | 8.729 | -1.321 | -13.1 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 7.307 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D1 | to | 13.25 | 11.997 | -1.253 | -9.5 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 5.730 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D3 | up | 8.6 | 14.964 | 6.364 | 74.0 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D3 | to | 10.5 | 16.367 | 5.867 | 55.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D4 | up | 4.65 | 14.284 | 9.634 | 207.2 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D4 | to | 8.35 | 17.033 | 8.683 | 104.0 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D5 | up | 6.5 | 6.153 | -0.347 | -5.3 | control | adaptation documentaire Form→produit (décalage empirique) | 7.307 |
| MK03 | 5 | MK03-1A66E-X | N45-4X19 | E | D5 | to | 7.8 | 6.987 | -0.813 | -10.4 | control | adaptation documentaire Form→produit (décalage empirique) | 5.730 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D1 | up | 2.8 | 5.110 | 2.310 | 82.5 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 5.110 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D1 | to | 5.85 | 8.082 | 2.232 | 38.1 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 3.479 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D3 | up | 4.1 | 3.844 | -0.256 | -6.2 | control | adaptation documentaire Form→produit (décalage empirique) | 5.110 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D3 | to | 8.2 | 7.418 | -0.782 | -9.5 | control | adaptation documentaire Form→produit (décalage empirique) | 3.479 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D4 | up | 2.3 | 4.739 | 2.438 | 106.0 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D4 | to | 5.65 | 7.619 | 1.969 | 34.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D5 | up | — | 2.187 | — | — | missing | borne non publiée ; adaptation documentaire Form→produit (décalage empirique) | 5.110 |
| MK13 | 24 | MK13-1A66C-X | SMCO5-5X4 | C | D5 | to | 3.4 | 4.886 | 1.486 | 43.7 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D1 | up | 10.5 | 9.211 | -1.289 | -12.3 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 5.110 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D1 | to | 14.65 | 13.367 | -1.283 | -8.8 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 3.479 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D3 | up | 9 | 14.477 | 5.477 | 60.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D3 | to | 16.1 | 18.907 | 2.807 | 17.4 | control | adaptation documentaire Form→produit (décalage empirique) | 3.479 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D4 | up | 5.6 | 14.013 | 8.413 | 150.2 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D4 | to | 9.45 | 17.418 | 7.968 | 84.3 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D5 | up | 6.4 | 4.801 | -1.599 | -25.0 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.110 |
| MK13 | 25 | MK13-1A66C-X | N45-4X19 | C | D5 | to | 10.8 | 8.098 | -2.701 | -25.0 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 3.479 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D1 | up | 1.4 | 3.832 | 2.432 | 173.7 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 7.307 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D1 | to | 3.85 | 6.136 | 2.287 | 59.4 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique ; écart > 20 % | 5.730 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D3 | up | 2.2 | 2.388 | 0.188 | 8.5 | control | adaptation documentaire Form→produit (décalage empirique) | 7.307 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D3 | to | 5.2 | 5.158 | -0.042 | -0.8 | control | adaptation documentaire Form→produit (décalage empirique) | 5.730 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D4 | up | 1.2 | 3.541 | 2.341 | 195.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D4 | to | 3.65 | 5.792 | 2.142 | 58.7 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D5 | up | — | 1.426 | — | — | missing | borne non publiée ; adaptation documentaire Form→produit (décalage empirique) | 7.307 |
| MK13 | 24 | MK13-1A66E-X | SMCO5-5X4 | E | D5 | to | 1.1 | 3.736 | 2.636 | 239.6 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D1 | up | 8.2 | 6.879 | -1.321 | -16.1 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 7.307 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D1 | to | 11.15 | 9.897 | -1.253 | -11.2 | control | adaptation documentaire Form→produit (décalage empirique) ; D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique | 5.730 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D3 | up | 6 | 12.364 | 6.364 | 106.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D3 | to | 9.7 | 15.567 | 5.867 | 60.5 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D4 | up | 2.8 | 12.434 | 9.634 | 344.1 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 7.307 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D4 | to | 6.25 | 14.933 | 8.683 | 138.9 | control | adaptation documentaire Form→produit (décalage empirique) ; écart > 20 % | 5.730 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D5 | up | 3.9 | 3.553 | -0.347 | -8.9 | control | adaptation documentaire Form→produit (décalage empirique) | 7.307 |
| MK13 | 25 | MK13-1A66E-X | N45-4X19 | E | D5 | to | 7 | 6.187 | -0.813 | -11.6 | control | adaptation documentaire Form→produit (décalage empirique) | 5.730 |
| MK04 | 12 | MK04-1A66C-X | SMCO5-5X4 | C | D3 | up | 6.4 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 5.110 |
| MK04 | 12 | MK04-1A66C-X | SMCO5-5X4 | C | D3 | to | 5.2 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 3.479 |
| MK04 | 13 | MK04-1A66C-X | N45-4X19 | C | D3 | up | 14.3 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 5.110 |
| MK04 | 13 | MK04-1A66C-X | N45-4X19 | C | D3 | to | 8.5 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 3.479 |
| MK04 | 12 | MK04-1A66E-X | SMCO5-5X4 | E | D3 | up | 3.4 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) | 7.307 |
| MK04 | 12 | MK04-1A66E-X | SMCO5-5X4 | E | D3 | to | 4.1 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) | 5.730 |
| MK04 | 13 | MK04-1A66E-X | N45-4X19 | E | D3 | up | 7.9 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 7.307 |
| MK04 | 13 | MK04-1A66E-X | N45-4X19 | E | D3 | to | 5.7 | — | — | — | quarantine | MK04 D3 en quarantaine (71/96 plages inversées) ; plage inversée up > to | 5.730 |

## Six coupes (générées par le noyau)

Grille 1 mm, x ∈ [−24, 24], y ∈ [0, 24] (centre de l'aimant, plan z = 0). Mêmes axes et échelle pour toutes les coupes ; coupe 5 directement comparable à la coupe 1.

### 1-parallel-C — SMCO5-5X4 — modèle A

![Axes parallèles — classe C](svg/1-parallel-C_SMCO5-5X4_A.svg)

Cellules : unfavorable/too_far 812, variable 213, favorable 79, unavailable 83, unfavorable/orientation 38.  Calcul : 197 ms.

### 2-perpendicular-centred-C — SMCO5-5X4 — modèle A

![Perpendiculaire centré — classe C](svg/2-perpendicular-centred-C_SMCO5-5X4_A.svg)

Cellules : unfavorable/too_far 804, unfavorable/orientation 48, variable 215, unavailable 74, favorable 84. Repère « centré » : Placement défavorable (orientation). Calcul : 204 ms.

### 3-perpendicular-offset-C — SMCO5-5X4 — modèle A

![Perpendiculaire décalé — classe C](svg/3-perpendicular-offset-C_SMCO5-5X4_A.svg)

Cellules : unfavorable/too_far 804, unfavorable/orientation 48, variable 215, unavailable 74, favorable 84. Repère « centré » : Placement défavorable (orientation). Repère « décalé +4 mm » : Placement favorable. Calcul : 205 ms.

### 4-oblique-45-C — SMCO5-5X4 — modèle A

![Orientation intermédiaire 45° — classe C](svg/4-oblique-45-C_SMCO5-5X4_A.svg)

Cellules : unfavorable/too_far 812, variable 215, favorable 68, unavailable 96, unfavorable/orientation 34.  Calcul : 191 ms.

### 5-parallel-E — SMCO5-5X4 — modèle A

![Axes parallèles — classe E](svg/5-parallel-E_SMCO5-5X4_A.svg)

Cellules : unfavorable/too_far 912, variable 152, favorable 52, unavailable 83, unfavorable/orientation 26.  Calcul : 189 ms.

### 6-path-C — SMCO5-5X4 — modèle A

![Trajet traversant les lobes — classe C](svg/6-path-C_SMCO5-5X4_A.svg)

Cellules : unfavorable/too_far 804, unfavorable/orientation 48, variable 215, unavailable 74, favorable 84.  Trajet y = 8.5 mm : [-20…-15] unfavorable, [-14.5…-8.5] variable, [-8…-4] favorable, [-3.5…-0.5] variable, [0…0] unfavorable, [0.5…3.5] variable, [4…8] favorable, [8.5…14.5] variable, [15…20] unfavorable. Calcul : 220 ms.

### 1-parallel-C — N45-4X19 — modèle A

![Axes parallèles — classe C](svg/1-parallel-C_N45-4X19_A.svg)

Cellules : favorable 292, unavailable 130, variable 342, unfavorable/orientation 206, unfavorable/too_far 255.  Calcul : 173 ms.

### 2-perpendicular-centred-C — N45-4X19 — modèle A

![Perpendiculaire centré — classe C](svg/2-perpendicular-centred-C_N45-4X19_A.svg)

Cellules : unfavorable/orientation 135, unfavorable/too_far 185, unavailable 202, variable 471, favorable 232. Repère « centré » : Détection variable. Calcul : 144 ms.

### 3-perpendicular-offset-C — N45-4X19 — modèle A

![Perpendiculaire décalé — classe C](svg/3-perpendicular-offset-C_N45-4X19_A.svg)

Cellules : unfavorable/orientation 135, unfavorable/too_far 185, unavailable 202, variable 471, favorable 232. Repère « centré » : Détection variable. Repère « décalé +4 mm » : Placement favorable. Calcul : 145 ms.

### 4-oblique-45-C — N45-4X19 — modèle A

![Orientation intermédiaire 45° — classe C](svg/4-oblique-45-C_N45-4X19_A.svg)

Cellules : variable 415, favorable 234, unavailable 201, unfavorable/orientation 173, unfavorable/too_far 202.  Calcul : 144 ms.

### 5-parallel-E — N45-4X19 — modèle A

![Axes parallèles — classe E](svg/5-parallel-E_N45-4X19_A.svg)

Cellules : variable 293, favorable 206, unavailable 130, unfavorable/orientation 164, unfavorable/too_far 432.  Calcul : 168 ms.

### 6-path-C — N45-4X19 — modèle A

![Trajet traversant les lobes — classe C](svg/6-path-C_N45-4X19_A.svg)

Cellules : unfavorable/orientation 135, unfavorable/too_far 185, unavailable 202, variable 471, favorable 232.  Trajet y = 16.5 mm : [-20…-13] variable, [-12.5…-3.5] favorable, [-3…3] variable, [3.5…12.5] favorable, [13…20] variable. Calcul : 153 ms.

### 1-parallel-C — SMCO5-5X4 — modèle B

![Axes parallèles — classe C](svg/1-parallel-C_SMCO5-5X4_B.svg)

Cellules : unfavorable/too_far 878, variable 173, favorable 27, unavailable 83, unfavorable/orientation 64.  Calcul : 172 ms.

### 2-perpendicular-centred-C — SMCO5-5X4 — modèle B

![Perpendiculaire centré — classe C](svg/2-perpendicular-centred-C_SMCO5-5X4_B.svg)

Cellules : unfavorable/too_far 888, unfavorable/orientation 65, unavailable 74, variable 162, favorable 36. Repère « centré » : Placement défavorable (orientation). Calcul : 174 ms.

### 3-perpendicular-offset-C — SMCO5-5X4 — modèle B

![Perpendiculaire décalé — classe C](svg/3-perpendicular-offset-C_SMCO5-5X4_B.svg)

Cellules : unfavorable/too_far 888, unfavorable/orientation 65, unavailable 74, variable 162, favorable 36. Repère « centré » : Placement défavorable (orientation). Repère « décalé +4 mm » : Détection variable. Calcul : 209 ms.

### 4-oblique-45-C — SMCO5-5X4 — modèle B

![Orientation intermédiaire 45° — classe C](svg/4-oblique-45-C_SMCO5-5X4_B.svg)

Cellules : unfavorable/too_far 890, variable 163, unavailable 96, favorable 28, unfavorable/orientation 48.  Calcul : 171 ms.

### 5-parallel-E — SMCO5-5X4 — modèle B

![Axes parallèles — classe E](svg/5-parallel-E_SMCO5-5X4_B.svg)

Cellules : unfavorable/too_far 974, variable 117, favorable 9, unavailable 83, unfavorable/orientation 42.  Calcul : 192 ms.

### 6-path-C — SMCO5-5X4 — modèle B

![Trajet traversant les lobes — classe C](svg/6-path-C_SMCO5-5X4_B.svg)

Cellules : unfavorable/too_far 888, unfavorable/orientation 65, unavailable 74, variable 162, favorable 36.  Trajet y = 8.5 mm : [-20…-12.5] unfavorable, [-12…-6.5] variable, [-6…-5] favorable, [-4.5…-2] variable, [-1.5…1.5] unfavorable, [2…4.5] variable, [5…6] favorable, [6.5…12] variable, [12.5…20] unfavorable. Calcul : 188 ms.

### 1-parallel-C — N45-4X19 — modèle B

![Axes parallèles — classe C](svg/1-parallel-C_N45-4X19_B.svg)

Cellules : variable 332, favorable 206, unavailable 130, unfavorable/orientation 244, unfavorable/too_far 313.  Calcul : 156 ms.

### 2-perpendicular-centred-C — N45-4X19 — modèle B

![Perpendiculaire centré — classe C](svg/2-perpendicular-centred-C_N45-4X19_B.svg)

Cellules : unfavorable/orientation 182, unfavorable/too_far 281, unavailable 202, variable 420, favorable 140. Repère « centré » : Placement défavorable (orientation). Calcul : 157 ms.

### 3-perpendicular-offset-C — N45-4X19 — modèle B

![Perpendiculaire décalé — classe C](svg/3-perpendicular-offset-C_N45-4X19_B.svg)

Cellules : unfavorable/orientation 182, unfavorable/too_far 281, unavailable 202, variable 420, favorable 140. Repère « centré » : Placement défavorable (orientation). Repère « décalé +5 mm » : Placement favorable. Calcul : 128 ms.

### 4-oblique-45-C — N45-4X19 — modèle B

![Orientation intermédiaire 45° — classe C](svg/4-oblique-45-C_N45-4X19_B.svg)

Cellules : variable 393, favorable 151, unavailable 201, unfavorable/orientation 220, unfavorable/too_far 260.  Calcul : 123 ms.

### 5-parallel-E — N45-4X19 — modèle B

![Axes parallèles — classe E](svg/5-parallel-E_N45-4X19_B.svg)

Cellules : variable 279, favorable 134, unavailable 130, unfavorable/orientation 174, unfavorable/too_far 508.  Calcul : 168 ms.

### 6-path-C — N45-4X19 — modèle B

![Trajet traversant les lobes — classe C](svg/6-path-C_N45-4X19_B.svg)

Cellules : unfavorable/orientation 182, unfavorable/too_far 281, unavailable 202, variable 420, favorable 140.  Trajet y = 16.5 mm : [-20…-19.5] unfavorable, [-19…-11] variable, [-10.5…-5] favorable, [-4.5…-2] variable, [-1.5…1.5] unfavorable, [2…4.5] variable, [5…10.5] favorable, [11…19] variable, [19.5…20] unfavorable. Calcul : 162 ms.

## Temps de calcul (machine de génération)

| Étape | Durée |
|---|---|
| Seuils partagés A/C1 | 341 ms |
| Tableau pilote A/C1 | 723 ms |
| Seuils partagés B/C1 | 326 ms |
| Tableau pilote B/C1 | 746 ms |
| Seuils partagés A/C2 | 398 ms |
| Tableau pilote A/C2 | 723 ms |
| Seuils partagés B/C2 | 350 ms |
| Tableau pilote B/C2 | 720 ms |
| Coupe 1-parallel-C SMCO5-5X4 A/C1 | 249 ms |
| Coupe 2-perpendicular-centred-C SMCO5-5X4 A/C1 | 250 ms |
| Coupe 3-perpendicular-offset-C SMCO5-5X4 A/C1 | 262 ms |
| Coupe 4-oblique-45-C SMCO5-5X4 A/C1 | 239 ms |
| Coupe 5-parallel-E SMCO5-5X4 A/C1 | 242 ms |
| Coupe 6-path-C SMCO5-5X4 A/C1 | 289 ms |
| Coupe 1-parallel-C N45-4X19 A/C1 | 222 ms |
| Coupe 2-perpendicular-centred-C N45-4X19 A/C1 | 186 ms |
| Coupe 3-perpendicular-offset-C N45-4X19 A/C1 | 188 ms |
| Coupe 4-oblique-45-C N45-4X19 A/C1 | 194 ms |
| Coupe 5-parallel-E N45-4X19 A/C1 | 206 ms |
| Coupe 6-path-C N45-4X19 A/C1 | 200 ms |
| Coupe 1-parallel-C SMCO5-5X4 B/C1 | 207 ms |
| Coupe 2-perpendicular-centred-C SMCO5-5X4 B/C1 | 221 ms |
| Coupe 3-perpendicular-offset-C SMCO5-5X4 B/C1 | 259 ms |
| Coupe 4-oblique-45-C SMCO5-5X4 B/C1 | 223 ms |
| Coupe 5-parallel-E SMCO5-5X4 B/C1 | 231 ms |
| Coupe 6-path-C SMCO5-5X4 B/C1 | 233 ms |
| Coupe 1-parallel-C N45-4X19 B/C1 | 195 ms |
| Coupe 2-perpendicular-centred-C N45-4X19 B/C1 | 197 ms |
| Coupe 3-perpendicular-offset-C N45-4X19 B/C1 | 167 ms |
| Coupe 4-oblique-45-C N45-4X19 B/C1 | 160 ms |
| Coupe 5-parallel-E N45-4X19 B/C1 | 213 ms |
| Coupe 6-path-C N45-4X19 B/C1 | 207 ms |

## Limites

- Datums D1/D3 ambigus dans la source ; D4/D5 sont des hypothèses géométriques nommées (H-D4, H-D5), non documentées par Standex.
- Longueur effective, enveloppe et réponse de lame sont des hypothèses ; aucun paramètre de lame n'est qualifié.
- Les produits MK03/MK13 sont estimés par adaptation documentaire (décalages empiriques par borne) ; D1 produit n'est donc pas un contrôle indépendant.
- MK04 D3 en quarantaine : aucune estimation n'est produite.
- Pas de volume 3D dans ce lot. Pas d'intégration atelier ni client.
