# Laboratoire de détection reed — passe 3 : repère recalé et correction scalaire D4

Généré par `bun scripts/detection-lab-pass3-report.ts` le 2026-10-27. Préversion interne staff. **Validation rétrospective : les ancres ont été choisies après lecture des données — ce n'est pas un test indépendant nouveau. Paramètres ajustés, pas des dimensions prouvées.**

## Proposition testée et provenance

- Proposition reçue : modèle B, L = 16 mm ou L ajusté D1 (lot 2), k issu de fitK D1 C/E, repère axial D3/D5 ajusté sur UNE borne Form C — SmCo — D3 — up (publié 7,5 mm).
- Critère révisé, explicite : par borne |erreur| ≤ max(1 mm, 15 % du publié) ; ≥ 90 % des contrôles ; biais signé par approche (moyen ET médian) ≤ 1 mm. Résultats séparés CE / BD et groupés.
- Diagnostic alternatif : correction SCALAIRE D4 ajustée sur l'unique borne C — SmCo — D4 — up (seconde ancre, choisie après lecture des données). Retrait scalaire dans le tableau : ce n'est PAS un repère de face commun D1/D4 ni une transformation 3D ; changer un repère documentaire ne déplace ni l'aimant ni la réponse dans le monde.
- Diagnostic B′ = √(|M1·M2|) (mêmes signes, sinon 0) sur D4 seul, L/k/repère inchangés : strictement calculé sur les moyennes renvoyées par `evaluatePose`, aucun second calcul de champ, aucune activation dans l'interface. B′ ≥ B point par point : à seuils égaux, B′ ne peut pas raccourcir D4.
- Transcription Form : `src/data/detection-lab/brochure-form-rows.json` (SHA256 `7131f8c90c119969273d7b3aa92cd853f116c0b20e9fca678765be393f185802`), inchangée, aucune correction des données brutes.
- Classes AT : MK04 Series Datasheet — glossary « Magnetic Sensitivity », page 2, version 02 (28 Feb 2019) — https://standexdetect.com/wp-content/uploads/sites/2/2025/09/datasheet-reed-sensor-series-mk04.pdf (vérifiée le 2026-10-27).
- Physique inchangée : `evaluatePose` reste l'unique entrée physique ; le profil 1.1 et les modules du lot 2 (API comprises) sont intacts.

## Ajustements (ancres exclues du contrôle)

| Variante | L (mm) | k (mT/AT) | repère axial (mm) | résidu ancre D3 (mm) | retrait D4 δ (mm) |
|---|---|---|---|---|---|
| L16-axial | 16.000000 | 0.1336655629 | 3.345870 | -0.0000 | — |
| L16-bprime | 16.000000 | 0.1336655629 | 3.345870 | -0.0000 | — |
| L16-d4corr | 16.000000 | 0.1336655629 | 3.345870 | -0.0000 | 1.466510 |
| Lfit-axial | 15.633996 | 0.1356054881 | 3.334092 | -0.0000 | — |
| Lfit-bprime | 15.633996 | 0.1356054881 | 3.334092 | -0.0000 | — |
| Lfit-d4corr | 15.633996 | 0.1356054881 | 3.334092 | -0.0000 | 1.491290 |

Le repère axial est ajusté sur la seule ancre C-SMCO5-5X4-D3-up (publié 7.50 mm) ; la correction D4 sur la seule ancre C-SMCO5-5X4-D4-up (publié 6.80 mm). Ces bornes sont EXCLUES des contrôles : 46 contrôles pour les variantes axial/bprime, 45 pour d4corr.

## Scores — critère révisé

Contrôles = bornes publiées des classes B, C, D, E, approches D3/D4/D5, deux aimants, ancres exclues. D1 exclu (apprentissage C/E ; B/D D1 resté un contrôle isolé du lot 2).

