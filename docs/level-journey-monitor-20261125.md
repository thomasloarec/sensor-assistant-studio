# Parcours niveau — moniteur, dimensions et géométries

Vérification du 25 novembre 2026, après les retours de Thomas. Base : `5b917e12`. Cette passe concerne l’aperçu niveau, sans modification du moteur de proximité ni de la soumission de production.

## Changements

- La carte mentionne le niveau haut et bas. Le premier exemple décrit un réservoir de lave-glace. Les trois exemples de contraintes portent sur l’accès et la maintenance, le nettoyage et les dépôts, puis les vibrations et vagues.
- La hauteur de cuve va de 60 à 2 000 mm. Modifier cette hauteur recale proportionnellement la tige, les points et le liquide ; les dimensions fixes des flotteurs et de l’embout ne sont pas mises à l’échelle. La longueur de tige reste un réglage distinct qui oriente la famille.
- Les curseurs de points ne peuvent pas se croiser. Les états anciens incohérents restent détectés. Les messages proposent une action précise : adapter la tige, répartir les points, agrandir, raccourcir, revenir aux conditions du liquide, choisir un point horizontal ou revenir en vertical. La configuration n’est réparée qu’après l’action annoncée.
- Les réglages, la piste de famille, les explications, le sur-mesure et la poursuite sont à gauche. Le défilement de cette colonne laisse la scène et le moniteur visibles. Un nouveau blocage ramène son message en haut des réglages.
- Le moniteur de droite est uniquement en lecture : circuit partagé avec l’atelier pour un point ; escalier vertical Niveau 0 à Niveau N pour plusieurs points ; jauge verticale, millimètres et pourcentage cohérents pour le continu. Aucune valeur de résistance n’est inventée.
- Le choix du continu étend la tige à la hauteur de cuve pour éviter une démonstration sur une tige compacte initiale. La plage utile et les zones mortes restent à valider avec le BE.
- Le LS03 sépare le corps fixe, l’axe et l’ensemble flotteur articulé. Le LS04 reprend les rainures et l’embout incurvé fendu.
- Les 32 nouvelles chaînes sont présentes dans les sept traductions en plus du français ; relecture métier des traductions encore souhaitable.

## Sources des volumes

Copies locales du dossier `Level Sensors` fourni par Thomas, sans modification des originaux :

| Source | Données reprises | Ce qui reste estimé |
|---|---|---|
| `LS03-1A66-PA-500W.pdf`, plan p. 1, et photos fournies | 83 mm hors tout ; 55,8 mm côté liquide ; flotteur Ø16,5 ; collerette Ø21 ; M16×2 ; écrou SW24, épaisseur 8 mm | Profil détaillé de la fourche, pivot, course angulaire et câble. Le volume représente le standard, pas les variantes DK/DL/GZ. |
| `datasheet-fluid-level-sensor-series-ls04.pdf`, dessin p. 1 | Plage dessinée 80–250 mm ; tige Ø8,5 ; flotteur Ø24–27 et hauteur 16,5–18,5 (vue choisie Ø27 × 18,5) | Pas et profondeur des rainures, fentes et profil de l’embout, non cotés. Gabarit de collision conservateur de 19 mm. |
| `datasheet-fluid-level-sensor-series-ls05.pdf`, dessin p. 1 | Plage dessinée 80–2 000 mm | Construction exacte, contacts, course, entretoises et variantes ; les conflits documentaires thermiques restent ouverts. |

Le dessin LS04 donne 250 mm, alors que la table présente aussi 255 mm : le plafond illustré reste celui du dessin, sans résoudre silencieusement cet écart. Le plafond de cuve de l’interface n’est pas une limite commerciale des réservoirs possibles. Les demandes sous les minima des dessins restent des pistes spécifiques à étudier, pas des références standard qualifiées.

Les dégagements horizontaux 45 mm sous le point et 12 mm au-dessus empêchent la collision de l’enveloppe animée avec le fond et le haut de la cuve. Ils sont dérivés de cette représentation, pas présentés comme des cotes de montage constructeur. À 2 m, le cadrage conserve les proportions physiques et rend les petites pièces moins lisibles.

## Vérifications exécutées

- Suite complète : **2 380 réussis, 1 ignoré, 0 échec**, 187 fichiers. Le test ignoré exige Blender réel.
- Après les derniers ajustements du moniteur : **39 tests ciblés réussis**, couvrant le parcours, les transitions, les règles de configuration et les traductions.
- Vérification TypeScript sans erreur ; compilation de production réussie. Les deux ont été relancées après les derniers ajustements visuels.
- `git diff --check` sans erreur. Contrôles de charte : aucune nouvelle occurrence interdite ; les résultats restants sont les matériaux Three.js, la meta de couleur et les primitives non migrées déjà présentes.

La matrice automatique couvre **10 240 combinaisons** : quatre hauteurs (60, 250, 600, 2 000), cinq nombres de points (1, 2, 4, 6, 12), deux orientations, deux fixations, deux modes, deux répartitions de flotteurs, quatre finitions et huit températures maximales. Pour chaque état bloqué, elle vérifie la présence d’une explication et d’une voie de poursuite sans mutation cachée. Cette couverture finie ne signifie pas que toute configuration physique possible a été validée.

Les tests complémentaires vérifient les allers-retours répétés 100 → 600 → 2 000 → 60, l’ordre des points, la frontière 250/250,5 mm, les réparations explicites, les dégagements horizontaux aux deux extrémités, la constance des dimensions des flotteurs, la lecture verticale et la conservation d’une demande sur mesure jusqu’à Résultat.

Vérification visuelle locale dans le navigateur :

- 1 440 × 1 000 : questionnaire, deux flotteurs pour quatre points, 2 m puis petite cuve, circuit simple, corps horizontal fixe et flotteur pivotant, remplissage et vidange jusqu’aux butées, jauge continue et signal correspondant.
- 1 280 × 720 : les trois panneaux restent sous la navigation ; faire défiler les réglages de 720 px ne change pas la position de la scène ni du moniteur.
- 390 × 844 : présentation empilée, sans débordement horizontal (largeur utile et largeur du document : 375 px).
- Aucun message d’erreur relevé dans la console de la page de vérification. La taille temporaire du navigateur a été réinitialisée.

Captures locales non versionnées : `tmp/level-multipoint-monitor.jpg` et `tmp/level-horizontal-monitor.jpg`. Journaux : `tmp/level-monitor-tests.log`, `tmp/level-monitor-final-targeted.log`, `tmp/level-monitor-build.log`.

## Limites conservées

Ces volumes ne remplacent pas les STEP. L’hydrodynamique, la densité, les frottements, l’hystérésis, les seuils électriques, le codage de résistances et les défauts ne sont pas simulés. Le moniteur montre le comportement demandé, pas une mesure garantie. Les dessins et le filtrage ne constituent pas une recommandation S1 ni une qualification de produit. Les variantes de montage et les minima de longueur demandent encore les données BE.

Le parcours demeure accessible par l’entrée de menu d’aperçu. La synchronisation sur la branche connectée rend les changements testables dans Lovable ; elle ne déclenche pas une nouvelle publication du site public.
