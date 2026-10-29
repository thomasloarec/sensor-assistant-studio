# Candidat C — contre-vérification du 29 octobre 2026

Étude isolée à la demande de Thomas, après la proposition transmise de Claude. Le client et le site publié conservent A. Le fichier Markdown joint (3) ne contenait pas encore la proposition C ; celle-ci provient du message copié.

## Résultat

C conserve les portées de A et produit un pincement. Le remplacement n’est cependant pas présenté comme une reproduction du contour rouge : dans le montage MK04/M04 étudié, la différence accessible est faible.

| Mesure | Résultat |
|---|---:|
| Repère axial ré-ancré C, C/SmCo/D3-up | 8,903167725 mm |
| Plus grand écart C − A, D1/D3/D4/D5 | < 0,0001 mm |
| Contrôles primaires B–E dans tolérance | 43/45 |
| Biais D3 primaire | −1,133718 mm |
| Critère primaire complet | Non satisfait, comme A |
| Contrôle D4/D5 classe C, pas 0,25 mm et quadrature 24/lame | Écart nul à la tolérance 0,0001 mm sur 8 bornes |

L = 15,63399603080886 mm, k = 0,13560548808516593 mT/AT et retrait documentaire D4 = 1,4912902832031252 mm restent figés. Aucun facteur par aimant. Les deux suspicions de recopie restent comptées. Le recalage utilise une seule borne documentaire ; le repère ne déplace jamais la géométrie.

## Largeur : les prédictions annoncées ne sont pas toutes confirmées

Classe C, seuil 15 AT, demi-largeur du lobe central en millimètres :

| Aimant | z du centre | A | C |
|---|---:|---:|---:|
| SmCo5 | 3,6 | 7,72 | 0,61 |
| SmCo5 | 5,5 | 7,48 | 1,37 |
| SmCo5 | 0,5 × hauteur centrale D1 | 7,39 | 1,56 |
| SmCo5 | 0,75 × hauteur centrale D1 | 6,05 | 3,23 |
| N45 | 3,6 | 10,29 | 5,98 |
| N45 | 5,5 | 10,35 | 6,29 |
| N45 | 0,5 × hauteur centrale D1 | 10,22 | 7,67 |
| N45 | 0,75 × hauteur centrale D1 | 8,65 | 8,65 |

Hauteur centrale D1 = portée brute D1 + rayon de l’aimant. Il s’agit de positions du centre magnétique ; une partie n’est pas accessible avec un boîtier.

À la profondeur perpendiculaire de la comparaison précédente, la demi-bande sous seuil passe de 2,946 à 3,908 mm (SmCo), et de 3,159 à 3,908 mm (N45). C introduit une bande exactement nulle de cette même largeur, là où A ne possédait qu’une annulation centrale.

## Le montage MK04/M04 compte autant que le choix de réponse

Le catalogue utilise MK04 = 23 × 5,9 × 13,9 mm et M04 aux mêmes dimensions. Dans la coupe y = 0 de l’atelier, l’approche est selon z : la dimension pertinente du MK04 est donc 13,9 mm. Les 5–5,5 mm de premier centre accessible proposés par Claude ne correspondent pas à ce montage.

Les coupes additionnelles utilisent les enveloppes complètes du catalogue, pas seulement le verre. Sur la grille 0,25 mm, le premier z accessible central est 9,5 mm (SmCo), 9 mm (N45) et 14 mm (M04). Avec C, la demi-largeur accessible passe :

- SmCo : 3,5 mm au premier point accessible → maximum 4,25 mm ;
- N45 : 7,25 → 9,25 mm ;
- M04 : 6,75 → 7,25 mm.

Ces mesures sur grille sont indicatives à 0,25 mm. M04 reste une source magnétique cylindrique équivalente hypothétique dans son enveloppe réelle de catalogue. Aucun recalage sur la silhouette souhaitée n’est appliqué.

## Porte de signe et epsilon

La réponse stricte est `M1*M2 > 0 ? abs((M1+M2)/2) : 0`. L’invariant B ≤ C ≤ A est respecté sur toutes les cellules valides des six coupes (deux pilotes + M04, parallèle/perpendiculaire).

La porte est discontinue : avec M2 = 10 mT, passer M1 de 0 à 10⁻⁸ mT fait passer C de 0 à environ 5 mT. Ce saut n’est pas du bruit de calcul. M1 et M2 sont des moyennes du champ libre, pas une mesure de l’aimantation des lames ni de la force à l’entrefer. La lecture physique de Claude reste donc une hypothèse de modèle.

La variante à 1 % n’altère pas les maxima documentaires testés, mais change 36 cellules d’activation sur les six coupes à pas 0,25 mm et élargit légèrement les bandes centrales. Elle constitue un paramètre supplémentaire. Proposition : ne pas l’ajouter automatiquement ; traiter le calcul de la frontière de signe explicitement si C est intégré.

## Recommandation à Claude

La condition ciblée est satisfaite sur les pilotes : D4/D5 conservés et taille visible. C est donc un candidat sérieux, sans réintroduire le warp. Mais la figure MK04/M04 doit être acceptée pour ce qu’elle montre : une amélioration faible dans la partie mécaniquement accessible, et des épaules plus anguleuses au raccord entre frontière de signe et seuil d’amplitude. Ne pas promettre une forme exacte ou un col fortement marqué dans tous les boîtiers.

Avant remplacement de A : revue de ces coupes et de ce raccord discontinu. Si C est retenu, partager la même réponse par point, coupe, volume, chronologie et contact ; garder les paramètres, les exclusions et la simplicité de l’interface. Aucun nouvel essai de déformation graphique n’est proposé.

## Reproduction

Depuis la racine du dépôt :

```sh
bun scripts/detection-c-study.ts ../detection-c-20261029
python scripts/render-c-study.py ../detection-c-20261029
```

Le générateur attend le dossier de ré-ancrage précédent `../detection-reanchor-20261029/results.json` pour reprendre les mêmes lignes, statuts et seuils. Le dossier de revue livré inclut cette référence dans `results.json`, les six grilles brutes, les contrôles CSV, les largeurs, les bandes centrales et les contrôles de convergence. Le client ne dépend d’aucun module de cette étude.

Vérifications logicielles : 2 119 tests réussis, 0 échec sur 142 fichiers ; TypeScript et build de production réussis. Quatre tests supplémentaires couvrent les invariants de C, sa discontinuité et la variante à 1 %, les exclusions et la bande centrale, ainsi que la convergence de D4/D5. Le modèle client reste explicitement A dans le test de non-régression.

Références qualitatives : [Standex — Magnet Interaction](https://standexdetect.com/resources/reed-technology-academy/magnet-interaction/) et [Reed Switch Operational Characteristics](https://standexdetect.com/resources/reed-technology-academy/reed-switch-characteristics/reed-switch-operational-characteristics/). Elles documentent l’interaction et la polarisation attractive, sans valider la formule C ni les dimensions proposées.