| Variante | groupe | réussies | indisponibles | taux | médiane \|écart\| (mm) | max \|écart\| (mm) | critère |
|---|---|---|---|---|---|---|---|
| L16-axial — CE | 19/22 | 0 | 86.4 % | 0.672 | 3.228 | NON ATTEINT |
| L16-axial — BD | 21/24 | 0 | 87.5 % | 0.723 | 2.828 | NON ATTEINT |
| L16-axial — groupé | 40/46 | 0 | 87.0 % | 0.678 | 3.228 | NON ATTEINT |
| L16-bprime — CE | 19/22 | 0 | 86.4 % | 0.720 | 3.228 | NON ATTEINT |
| L16-bprime — BD | 18/24 | 0 | 75.0 % | 0.723 | 2.828 | NON ATTEINT |
| L16-bprime — groupé | 37/46 | 0 | 80.4 % | 0.720 | 3.228 | NON ATTEINT |
| L16-d4corr — CE | 20/21 | 0 | 95.2 % | 0.465 | 3.228 | ATTEINT |
| L16-d4corr — BD | 23/24 | 0 | 95.8 % | 0.400 | 2.828 | ATTEINT |
| L16-d4corr — groupé | 43/45 | 0 | 95.6 % | 0.423 | 3.228 | ATTEINT |
| Lfit-axial — CE | 19/22 | 0 | 86.4 % | 0.688 | 3.272 | NON ATTEINT |
| Lfit-axial — BD | 20/24 | 0 | 83.3 % | 0.747 | 2.872 | NON ATTEINT |
| Lfit-axial — groupé | 39/46 | 0 | 84.8 % | 0.708 | 3.272 | NON ATTEINT |
| Lfit-bprime — CE | 19/22 | 0 | 86.4 % | 0.734 | 3.272 | NON ATTEINT |
| Lfit-bprime — BD | 19/24 | 0 | 79.2 % | 0.747 | 2.872 | NON ATTEINT |
| Lfit-bprime — groupé | 38/46 | 0 | 82.6 % | 0.734 | 3.272 | NON ATTEINT |
| Lfit-d4corr — CE | 20/21 | 0 | 95.2 % | 0.481 | 3.272 | ATTEINT |
| Lfit-d4corr — BD | 23/24 | 0 | 95.8 % | 0.408 | 2.872 | ATTEINT |
| Lfit-d4corr — groupé | 43/45 | 0 | 95.6 % | 0.419 | 3.272 | ATTEINT |

Biais signés par approche (contrôles groupés) :

| Variante | approche | n | biais moyen (mm) | biais médian (mm) |
|---|---|---|---|---|
| L16-axial | D3 | 15 | -0.858 | -0.581 |
| L16-axial | D4 | 16 | 1.190 | 1.154 |
| L16-axial | D5 | 15 | -0.420 | -0.403 |
| L16-bprime | D3 | 15 | -0.858 | -0.581 |
| L16-bprime | D4 | 16 | 1.318 | 1.294 |
| L16-bprime | D5 | 15 | -0.420 | -0.403 |
| L16-d4corr | D3 | 15 | -0.858 | -0.581 |
| L16-d4corr | D4 | 15 | -0.295 | -0.400 |
| L16-d4corr | D5 | 15 | -0.420 | -0.403 |
| Lfit-axial | D3 | 15 | -0.878 | -0.605 |
| Lfit-axial | D4 | 16 | 1.183 | 1.156 |
| Lfit-axial | D5 | 15 | -0.424 | -0.417 |
| Lfit-bprime | D3 | 15 | -0.878 | -0.605 |
| Lfit-bprime | D4 | 16 | 1.302 | 1.286 |
| Lfit-bprime | D5 | 15 | -0.424 | -0.417 |
| Lfit-d4corr | D3 | 15 | -0.878 | -0.605 |
| Lfit-d4corr | D4 | 15 | -0.329 | -0.400 |
| Lfit-d4corr | D5 | 15 | -0.424 | -0.417 |

