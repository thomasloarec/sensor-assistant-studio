# Correction de la coupure des lobes D2

## Cause reproduite

MK06 taille 6 + HF3225-14.95X10X5, classe B, aimant parallèle : le volume affiché
était limité à ±24 mm. Le calcul C1% reste activable au-delà de cette limite :
par exemple aux centres (±26, 4, 0) et (±30, 4, 0) mm dans le repère du reed.
Le maillage s’arrêtait donc au bord de sa boîte, avant la fermeture de D2.
Cette limite d’affichage n’était pas une frontière physique de détection.

## Correction

`catalogueSamplingAxes` examine les six faces de la grille avec les mêmes
échantillons, réponse C1% et seuil extérieur que le volume. Un axe dont une face
reste active est étendu par pas de 8 mm, puis les six faces sont réexaminées.
L’examen se fait avant masquage mécanique, pour qu’un obstacle ne cache pas une
continuation du lobe. Seuls les axes nécessaires grandissent. La limite physique
de 60 mm depuis le reed demeure ; un volume atteignant cette limite reste signalé
comme tronqué. C’est une vérification à la résolution de la grille, pas une preuve
mathématique de l’absence de tout détail entre les échantillons.

Pour ce couple en B, la grille devient X ±40, Y ±24, Z ±32 mm ; la surface jaune
se referme entre x = 33 et 35 mm. Le volume n’est plus tronqué. Les coordonnées
sont celles du centre magnétique dans le modèle, pas une portée fabricant.

Le point, le circuit et la chronologie utilisaient déjà la réponse complète :
aucun seuil ne doit être abaissé pour remplir la partie manquante. Les tests
vérifient explicitement que les points nouvellement visibles activent la lampe,
que l’extérieur reste ouvert et que les collisions restent indisponibles.
La coupe adapte ses quatre bords dans son propre plan, sans calculer les faces
du volume 3D ; un recadrage demandé explicitement par
un outil d’audit reste inchangé. Le numéro de profil catalogue passe à 4.2.1 pour
invalider les volumes préparés, sans changer la calibration ni la réponse C1%.

## Recette

- Reproduction sur MK06-6 / HF3225, classes B, C et E et orientation à 90°.
- Aucun échantillon actif sur les faces de la nouvelle grille en B.
- Aucune arête ouverte de la surface reconstruite dans la partie D2 ajoutée.
- Accord point / volume / coupe / chronologie / lampe aux points au-delà de 24 mm.
- Collision, extérieur OFF, zone morte perpendiculaire et recadrages d’audit conservés.
- Tests : `tests/catalogue-d2-boundary.test.ts`.

L’arrondi provient du modèle existant ; il n’est pas redessiné pour imposer un
cercle exact à tous les aimants. Aucune distance publiée ni donnée AT n’est modifiée.
