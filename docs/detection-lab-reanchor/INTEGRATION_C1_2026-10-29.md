# Intégration C1 % — 29 octobre 2026

## Décision appliquée

Le client utilise `form66-lfit-c-eps01@1.0.0`, enveloppé par `catalogue-c1-analogy-4.0.0`.
La réponse vaut `abs((M1+M2)/2)` si M1 et M2 ont le même signe et si chacune des deux amplitudes est supérieure à 1 % de cette réponse ; zéro sinon. Une seule fonction pure sert l'étude et le moteur catalogue. Les audits historiques A/B restent reproductibles.

L = 15,63399603080886 mm ; k = 0,13560548808516593 mT/AT ; repère axial documentaire = 8,903153027386512 mm ; retrait D4 dans les tableaux = 1,4912902832031252 mm. Aucun nouvel ajustement de distance. Les offsets documentaires ne déplacent ni les géométries ni les champs. La classe A conserve seulement sa borne prudente documentée, G reste indisponible.

L'étude C précédente conserve 43/45 contrôles sous la tolérance combinée, avec variation A/C1 des distances D1/D3/D4/D5 inférieure à 0,0001 mm. Le biais moyen D3 d'environ −1,134 mm reste supérieur au critère de 1 mm : la mention de qualification reste fausse. Les deux recopies soupçonnées demeurent comptées. La bande de 1 % est une hypothèse explicite, pas simplement une erreur d'arrondi ni une mesure de force aux pôles.

## Rectification de la face d'approche

Le catalogue MK04 a une enveloppe locale X×Y×Z de 23×5,9×13,9 mm. Les figures antérieures utilisaient XZ, normale Z, donc la tranche de 13,9 mm. La face plate 23×13,9 a pour normale Y ; le plan de comparaison demandé est XY à z=0.

Avec les enveloppes complètes utilisées par le logiciel, en orientation parallèle :

| Aimant | Centre minimum par la face plate (Y) | Centre minimum par la tranche (Z) |
| --- | ---: | ---: |
| SmCo Ø5×4 | 5,45 mm | 9,45 mm |
| N45 Ø4×19 | 4,95 mm | 8,95 mm |
| M04 | 5,90 mm | 13,90 mm |

Ces valeurs sont des limites géométriques de l'enveloppe, pas des distances d'activation. Elles supposent les axes et centres internes actuellement estimés. L'affirmation « M04 ne descend jamais sous 14 mm » n'est donc pas générale : elle correspond à la tranche. Face plate contre face plate, le modèle permet un pincement visible, même pour M04. Le champ équivalent et le centre interne de ce dernier restent approximatifs.

## Figures recalculées

`scripts/detection-flat-face.ts` échantillonne les deux orientations des trois aimants, classe C, au pas de 0,25 mm, plan XY, avec les corps complets et une quadrature de 24 points. `scripts/render-flat-face.py` produit la comparaison A/C1, les figures et les valeurs brutes. Le gris représente les positions de centre incompatibles avec les enveloppes.

Mesures discrètes de la demi-largeur de la zone centrale possible (borne la plus sensible), sans interpolation sous le pas de grille :

| Aimant | Premier centre accessible sur grille | Demi-largeur A | Demi-largeur C1 | Demi-largeur maximale C1 | Hauteur de ce maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| SmCo | 5,50 mm | 7,25 mm | 1,25 mm | 4,00 mm | 10,25 mm |
| N45 | 5,00 mm | 10,25 mm | 6,00 mm | 9,00 mm | 13,25 mm |
| M04 | 6,00 mm | 8,25 mm | 2,25 mm | 7,25 mm | 14,50 mm |

Il s'agit de coupes du modèle, pas de largeurs mesurées chez Standex. Le contour officiel reste une référence qualitative. Aucun contour rouge ni déformation de rendu n'entre dans le calcul.

## Atelier

- Point, volumes, coupe, chronologie et lampe utilisent la même réponse C1 et les mêmes seuils.
- La coupe catalogue est XY à z=0, en pause comme pendant la lecture. Les anciennes coupes staff restent au plan de l'instant.
- Les poses et mouvements du montage restent inchangés ; les préréglages actuels peuvent donc déplacer l'aimant hors de ce plan. Dans ce cas, la coupe porte « Aimant hors du plan de coupe » et ne projette pas son marqueur dans une fausse zone d'activation. Le circuit suit toujours la pose 3D réelle.
- La scène 3D et les corps réels ne sont pas remplacés par les figures de comparaison. Les enveloppes de collision restent complètes. Aucun réglage ajouté à la sidebar.
- Le circuit et les commandes disposent de leur propre espace dans la vue en coupe ; les légendes sont traduites dans les huit langues.

## Vérification

Tests spécifiques : réponse C1 partagée sur familles/aimants/poses/scénarios ; cohérence point-volume-coupe-chronologie-circuit ; clearance face plate SmCo/M04 ; absence de marqueur projeté hors plan ; conservation des coupes staff. Vérifications visuelles sur l'atelier local : fermeture en approche parallèle, ouverture au centre après rotation de 90°, lecture avec zones et coupe, légendes sur écran étroit.

Cette intégration est livrée dans une branche de revue. Elle ne publie pas le site et n'engage aucune consommation Lovable.

Résultats de recette : 2 122 tests passent, zéro échec (143 fichiers) ; typecheck et build de production réussis ; 3 941 entrées i18n, sept traductions complètes en plus du français. Les scans de charte ne trouvent aucun nouvel écart ; seuls subsistent les occurrences préexistantes de la balise theme-color, du rendu Three.js des connecteurs et des primitives shadcn non migrées. Aucun message d'erreur dans la console de l'aperçu contrôlé.