Échecs conservés (L16-axial) — aucune exclusion supplémentaire :

- B — SMCO5-5X4 — D4 up : publié 8.3 mm, estimé 9.701 mm, écart 1.401 mm.
- B — SMCO5-5X4 — D4 to : publié 10.2 mm, estimé 11.896 mm, écart 1.696 mm.
- B — N45-4X19 — D3 up : publié 17.3 mm, estimé 14.472 mm, écart -2.828 mm.
- C — SMCO5-5X4 — D4 up : publié 6.8 mm, estimé 8.267 mm, écart 1.466 mm.
- C — N45-4X19 — D3 to : publié 17.7 mm, estimé 14.472 mm, écart -3.228 mm.
- E — N45-4X19 — D4 up : publié 7.3 mm, estimé 9.077 mm, écart 1.777 mm.

Échecs conservés (L16-bprime) — aucune exclusion supplémentaire :

- B — SMCO5-5X4 — D4 up : publié 8.3 mm, estimé 9.836 mm, écart 1.536 mm.
- B — SMCO5-5X4 — D4 to : publié 10.2 mm, estimé 11.989 mm, écart 1.789 mm.
- B — N45-4X19 — D3 up : publié 17.3 mm, estimé 14.472 mm, écart -2.828 mm.
- C — SMCO5-5X4 — D4 up : publié 6.8 mm, estimé 8.441 mm, écart 1.641 mm.
- C — N45-4X19 — D3 to : publié 17.7 mm, estimé 14.472 mm, écart -3.228 mm.
- D — SMCO5-5X4 — D4 up : publié 6.3 mm, estimé 7.425 mm, écart 1.125 mm.
- D — SMCO5-5X4 — D4 to : publié 7.2 mm, estimé 8.441 mm, écart 1.241 mm.
- D — N45-4X19 — D4 up : publié 8.9 mm, estimé 10.246 mm, écart 1.346 mm.
- E — N45-4X19 — D4 up : publié 7.3 mm, estimé 9.207 mm, écart 1.907 mm.

Échecs conservés (L16-d4corr) — aucune exclusion supplémentaire :

- B — N45-4X19 — D3 up : publié 17.3 mm, estimé 14.472 mm, écart -2.828 mm.
- C — N45-4X19 — D3 to : publié 17.7 mm, estimé 14.472 mm, écart -3.228 mm.

Échecs conservés (Lfit-axial) — aucune exclusion supplémentaire :

- B — SMCO5-5X4 — D4 up : publié 8.3 mm, estimé 9.710 mm, écart 1.411 mm.
- B — SMCO5-5X4 — D4 to : publié 10.2 mm, estimé 11.885 mm, écart 1.685 mm.
- B — N45-4X19 — D3 up : publié 17.3 mm, estimé 14.428 mm, écart -2.872 mm.
- C — SMCO5-5X4 — D4 up : publié 6.8 mm, estimé 8.291 mm, écart 1.491 mm.
- C — N45-4X19 — D3 to : publié 17.7 mm, estimé 14.428 mm, écart -3.272 mm.
- D — SMCO5-5X4 — D4 to : publié 7.2 mm, estimé 8.291 mm, écart 1.091 mm.
- E — N45-4X19 — D4 up : publié 7.3 mm, estimé 9.066 mm, écart 1.766 mm.

Échecs conservés (Lfit-bprime) — aucune exclusion supplémentaire :

- B — SMCO5-5X4 — D4 up : publié 8.3 mm, estimé 9.835 mm, écart 1.535 mm.
- B — SMCO5-5X4 — D4 to : publié 10.2 mm, estimé 11.971 mm, écart 1.771 mm.
- B — N45-4X19 — D3 up : publié 17.3 mm, estimé 14.428 mm, écart -2.872 mm.
- C — SMCO5-5X4 — D4 up : publié 6.8 mm, estimé 8.453 mm, écart 1.653 mm.
- C — N45-4X19 — D3 to : publié 17.7 mm, estimé 14.428 mm, écart -3.272 mm.
- D — SMCO5-5X4 — D4 up : publié 6.3 mm, estimé 7.447 mm, écart 1.147 mm.
- D — SMCO5-5X4 — D4 to : publié 7.2 mm, estimé 8.453 mm, écart 1.253 mm.
- E — N45-4X19 — D4 up : publié 7.3 mm, estimé 9.188 mm, écart 1.887 mm.

