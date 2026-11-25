# Sensor Studio 1.2 — proposition d’interface niveau de liquide

Version de travail du 25 novembre 2026, destinée à Thomas et à la revue de Claude. Le parcours vise un choix rapide de principe et de montage, puis une demande exploitable par Standex. La configuration représente le besoin du client ; le choix d’une référence qualifiée reste une étape distincte, dépendante des données du bureau d’études.

## 1. Entrée et progression

L’accueil et son message « Trouvez le capteur adapté à votre projet. » restent inchangés. Dans cette branche, le menu de l’espace de conception reçoit une seule entrée « Capteurs de niveau · aperçu », qui ouvre un panneau plein écran. Le dossier de proximité reste monté et conservé. Aucune bascule n’est ajoutée au bouton de démarrage de l’accueil.

Le panneau préfigure la future page de choix :

| Carte | Texte proposé | Destination |
|---|---|---|
| **Position et mouvement** | Repérer une ouverture, une présence ou le déplacement d’une pièce. | Parcours actuel ; dans l’aperçu intégré, fermer le panneau pour retrouver le travail courant. |
| **Niveau de liquide** | Détecter un niveau haut ou bas, plusieurs seuils ou suivre la hauteur du liquide. | Nouveau parcours à flotteur intégré. |

« Standard » n’est pas retenu : un capteur de niveau peut aussi être standard. « Position et mouvement » décrit l’usage et laisse le parcours existant accueillir ses constructions spécifiques.

Les deux actions utilisent le même bouton primaire bleu : « Configurer un capteur de position » et « Configurer un capteur de niveau ». La paire de position réutilise les corps de l’atelier, cadrés sur leur encombrement réel : câble sur le capteur, pôles rouge et bleu sur l’aimant. Aucune bordure interne ne coupe l’image. La vignette de niveau est une illustration fixe, sans repère P1 et indépendante de la configuration en cours. Un indicateur discret couvre les scènes jusqu’à leur premier rendu complet, sans modèle provisoire.

La progression est **Mon besoin → Configuration → Résultat → Avec Standex**. Elle reprend la barre segmentée à quatre étapes du parcours actuel : mêmes classes, pouce actif, espacement et comportement fixe en haut de page. Seul « Couples proposés » devient « Configuration ». L’en-tête reprend également le logo, le nom de projet renommable, l’état Brouillon, la langue et le menu. Le composant de renommage est partagé avec le parcours classique, sans changement de comportement.

Cette progression remplace, pour le niveau, l’idée d’un atelier magnétique évoquée dans les dossiers techniques antérieurs. Cela ne change pas les principes techniques du cerveau ni les décisions déjà validées sur les sorties codées.

## 2. Quatre écrans de questions

Les écrans reprennent les composants et la présentation des questionnaires existants. Une donnée inconnue reste explicitement « À définir » ; elle n’est jamais remplie par une hypothèse cachée. « À préciser plus tard » permet d’explorer, mais n’équivaut pas à une compatibilité positive.

### Écran 1 — Dans quel équipement, et pour quoi faire ?

Une réponse libre décrit la machine, la place de la cuve ou du réservoir et l’action attendue : remplissage, vidange, commande de pompe ou alarme. Aucun bouton ne préremplit la réponse. L’encart `NeedExamples` partagé avec le parcours classique propose trois exemples complets, consultables manuellement : réservoir de lave-glace d’un véhicule, bac de condensats et réservoir hydraulique. Lire un exemple ne change jamais la saisie. La machine à café a été retirée : la construction à flotteur aimant séparé ne représente pas le capteur intégré de ce parcours.

Une demande de continu doit pouvoir être reformulée en actions concrètes. Si quelques seuils suffisent, l’utilisateur pourra comparer les deux modes sans perdre ce contexte. Le prototype recueille cette description ; il ne réalise pas encore la reformulation avec le cerveau conversationnel.

