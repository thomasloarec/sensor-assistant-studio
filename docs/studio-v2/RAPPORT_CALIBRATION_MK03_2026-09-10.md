# Rapport de calibration MK03 — 10 septembre 2026

**État : calibration physique non activée, données d'entrée insuffisantes.** Ce n'est pas un ajustement raté : aucun ajustement des produits réels n'a été lancé avec une géométrie supposée. Les huit couples typiques sont conservés pour la comparaison documentaire.

Packaged-Magnets.pdf (V03, 18 juin 2026) donne pour M02 une enveloppe de 32,4 × 16,7 × 10 mm, le matériau AlNiCo et un moment magnétique typique. Il ne source pas la rémanence Br ni la géométrie active. L'enveloppe ne peut pas être assimilée à un bloc uniformément aimanté. Source PDF contrôlée : SHA-256 d8b5ddca757cea7a7ccdf00aeceb8c2359454cb31eb32fe61f3aaba862fb0eea.

| Classe | Approche | Enclenchement publié mm | Relâchement publié mm | Prédiction physique | Écart de validation |
|---|---|---:|---:|---|---|
| B | D1 | 15 | 17.5 | Non calculée | Non calculable |
| C | D1 | 13 | 16.5 | Non calculée | Non calculable |
| D | D1 | 11 | 14.5 | Non calculée | Non calculable |
| E | D1 | 10 | 13.5 | Non calculée | Non calculable |
| B | D3 | 9.3 | 11.4 | Non calculée | Non calculable |
| C | D3 | 7.4 | 9.9 | Non calculée | Non calculable |
| D | D3 | 5.7 | 8.5 | Non calculée | Non calculable |
| E | D3 | 4.5 | 8 | Non calculée | Non calculable |

Source : https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/ ; contrôle croisé Activate-Distance-Guide-for-Reed-Sensors.pdf, page 2 (87 imprimé). Température des mesures : non publiée. Une convention de 20 °C dans un CSV ne transforme pas cette température en mesure.

## Trois hypothèses à lever, sans leur attribuer de probabilité

1. La géométrie active et l'aimantation internes de M02 diffèrent de son enveloppe hors tout : demande A.
2. Les dessins D1/D3 ne déterminent pas les poses 3D et les faces de mesure avec assez de précision : demande B.
3. Le datum et le centre magnétique du MK03 sont inconnus : demande C. Une nouvelle campagne indépendante (D) départagera les modèles.

## Validation croisée corrigée

Figer un centre ajusté sur D1 et D3 avant de retenir D3 réutiliserait la cible dans l'ajustement. La version livrée exclut la classe cible de l'ajustement du centre, utilise les autres classes, ancre son seuil sur l'autre approche, puis prédit la mesure retenue. L'opération est répétée dans les deux sens, à l'enclenchement et au relâchement. Avec un centre réellement mesuré, l'ajustement n'est pas nécessaire. Les tests synthétiques retrouvent le centre connu et détectent une perturbation des données ; cela valide le mécanisme, pas le produit Standex.

Seuils provisoires conservés : erreur maximale 15 %, moyenne 8 %, écart entre centres 1,5 mm. Leur approbation relève de la demande O. Aucun taux de fiabilité terrain n'en est déduit.

## Domaine livré

Prisme : champ vectoriel analytique externe, invariants et quadrature indépendante vérifiés. Cylindre et anneau : axe uniquement. Hors axe et aimantation diamétrale cylindrique refusés : une différence sur l'axe ne borne pas une erreur hors axe, et une aimantation diamétrale n'est pas un cylindre axial simplement tourné.

Couverture commerciale : 21 références visibles ; une famille avec distances typiques publiées, quatre classes, deux approches ; zéro famille physiquement calibrée. Les dimensions hors tout et le mode pédagogique existants restent utilisables. Le registre physique est intentionnellement vide.