Échecs conservés (Lfit-d4corr) — aucune exclusion supplémentaire :

- B — N45-4X19 — D3 up : publié 17.3 mm, estimé 14.428 mm, écart -2.872 mm.
- C — N45-4X19 — D3 to : publié 17.7 mm, estimé 14.428 mm, écart -3.272 mm.

## Classes A et F (hors critère) et classe G

A/F ne font pas partie du critère (classes hors apprentissage et hors contrôle principal) ; résumé séparé, toutes approches :

| Variante | réussies | indisponibles | taux | médiane \|écart\| (mm) |
|---|---|---|---|---|--|
| L16-axial | 18/30 | 1 | 60.0 % | 0.803 |
| L16-bprime | 18/30 | 1 | 60.0 % | 0.852 |
| L16-d4corr | 20/30 | 1 | 66.7 % | 0.775 |
| Lfit-axial | 18/30 | 1 | 60.0 % | 0.810 |
| Lfit-bprime | 17/30 | 1 | 56.7 % | 0.865 |
| Lfit-d4corr | 20/30 | 1 | 66.7 % | 0.740 |

**G est absente de la source** : lignes « no_source », jamais validées. Les 112 lignes de chaque CSV incluent G et les 8 bornes d'apprentissage : ce ne sont PAS 112 contrôles indépendants.

## Figures

`svg/ecarts_signes_L16-d4corr.svg` et `svg/ecarts_signes_Lfit-d4corr.svg` : écarts signés (estimation − publié) des contrôles, couleur par aimant, rouge hors tolérance. La bande ±1 mm n'est qu'un repère visuel : la tolérance réelle est max(1 mm, 15 % du publié).

## Statut et limites

- Statut des tables : **« accord brochure calibré B–E sur 2 aimants sous critère révisé »**. Le critère tolère 15 % d'écart et 10 % d'échecs ; 4 maxima de distance ne valident ni une forme volumique ni des rotations intermédiaires. Statuts « 3D validé » et « ±1 mm » INTERDITS. Le modèle 3D reste pédagogique, non qualifié.
- Estimation brute physique, estimation documentaire corrigée et erreur sont des colonnes distinctes des CSV ; aucune valeur corrigée n'est déversée dans le moteur (`evaluatePose`, profil 1.1 et lot 2 inchangés).
- Validation rétrospective sur données déjà inspectées ; toute confirmation exigerait des données non utilisées pour le choix des ancres.
- Les deux échecs N45 D3 (B-up 17,3 mm, C-to 17,7 mm — ce dernier déjà suspecté au lot 2, jamais corrigé) sont conservés et comptés.
- Expérience interne bornée : pas d'UI, pas de volume 3D, pas de publication, pas de branchement atelier/client.

## Temps de calcul (machine de génération)

| Étape | Durée |
|---|---|
| Ajustement de L (accord inter-aimants D1, lot 2) | 27 ms |
| Variante L16-axial (fit k, repère, tableau 112, scores) | 3120 ms |
| Variante L16-bprime (fit k, repère, tableau 112, scores) | 2920 ms |
| Variante L16-d4corr (fit k, repère, tableau 112, scores) | 3165 ms |
| Variante Lfit-axial (fit k, repère, tableau 112, scores) | 3294 ms |
| Variante Lfit-bprime (fit k, repère, tableau 112, scores) | 3142 ms |
| Variante Lfit-d4corr (fit k, repère, tableau 112, scores) | 2884 ms |