### Écran 2 — Quel liquide, à quelles températures ?

- Liquide : eau / huile / autre liquide / à définir.
- Précision contextuelle : type d’eau et additifs, ou nom/référence/composition du liquide.
- Température minimale et maximale du liquide, en °C ; champs laissés vides si inconnus.

Les deux températures expriment une plage de fonctionnement, pas la température du jour. Une plage inversée ou une valeur physiquement impossible empêche de poursuivre tant qu’elle n’est pas corrigée. Le choix « autre liquide » ne rend pas ce parcours applicable aux poudres, granulés ou solides.

Pour le cerveau final : distinguer eau seule, eau additivée, huile précisément identifiée et mélange. L’extension D5 aux eaux du réseau, déminéralisée, de pluie et de condensation vaut pour une référence de densité seulement. Elle ne prouve ni la propreté ni la compatibilité chimique. Le prototype ne calcule pas de flottabilité à partir d’une table de densité.

Les exemples de cet écran portent uniquement sur le fluide, ses additifs éventuels et sa plage de température.

### Écran 3 — Dans quelles conditions le capteur sera-t-il installé ?

- Accès : libre / ouverture haute imposée / paroi latérale / insertion par le fond / à définir.
- Hauteur utile de la cuve, du fond au niveau maximal, facultative (60–2 000 mm dans cet aperçu).
- Cuve : pression atmosphérique / pression ou vide / à définir.
- Corps du capteur : immergé en permanence / par intermittence / à définir.
- Sortie de câble et câble : restent hors du liquide / sont immergés même occasionnellement / à définir.
- Contraintes libres, facultatives : accès, nettoyage, agitation, encombrement, exigences particulières.

Le corps mouillé et le câble mouillé sont deux informations distinctes. Une détection de bas de cuve peut imposer une immersion permanente sans immerger le câble. La pression chiffrée, les cycles, la durée de vie et les détails de nettoyage seront complétés lorsque la configuration l’exige ou lors du dossier Standex, plutôt que de bloquer cette découverte.

Les trois exemples aident à rédiger les contraintes libres : accès limité à un orifice de 25 mm et remplacement sans démontage ; nettoyage hebdomadaire à 60 °C et dépôts ; vibrations, freinages et vagues dans un véhicule. Ils ne recopient pas les réponses des menus et ne remplissent pas le champ.

Les champs pression et immersion sont regroupés dans un détail dépliable afin de laisser l’accès, la hauteur et les contraintes libres au premier plan.

### Écran 4 — Quel niveau faut-il détecter ?

Niveau haut, bas, plusieurs niveaux, continu ou à définir. Une hauteur de détection facultative est mesurée depuis le fond. La réaction souhaitée distingue une course courte près d’une limite d’une course plus longue avant détection. Cette dernière est une piste pour un liquide en mouvement, sans garantie de filtrage des vagues ni d’hystérésis.

La première entrée dans le configurateur utilise ces réponses explicites. Aucune interprétation automatique du texte libre n’est inventée. À défaut d’information, une cuve de 100 mm et un besoin haut constituent une proposition modifiable, signalée comme telle. Un accès libre et un niveau bas abaissent un capteur compact droit ; une ouverture imposée en haut conduit à une tige longue avec une course localisée. Un changement de ces réponses régénère la proposition. Un retour sans changement, ou une modification du liquide seul, conserve les réglages manuels.

## 3. Paramètres du configurateur

Trois zones sur grand écran : **réglages, piste et suite à gauche**, **cuve et animation au centre**, **moniteur opérateur à droite**. La colonne de réglages défile indépendamment ; le montage et le moniteur restent visibles. Un nouveau blocage remonte le message et ses actions en haut de cette colonne. À droite, aucun champ ni action de configuration. Sur tablette, le moniteur descend sous la scène ; sur téléphone, les blocs se suivent verticalement. La scène utilise un angle fixe de vue en coupe ; aucun champ magnétique ni couple capteur–aimant n’est présenté.

