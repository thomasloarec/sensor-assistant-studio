# Sensor Studio 1.2 — ajustements après essai dans Lovable

25 novembre 2026. Base revue : `18061541`. Ce document complète la recette initiale de l’aperçu niveau et répond aux captures et à l’enregistrement de Thomas.

## Changements

- Cartes de choix : paire MK04/M04 agrandie et cadrée sur ses volumes, aimant rouge/bleu issu de l’atelier, câble uniquement sur le capteur. Cadre interne supprimé. Les deux actions primaires bleues sont alignées et nomment explicitement leur capteur. La vignette de niveau ne porte aucun repère P1.
- Chargement : indicateur discret devant la scène jusqu’au premier rendu complet. Aucun dessin 2D ni bloc provisoire n’est affiché. Le mouvement de l’indicateur respecte la préférence de réduction des animations.
- Questions : application générale en premier, liquide/températures en deuxième, conditions d’installation en troisième. Réponse libre pour l’application, sans boutons de suggestion. Les trois questions réutilisent le composant d’exemples du parcours classique avec des exemples propres à leur sujet.
- Configuration : changer le nombre de points redistribue les hauteurs et allonge la tige verticale si nécessaire, comme annoncé sous le contrôle. La modification de longueur reste visible et éditable. Les courses des flotteurs sont indépendantes, fixes pour une configuration donnée et sans superposition. Une longueur ensuite rendue incohérente par un réglage manuel reste conservée ; la scène et le signal sont suspendus avec une explication.

## Cause de l’impression d’allongement

Le flotteur n’était pas redimensionné par l’animation. Le passage d’un à quatre points conservait la tige initiale de 32,5 mm. Les deux flotteurs illustratifs étaient alors rabattus dans la même petite course et se chevauchaient. Leur silhouette cumulée paraissait s’allonger, puis se raccourcir lorsque leurs positions se rejoignaient.

La correction partage les bornes mécaniques entre la validation et la scène. La hauteur des corps est constante et seul leur déplacement dépend du liquide. Le choix de quatre points depuis l’état initial produit une tige illustrative de 99 mm, avec deux flotteurs, dans la cuve de 100 mm. Ce dimensionnement de maquette reste une proposition de visualisation, pas une référence catalogue ni une géométrie validée par le BE.

## Vérifications dans le navigateur

Essais locaux des composants utilisés par le parcours Lovable, sans soumission de dossier.

| Vérification | Résultat observé |
|---|---|
| Choix français et anglais | Paire agrandie, câble distinct, pôles rouge/bleu, deux boutons bleus alignés, aucun repère P1 sur la carte de niveau. |
| Application en premier | Titre « Dans quel équipement, et pour quoi faire ? », saisie libre et exemple de machine complet. Changer d’exemple conserve la réponse. |
| Liquide en deuxième | Eau de condensation, sans additif, plage 5–35 °C saisie après la description de la machine. |
| Installation en troisième | Exemples sur pression, immersion du corps et exposition du câble, sans anticiper l’orientation. |
| Passage à quatre points | LS04 affiché, tige de 99 mm, deux flotteurs séparés et quatre repères à 20/40/60/80 mm. |
| Vidange et remplissage | Arrêt à 0 et à 100 mm ; corps fixes dans leurs butées. La lecture souhaitée passe de la zone 1/5 à la zone 5/5. |
| Tige raccourcie manuellement | La valeur 25 mm est conservée, l’incohérence est indiquée et le signal suspendu. Le retour à 99 mm rétablit la scène. |
| Retour au liquide | Retour direct à la question 2. À 90 °C, piste LS05 et corps inox ; à 35 °C, retour LS04. Les quatre points et la longueur sont conservés. |
| Retour à Mon besoin | La description libre initiale est conservée. |
| Mobile, fenêtre de 390 px | Choix et questionnaire en une colonne, sans débordement horizontal : contenu et largeur utile de 375 px. |
| Console du navigateur | Aucune erreur relevée pendant la vérification finale. Avertissement existant de Three.js sur `Clock`, sans erreur de rendu. |

## Contrôles automatiques

Les tests ciblés vérifient la conservation des données entre les écrans, les courses sur toute la hauteur en montée et en descente, les montages haut/bas, la séparation des corps, le passage du capteur compact au multipoint et les assemblages trop courts ou trop serrés. Ils ne prétendent pas valider des seuils magnétiques ou une flottabilité.

- Tests ciblés niveau : 15 réussis.
- Suite complète : 2 373 réussis, 1 ignoré, aucun échec, sur 186 fichiers (318 s). Le test ignoré exige une installation réelle de Blender.
- Vérification TypeScript : réussie.
- Compilation de l’application : réussie.
- Inventaire des traductions : aucun écart ; 13 textes ajoutés dans les sept langues complémentaires au français.
- Contrôles de charte : aucune nouvelle occurrence interdite ; les occurrences existantes restent limitées à la balise de thème, aux matériaux Three.js et aux primitives UI non migrées.
- Contrôle des espaces et fins de lignes : réussi.

## Captures

Captures locales dans `outputs/interface-niveau-ajustements-2026-11-25`, à côté du dossier de travail :

- `01-choix-parcours.jpg` et `09-choice-english.jpg` : cartes de choix finales.
- `02-application.jpg` : première question et exemple.
- `06-configurateur-corrige.jpg` : LS04, quatre points et deux flotteurs distincts.
- `07-question-mobile.jpg` et `08-choix-mobile.jpg` : contrôle à 390 px.
- `04-vidange.jpg` et `05-remplissage.jpg` : observations des extrémités de lecture, cadrage partiel dû au défilement.

## Périmètre restant

Les géométries LS04/LS05 et leurs butées restent illustratives en attendant les données BE. Les sorties par résistances ne reçoivent aucune valeur inventée. Le moteur de proximité et les pages communes Résultat/Avec Standex ne sont pas modifiés par cette passe. Le parcours niveau prépare toujours un brouillon, sans soumission externe.
