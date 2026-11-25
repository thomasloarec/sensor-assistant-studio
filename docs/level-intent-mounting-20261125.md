# Parcours niveau — intention, montage et butées

Passe du 25 novembre 2026, base `a70f7857`, répondant aux retours A–F de Thomas. Les éléments de ce rapport concernent l’aperçu niveau ; aucune modification du moteur de proximité ou de la soumission de production.

## Comportement livré

| Retour | Résultat |
|---|---|
| A — haut/bas | Le client choisit le niveau à détecter. Le signal demandé et la position sont déduits. Un LS01/LS02 droit propose une forme produit B pour le haut, A pour le bas. Le moniteur et Résultat indiquent cette proposition. Aucun choix de reed interne n’est demandé. |
| B — montage | Trois choix distincts : capteur droit à hauteur libre, ouverture imposée en haut, insertion par le fond. Le niveau bas privilégie un compact droit abaissé si l’accès est libre. Un support illustratif matérialise la fixation ; ce support n’est pas une référence de fourniture. Le retournement est explicite, avec construction et contact à confirmer. |
| C — synchronisation | Scène et moniteur partagent le calcul de déplacement. Le haut s’active à la butée haute ; le bas à la butée basse. Les hauteurs demandées incompatibles avec le montage ne produisent pas un faux signal. La même règle s’applique aux deux extrémités du flotteur horizontal. |
| D — LS01/LS02 | La préférence de course devient explicite : courte près d’une limite / plus longue avant détection. Elle oriente le compact LS01/LS02 si le montage le permet. Une grande cuve ou un liquide agité ne suffit pas à qualifier automatiquement un produit. Aucun filtrage anti-vagues ni hystérésis n’est garanti. |
| E — navigation | Fond opaque et contenu de navigation sur toute la largeur du panneau, ancrés sous l’en-tête. Les styles du parcours proximité ne changent pas. |
| F — LS04 | Collerettes ouvertes en C, fixes autour de la tige rainurée. Pour un seul niveau, la course est localisée autour du seuil et réglable indépendamment de la longueur de tige. Les séparations multipoints restent fixes, avec dédoublonnage des collerettes voisines. |

## Questionnaire et proposition initiale

1. Application en texte libre et exemples adaptés.
2. Liquide et plage de température.
3. Accès de montage, hauteur utile, contraintes libres ; pression et immersion disponibles dans un détail dépliable.
4. Niveau à détecter, hauteur facultative du seuil et réaction recherchée.

Le configurateur s’initialise sur ces réponses explicites. Les informations manquantes donnent une première proposition signalée comme modifiable. Le texte libre n’est pas interprété par une pseudo-intelligence à mots-clés. Un retour au questionnaire sans changement des données de montage conserve les réglages manuels ; le liquide et les températures seuls ne réinitialisent pas la géométrie. Les nouvelles données et la forme produit proposée sont conservées dans le brouillon exporté, schéma `sensor-studio.level-preview.v2`.

Exemples contrôlés par les tests :

- Cuve 180 mm, accès libre, niveau bas à 30 mm : LS01 droit, fixation à 47,5 mm ; forme produit A proposée.
- Même besoin avec ouverture imposée en haut : LS04, tige illustrative 173 mm, centre du flotteur limité entre 26 et 36,5 mm. Une cuve pleine ne fait pas remonter ce flotteur jusqu’au couvercle.
- Niveau haut compact : signal inactif pendant la montée, puis actif à la butée haute ; forme produit B proposée.
- Réaction longue : LS02 lorsque la longueur et l’accès conviennent. Le seuil demandé reste identique si le montage le permet.
- Fond imposé : construction retournée conservée explicitement, sans attribution A/B non vérifiée.

## Conventions et limites

Les enveloppes compactes de l’aperçu donnent des courses illustratives de 10,5 et 34 mm, avec un gabarit de flotteur de 19 mm. Les dimensions des flotteurs restent fixes pendant l’animation. Un décalage partagé de 4 mm entre liquide et centre du flotteur permet la représentation ; il ne modélise pas la densité ou la flottabilité.

Les collerettes LS04 reprennent les photographies fournies par Thomas : anneau ouvert, couleur plastique, clipsé sur la tige. Diamètre extérieur 19 mm et épaisseur 1,3 mm sont des estimations visuelles, à remplacer par les cotes BE. Le profil rainuré et l’embout fendu de la passe précédente sont conservés. Le modèle horizontal garde les dimensions documentaires précédentes ; les 28,8 mm de déplacement représenté et ses dégagements restent des conventions d’animation.

Les formes A/B sont proposées uniquement pour le produit compact droit, sur la base de l’explication métier de Thomas. Le sens électrique des montages retournés, horizontaux et des tiges configurables reste à confirmer. Les circuits illustrent l’intention, sans qualification de charge ou de fonction de sécurité. Les valeurs de résistances, défauts, temps de réaction et hystérésis ne sont pas inventés. Le premier pilote demeure sans recommandation qualifiée S1.

## Vérifications

Les 48 tests ciblés passent : configuration, transitions, intentions, parcours rendu et traductions. Ils vérifient notamment les états juste avant, au niveau et juste après les butées, remplissage et vidange, fixations libres/hautes/basses, course courte/longue, maintien des réglages lors d’un retour au questionnaire et réparations des points impossibles.

La matrice de 10 240 combinaisons du parcours est conservée. Un audit complémentaire de 2 304 cas couvre six hauteurs (60, 100, 180, 250, 600, 2 000), quatre accès, quatre besoins, deux réactions, trois températures et quatre valeurs de seuil. Les actions proposées conduisent à un état exploitable ou à une étude du liquide/sur mesure, sans boucle de réparation ni configuration modifiée en silence. Cet audit reste une couverture finie, pas une validation de toutes les constructions physiques.

TypeScript et compilation de production réussis. Les contrôles de charte n’ajoutent aucune occurrence interdite ; les exceptions antérieures de matériaux 3D et composants non montés subsistent. 49 nouvelles clés sont traduites dans les sept langues en plus du français ; relecture linguistique métier encore souhaitable.

La première suite complète a donné 2 388 réussites, 1 test ignoré et 1 échec dans le test existant de placement du Workshop de proximité. Les 7 tests de ce fichier ont ensuite réussi isolément. La seconde exécution complète passe : **2 389 réussites, 1 test ignoré, aucun échec**, sur 188 fichiers (387 995 assertions). Aucun test de proximité ni calcul du Workshop n’a été modifié pour obtenir ce résultat.

**Vérification visuelle non terminée.** Le navigateur intégré n’a pas réussi à ouvrir l’aperçu ; le contrôle Chrome a ensuite été interrompu parce que l’outil ne pouvait pas établir l’URL active avec certitude. Aucune capture ni validation responsive de la nouvelle version n’est revendiquée. Les captures de la passe précédente ne prouvent pas le rendu de cette passe.

Journaux locaux : `tmp/level-intent-targeted.log`, `tmp/level-intent-full-tests.log`, `tmp/level-intent-full-tests-final.log`, `tmp/level-intent-workshop-recheck.log`, `tmp/level-intent-types-final.log`, `tmp/level-intent-build-final.log`. Audit complémentaire : `tmp/audit-level-intent.ts`.

La synchronisation vers la branche connectée rend la passe testable dans Lovable. Elle ne constitue pas une nouvelle publication du site public.