| Paramètre | Réglage et effet | Règle de conception |
|---|---|---|
| Mode | Par points / continu | Garder le besoin de continu si aucun montage proposé ne le couvre ; ne pas le transformer silencieusement en un point. |
| Nombre de points | 1 à 12 dans l’aperçu | Nombre de commutations souhaitées, distinct des flotteurs, des contacts physiques et des fils. Changer le nombre redistribue les positions et allonge la tige verticale si nécessaire ; le texte l’annonce. Une longueur ajustée manuellement n’est pas réparée en arrière-plan. |
| Orientation | Verticale / horizontale | Un capteur horizontal seul ne couvre pas une demande multipoint ou continue. Le message propose « Utiliser un seul point », « Passer en vertical » et une demande spécifique. Le besoin reste conservé jusqu’au clic explicite. |
| Fixation | Capteur droit à hauteur libre / ouverture haute imposée / insertion par le fond | Le niveau bas ne retourne jamais automatiquement le capteur. À hauteur libre, le point commande la position d’un support illustratif ; le câble reste au-dessus du flotteur. L’insertion par le fond est un choix explicite avec logique de contact à confirmer. |
| Montage latéral | Standard / DK / DL / GZ | Le prototype conserve ce choix. Les géométries distinctes et le filtrage selon accès intérieur/extérieur restent à compléter après validation des plans. |
| Hauteur utile de cuve | 60 à 2 000 mm dans l’aperçu | Repère depuis le fond, distinct de la longueur de tige. Le changement recale points, montage et liquide. Les corps compacts restent fixes ; leur point est recalé sur le montage. Les tiges configurables et leur course locale suivent la hauteur, avec dégagements fixes conservés. Le plafond d’interface suit le dessin LS05, sans constituer une limite des cuves possibles. |
| Longueur sous fixation | 25 à 2 000 mm dans l’aperçu | Oriente la famille, avec un passage du plastique vers l’inox au-delà de 250 mm ; le contexte thermique peut aussi imposer l’inox. LS01 et LS02 conservent leurs enveloppes fixes. Un raccourcissement manuel insuffisant déclenche une action « Adapter la tige aux points ». |
| Positions des points | Hauteurs en mm depuis le fond | Chaque curseur s’arrête avant son voisin. Un ancien état incohérent propose « Répartir les points ». En horizontal, l’enveloppe pivotante garde un dégagement illustratif de 45 mm sous son pivot et 12 mm au-dessus. Pour le bas, le pivot se situe 28,8 mm au-dessus du point ; pour le haut, il est à hauteur du point. « Recentrer le point » rétablit le mouvement. Ces conventions ne sont pas des cotes constructeur qualifiées. |
| Répartition des flotteurs | 1 ou jusqu’à 2 points par flotteur | Proposition d’architecture à confirmer. Deux flotteurs peuvent représenter quatre points. La disposition des butées, contacts et résistances relève du BE. |
| Niveau simple souhaité | Niveau haut / niveau bas | Déduit le comportement du signal et propose B / A pour un LS01/LS02 droit. Aucune forme interne de reed n’est demandée. Les autres constructions conservent la forme à confirmer. |
| Réaction recherchée | Course courte / plus longue | Préférence LS01 / LS02 si le montage compact convient. Une cuve haute ou étroite n’est pas, à elle seule, une preuve permettant ce choix. |
| Course locale du flotteur | Réglable entre les butées pour une tige à un point | La longueur de tige atteint la zone ; la course limite le déplacement près du point. Les collerettes fixes ne suivent pas le liquide. |
| Forme spécifique | Choix explicite + description libre | Conserver les besoins de niveau et de montage, puis poursuivre vers la revue. Ne pas forcer une famille standard ni inventer une forme fabriquable. |

La famille est une **piste à étudier**, jamais une référence recommandée S1 dans ce premier pilote. Aucun code article n’est fabriqué à partir de la nomenclature.

