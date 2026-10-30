# Catalogue et atelier — corrections du 30 octobre 2026

## Sources et modèle

- MK06 : fiche Standex fournie, révision 2019-02-28, tableau électrique page 1 ; six plans individuels fournis pour les tailles 4, 5, 6, 7, 8 et 10. Copies des plans dans `public/datasheets/MK06-size-*.png`.
- La taille 4 utilise le contact 80 (10 W, 170 V, 0,5 A commuté, 0,5 A traversant) ; 5/6 le 87 (10 W, 200 V, 0,4 A, 0,5 A) ; 7/8/10 le 66 (10 W, 180 V, 0,5 A, 1,25 A). La taille 8 propose aussi le 90 (10 W, 175 V, 0,5 A, 1 A). Les options électriques de consultation ne changent pas implicitement le contact simulé.
- Dimensions [longueur, hauteur, largeur] et entraxe : 4 = [12,06 ; 3,3 ; 3,3], 10,16 ; 5 = [14,3 ; 3,2 ; 2,8], 12,7 ; 6 = [17,24 ; 4,2 ; 3,3], 15,24 ; 7 = [19,78 ; 4,2 ; 3,3], 17,78 ; 8 = [22,32 ; 4,2 ; 3,3], 20,32 ; 10 = [28,5 ; 5,72 ; 3,81], 25,4 mm. La longueur de taille 10 suit son plan individuel (28,50 mm).
- Les variantes gardent des identifiants distincts pour la suggestion, la reprise de dossier et le montage, mais une seule entrée MK06 est affichée dans la galerie. La fiche permet de choisir la taille. Le moteur compare d’abord les contraintes par variante, puis regroupe les suggestions. Un même contact doit couvrir les valeurs électriques explicites ; aucune combinaison artificielle de maxima.

## MK07

Le calcul utilisait une enveloppe rectangulaire du diamètre maximal sur toute la longueur. Le profil est maintenant décomposé en nez, filetage, épaulement, arrière et écrou, avec des enveloppes conservatrices séparées. Les collisions sont identiques pour point, volume et chronologie.

Le centre du reed est **une nouvelle hypothèse**, à x = −10,75 mm dans le repère du corps : verre de 14 mm et couverture supposée de 2 mm au nez. Ce n’est pas une cote Standex et ce n’est pas une recalibration du reed. Le profil porte `nose-datum-estimate-2mm-cover`, version `catalogue-c1-analogy-4.2.0`. La réponse C1%, k×AT et les repères documentaires restent inchangés. Le volume s’étend à ±40 mm pour ne pas tronquer les lobes du côté du nez. L’orientation du boîtier est appliquée au même repère interne et aux mêmes obstacles ; le rendu des contacts suit ce centre.

Une nouvelle démonstration face à face du MK07 vise ce centre estimé ; une sélection d’approche frontale remet le décalage transverse à zéro. Les montages importés et les dossiers rouverts ne sont jamais repositionnés. La rotation de vignette catalogue est indépendante de la pose de montage.

## Interaction et recette

- Le curseur de distance est disponible en passage latéral pour les deux dispositions. Il translate le trajet sans rotation, prévisualise le milieu du passage (t=0,25), puis la lecture reprend depuis le départ. Sa limite haute rejoint le dernier placement central activable calculé au pas de 0,25 mm ; lorsqu’aucun lobe central n’est accessible, plage mécanique de repli de 15 mm. Aucun résultat n’est forcé.
- Tests numériques : MK07/AlNiCo500 Ø4×19, approches D1 et D3 : une fermeture à l’aller, sans chevauchement ; passage latéral à 1 mm : trois intervalles actifs, puis un seul à la limite haute. MK06 taille 4/HF3225 : même comparaison trois/un. MK04/M04 n’offre pas nécessairement trois intervalles accessibles : le boîtier de l’aimant est conservé dans le test de collision.
- MK01 : le commun rejoint NC au repos, NO activé. Les deux vues partagent les trois segments. Cette illustration ne qualifie pas les distances d’un contact inverseur réel.
- La coupe reste implémentée et testée hors du sélecteur de l’atelier. Un seul bouton de lecture est monté : rangée principale à gauche sur ordinateur ; barre supérieure sur mobile. Fond cyan Standex, texte sombre. Témoin de calcul en angle supérieur gauche.
- MK24 : nom affiché simplifié, identité et données inchangées. Les badges répétitifs ont été retirés des cartes de la grille.
- Vérifications automatisées : données de taille/contact, filtrage mécanique et électrique, sélection exacte depuis la fiche, trois/une activations, absence de collision frontale, Form C, inventaire des huit langues, suite complète et compilation.

Les STEP sont des enveloppes simplifiées du corps, pas des fichiers fabricant ni une CAO détaillée des broches. Les dessins sources restent accessibles. La publication Lovable n’est pas déclenchée par ce lot.