Pour la version aboutie, l’accès de montage intérieur/extérieur doit être une question compréhensible ; le système en déduira les variantes LS03 possibles. Le menu DK/DL/GZ actuel sert à explorer et à discuter l’interface, pas à déclarer ces variantes interchangeables.

## 4. Modification du liquide et des températures

Le cartouche de contexte renvoie à l’écran 2 et présente un bouton « Revenir au configurateur ». Application, orientation, longueur, positions, besoin sur mesure et détail de câble sont conservés. Le calcul des pistes est refait depuis les nouvelles données ; une piste devenue incompatible ne reste pas sélectionnée.

Le filtrage actuel emploie un sous-ensemble documentaire explicite, isolé du moteur de proximité. Les valeurs maximales du périmètre utilisé sont 80 °C pour les constructions plastiques LS01/LS02 et les plans LS03 fournis, 70 °C pour la fiche LS04 et 160 °C pour la ligne de fonctionnement LS05. La mention LS05 200 °C reste un point à confirmer sur la construction inox complète. Aucun plafond universel de 200 °C n’est affirmé.

Ces limites ne constituent pas une table complète de qualification : câble mobile, variantes exactes, minimum de température, compatibilité chimique, pression, immersion, densité et charge demandent un traitement plus fin. Le prototype laisse ces réserves attachées à la piste ; les inconnues ne deviennent pas des exclusions de toutes les constructions possibles.

Le liquide oriente ici une matière candidate très grossièrement ; cette interface ne contient pas encore une base de compatibilité chimique permettant d’écarter ou d’accepter chaque mélange. Une exclusion documentaire, une donnée manquante et une demande de forme spécifique sont trois situations différentes.

## 5. Animation et affichage du signal

L’utilisateur fait monter ou descendre le liquide avec un curseur ou une lecture animée. Les flotteurs bougent dans leurs courses représentées. L’animation s’arrête à l’extrémité, à la fermeture du panneau ou lorsque l’onglet est masqué. Le mode système de réduction des mouvements conserve le curseur manuel.

Chaque flotteur conserve la même géométrie pendant toute l’animation. Ses butées sont calculées depuis la configuration et restent fixes lorsque le liquide varie. Les courses voisines sont séparées pour empêcher toute superposition de corps. Dans la maquette, le flotteur illustratif mesure 19 mm de haut et le jeu entre corps est de 2 mm ; ces conventions de représentation ne valident pas une construction LS04/LS05. Une configuration impossible à représenter suspend la scène et le signal et indique le réglage à corriger, sans comprimer les flotteurs.

Pour un point, mouvement et signal emploient le même calcul de position du flotteur : le haut s’active à sa butée haute, le bas à sa butée basse. Le décalage illustratif liquide/centre du flotteur est de 4 mm ; ce n’est pas un calcul de flottabilité. La hauteur demandée et la hauteur illustrative de commutation doivent coïncider pour activer la scène. Le montage horizontal partage aussi sa progression de rotation avec le signal. Aucun retard, filtrage ou hystérésis physique n’est simulé.

Les courses compactes représentées sont 10,5 mm et 34 mm, dérivées des enveloppes actuelles et de leurs marges, à confirmer sur plans détaillés. Pour les LS04/LS05 à un point, la course est localisée autour du seuil demandé. Les formes produit A/B proposées ne décrivent pas le type du reed nu : l’astuce de placement sur PCB reste interne.

| Demande | Lecture proposée |
|---|---|
| Un point | Circuit ouvert/fermé et lampe, accompagnés du texte actif/inactif. Le comportement demandé au niveau bas ou haut est explicite. |
| Plusieurs points | Moniteur vertical en escalier, du Niveau 0 en bas au Niveau N en haut. Chaque zone porte sa plage et une couleur, la zone active étant soulignée et indiquée en texte. Quatre seuils donnent cinq zones. Les repères P1… restent dans la cuve. |
| Continu | Jauge verticale, hauteur et pourcentage cohérents par pas illustratif de 5 mm. Le choix du mode étend la tige à la hauteur de cuve. La plage réellement mesurable reste à confirmer ; ce pas ne signifie pas une exactitude de ±5 mm ni une mesure physique calculée. |

Le multipoint à résistances ne s’affiche pas comme quatre contacts indépendants. Aucune valeur en ohms ou en volts n’est inventée. L’unicité des codes, les transitions, l’électronique de lecture et les défauts détectables restent à définir avec Standex.

Le signal est **le comportement demandé**, pas une prédiction physique des seuils réels. La densité, le tirant d’eau, les hystérésis, la vitesse du liquide, les frottements, les contacts et la charge ne sont pas modélisés. Une incohérence géométrique identifiée suspend l’affichage du signal. La simulation n’établit ni une précision de 3–5 mm ni une fonction de sécurité.

## 6. Rendu des produits

Le rendu est réalisé en volume avec matières, éclairage, ombres, écrou, joint, tige, butées, flotteurs et câble. Le client voit une mise en situation fixe en coupe, pas un atelier 3D à piloter. Les couleurs et composants de l’interface restent ceux de Sensor Studio.

Les dessins LS01 et LS02 ont servi aux proportions compactes : longueur sous fixation de 32,5 et 56 mm, flotteur de diamètre 23,5 mm et hauteur 19 mm. Le LS03 standard utilise désormais deux ensembles distincts : corps horizontal fixe et fourche avec flotteur pivotant. Le plan fourni donne 83 mm hors tout, 55,8 mm côté liquide, Ø16,5 pour le flotteur, Ø21 pour la collerette, M16×2 et écrou SW24. Seul l’ensemble mobile tourne. Les variantes DK/DL/GZ ne disposent pas encore de géométries différenciées.

Le LS04 reprend une tige Ø8,5 avec rainures, un flotteur Ø27 de 18,5 mm et un embout plastique incurvé fendu. Le pas et la profondeur des rainures, ainsi que le détail de l’embout, sont estimés visuellement car non cotés sur la fiche. L’enveloppe de collision garde 19 mm par prudence. Les plages dessinées sont 80–250 mm pour LS04 et 80–2 000 mm pour LS05 ; les demandes en deçà restent des illustrations à étudier, sans référence standard déclarée conforme. À grande hauteur, le cadrage conserve les proportions physiques : les petites pièces deviennent moins lisibles.

La qualité visuelle est une première base fonctionnelle, pas encore le rendu photoréaliste final demandé. Avant validation visuelle produit : reconstruire chaque enveloppe et chaque finition depuis son plan, vérifier les courses et collisions de flotteurs, détailler les filetages et les matières, puis remplacer les enveloppes par les STEP BE lorsqu’ils seront disponibles. Une enveloppe absente ne doit pas être remplacée par un modèle présenté comme exact.

Une forme spécifique n’est pas dessinée automatiquement à partir d’une phrase. Le prototype remplace la scène par une demande à décrire. La suite pourra ajouter un croquis annoté ou un import ; un plan client confidentiel ne doit pas devenir un modèle public de démonstration.

## 7. Revue et Avec Standex

Les deux pages réutilisent la grille `review-grid` du parcours actuel : une grande colonne à gauche et une colonne de 420 px à droite sur grand écran, puis une seule colonne sous 1024 px. Les cartes utilisent `panel-block-lg` et les récapitulatifs `review-facts` / `review-fact`. Ce sont des écrans communs ; seul le configurateur conserve une disposition spécifique.

À gauche, les blocs supérieurs résument **Votre projet**, puis la **Configuration technique**. La partie basse contient **Détails du projet**, avec les champs existants de volume annuel, phase, calendrier et durée de série (`ProjectContextFields`), ainsi que les contraintes complémentaires. Ces données sont conservées entre Résultat et Avec Standex. À droite, Résultat présente les actions de poursuite ; Avec Standex présente **Vos coordonnées**, avec le sélecteur d’industrie existant, le nom, l’entreprise, l’e-mail, le téléphone, le pays et la ville.

Résultat ajoute à gauche le choix du câble et la bibliothèque de connecteurs existante, avec la possibilité de donner une référence libre. Avec Standex affiche ces choix en lecture seule dans la configuration technique. Le choix d’un connecteur ne prouve pas son adéquation à une immersion ni le nombre de conducteurs du circuit final.

L’étape Avec Standex prépare les coordonnées et les compléments. Dans l’aperçu, elle **télécharge un brouillon local** explicitement non envoyé. Ce brouillon garde le titre, les données techniques, les détails du projet, les coordonnées, les notes, la famille d’étude éventuelle, les points ouverts et le statut non qualifié. Les paramètres inactifs d’une autre orientation sont conservés dans l’état brut pour permettre un retour de l’utilisateur ; l’adaptateur du futur dossier devra distinguer données actives et mémorisées.

Le raccordement au dossier et à la soumission existants reste à réaliser avec un contrat spécifique niveau. Il devra transmettre les contacts électriques et l’architecture retenue sans réutiliser artificiellement les champs du couple capteur–aimant. Il devra aussi recueillir les données conditionnelles manquantes avant toute recommandation qualifiée : fluide exact, charge, densité si nécessaire, pression chiffrée, nettoyage, immersion, sécurité et conditions de fonctionnement.

## 8. Mise en œuvre et limites du pilote

Le travail est isolé sur `codex/level-interface-20261125`, depuis `origin/main` au commit `40935b34`. La première version d’interface a été synchronisée avec la branche connectée à Lovable au commit `18061541`, puis testée par Thomas. Les ajustements décrits ici répondent à ses retours du 25 novembre. Les modules de niveau ne modifient ni le moteur magnétique, ni le dossier de proximité, ni l’authentification, ni la soumission de production. La route `/niveau` et l’entrée de menu permettent de tester l’aperçu dans Lovable ; la synchronisation du code ne constitue pas une publication du site public.

Le premier pilote permet de juger la compréhension du parcours, le nombre de questions, l’emplacement des réglages, la comparaison des orientations et la lecture multipoint. Il ne doit pas être utilisé comme outil de dimensionnement ou de qualification catalogue. Les nouveaux textes sont présents dans les huit langues du dictionnaire ; la relecture linguistique métier reste à effectuer.

Priorités après cette revue :

1. Tester avec Thomas les quatre écrans, la proposition initiale de montage et la localisation des courses.
2. Relire avec Claude les frontières entre besoin, illustration, piste de famille et qualification, sans élargir les valeurs documentaires.
3. Intégrer les réponses BE aux constructions LS, aux variantes de montage et aux sorties codées ; remplacer le filtrage de démonstration par les règles du cerveau validées.
4. Porter les géométries et matières au rendu réaliste final, puis reprendre la recette avec les vrais STEP.
5. Raccorder le dossier niveau et la soumission, vérifier le menu dans une session authentifiée, puis décider de la diffusion du pilote.

## 9. Reprendre l’aperçu local

Depuis ce dossier, après installation des dépendances :

```powershell
npx --yes bun run dev:workshop --port 5199
```

Ouvrir `http://127.0.0.1:5199/level-preview.html`. Cet aperçu monte uniquement les composants d’interface, sans données ni soumission de production. Le bouton du parcours classique renvoie à l’application complète locale sur le port 5198, à démarrer séparément avec `npx --yes bun run dev --host 127.0.0.1 --port 5198` ; son contrôle d’accès habituel reste actif.

Le rapport de vérification séparé donne les tests exécutés et les captures de cette version. Les dossiers techniques antérieurs et les fichiers synchronisés de `sources/` restent inchangés.
