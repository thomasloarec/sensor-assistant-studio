# Corrections Sensor Studio — 16 septembre 2026

Source de vérité : **Feedback et corrections logiciel_16092026.pdf**, 10 pages.
La numérotation du document contient 24 entrées : 1–10, 12, 12 bis, 13–24.
Il n'y a pas de point 11 à inventer.

## Vérification point par point

| Point | Correction intégrée | Vérification |
| --- | --- | --- |
| 1 | Liens STEP et fiche fabricant sur surfaces claires, texte lisible et grandes cibles. Le STEP reste explicitement un modèle d'encombrement simplifié. | Fiche MK04 ouverte et inspectée visuellement ; destinations STEP/PDF vérifiées. |
| 2 | Les six réponses sont reprises séparément dans les critères et le résumé final, y compris les choix structurés de fixation et de dimensions. | Test texte libre + fixation + encombrement ; inspection des six lignes. |
| 3 | Orientation intrinsèque corrigée pour MK04, MK13, MK02, MK21 et MK05, avec corps actifs face à face et fixations à l'extérieur. Scènes normale, plane et machine cohérentes avec le repère du reed. | Tests des cinq familles, axe et décalage du reed ; inspection 3D. |
| 4 | Mode Face à face réactivé et commandes d'approche espacées. Une pose non caractérisée ne récupère pas les seuils d'une autre pose. | Clic F1 et alerte illustrative ; tests des cinq familles. |
| 5 | Validation principale en tête de l'atelier, vers Résultat. L'état courant est enregistré avant de quitter l'atelier. Actions concurrentes retirées. | Parcours atelier → résultat → Avec Standex, avec câble modifié à 725 mm. |
| 6 | Bloc « Ce que ce résultat ne dit pas » retiré. | Inspection Résultat et régressions d'interface. |
| 7 | Cycle et liste des essais retirés de Résultat. L'historique demeure dans les données et le rapport. | Inspection Résultat ; test du rapport. |
| 8 | Vignettes des capteurs câblés avec deux fils ; aimants sans fils. | Inspection des vignettes et fiches. Les modèles PCB gardent leur représentation propre. |
| 9 | Déduplication des références ; les couples déjà proposés ne réapparaissent pas dans la liste complémentaire. Références inconnues et candidats exclus filtrés. | Test des doublons et inspection de la liste complémentaire. |
| 10 | Titre explicite « Le capteur MK04 + l’aimant M04 devrait détecter votre pièce. », adapté au besoin exprimé. | Titre constaté dans le navigateur. |
| 12 | Longueurs standard tirées des fiches des familles, choix sur mesure en cm, conversion en mm, connecteurs documentés ou référence libre. | Tests catalogue/conversion ; contrôle standard et sur mesure ; synchronisation 725 mm ↔ 72,5 cm. |
| 12 bis | Saisie câble/connecteur regroupée dans la section initiale, sans duplication dans les détails du projet. | Inspection du formulaire final et sélection d'une référence libre. |
| 13 | Le lien câble ouvre réellement le panneau et son dépliant. Longueur saisissable sans GLB ; seul le pointage de surfaces exige un modèle. Réglages avancés accessibles. | Retest du lien depuis Avec Standex et validation de la longueur. |
| 14 | Aimants en deux demi-couleurs rouge/bleu, sans barre orange. Commande de polarité retirée ; les anciennes configurations non caractérisées ne génèrent pas de commutation prédictive. | Inspection 3D et tests de matériau/polarité importée. |
| 15 | Lien du guide corrigé vers la page française des distances d'activation Standex. | URL constatée dans l'atelier. |
| 16 | Import du modèle à côté de la validation en tête ; bloc de couverture demandé retiré. | Inspection atelier. L'import par sélecteur de fichier est limité par l'extension locale, voir ci-dessous. |
| 17 | Volume annuel numérique exact ; plus de substitution par un milieu de tranche. Erreur explicite si la valeur n'est pas un entier. | 12 345 conservé ; 12,5 refusé et PDF désactivé ; tests export/reprise/PostgreSQL. |
| 18 | Véritable PDF A4 brandé Standex, produit sans dépendre d'une revue figée, sans repli Markdown. | Téléchargement depuis l'interface, ouverture par parseur PDF, rendu des trois pages et inspection visuelle. |
| 19 | Bouton « Télécharger le rapport complet du projet (PDF) » après les détails ; projet, coordonnées, montage, essais et NDA inclus. | Inspection du formulaire et du PDF ; données détaillées intégrées en pièce jointe JSON. |
| 20 | Détails visibles : volume, phase, deux dates, durée, contraintes. Choix explicite « Non défini pour le moment », sans valeur inventée. | Saisie phase Prototype, dates 2027-04-01/2027-01-20, durée 7,5 ans ; contenu du PDF vérifié. |
| 21 | Colonne projet structurée : réponses, câble/connexion, détails, export ; coordonnées et envoi regroupés. | Inspection bureau et mobile 390 × 844. |
| 22 | Bloc de demande d'essai laboratoire retiré du formulaire final. | Inspection et test de régression. Les données historiques restent lisibles. |
| 23 | NDA dans une fenêtre modale accessible depuis la case confidentialité ; workflow et consentements existants conservés. | Ouverture/fermeture de la modale et suite NDA existante. Aucune signature réelle effectuée. |
| 24 | Téléphone ajouté au modèle client, à la validation de reprise serveur, au formulaire et au rapport. | Export/reprise JSON, snapshot PostgreSQL et téléphone vérifié dans le PDF téléchargé. |

## Physique et recommandations

Les valeurs publiées des couples documentés restent inchangées. L'orientation
visuelle du boîtier et la position locale du reed utilisent un repère commun.
Face à face est une possibilité de placement ; ce n'est pas une preuve de
caractérisation de cette pose pour chaque famille. Les poses hors référence
restent explicitement illustratives ou à mesurer, sans seuil publié applicable.
Une polarité ou une aimantation non caractérisée ne produit pas de résultat
prédictif par extrapolation. Les couleurs servent uniquement à lire la scène.

La sélection des couples réutilise le moteur de contraintes existant : les
candidats exclus ne réapparaissent pas dans la liste étendue. La validation de
l'atelier synchronise le couple choisi, le dernier montage et le résultat
enregistré ; elle ne se contente pas de changer l'écran.

## Modèle et persistance

Le contrat de dossier existant conserve un snapshot JSON complet et immuable
par version. `business.contactPhone` et `business.undefinedFields` sont des
ajouts optionnels validés à la lecture, avec défauts compatibles pour les anciens
fichiers. Volume exact, dates, phase, longueur et référence de connecteur passent
par ce même contrat, utilisé pour les exports et la reprise des versions serveur.

**Aucune migration DDL nécessaire** : ces champs appartiennent au JSONB déjà
persisté, pas à de nouvelles colonnes. Les fonctions SQL existantes de validation
et de volume annuel ont été exécutées sous PGlite, avec aller-retour JSONB et
vérification des valeurs exactes. Les historiques ne sont pas réécrits. Une
ancienne valeur 500/5 000/20 000 ne peut pas être transformée automatiquement :
elle peut aussi être un vrai volume saisi. Une nouvelle saisie la remplace.

Le rapport imprime les informations utiles et embarque `dossier-complet.json`
(dossier client, données détaillées du montage, états, NDA et contraintes
supplémentaires). Les notes internes sont exclues ; les fichiers binaires importés
ne sont pas incorporés, mais leurs métadonnées sont conservées. Le PDF ne constitue
pas une validation physique ou une signature NDA. Son empreinte SHA-256 porte
sur l'ensemble des données exportées.

## Validation et limites observées

- 939 tests réussis, 0 échec, 83 309 assertions sur 81 fichiers, dont 14 nouveaux
  tests pour ces corrections ; vérification TypeScript et compilation production.
- Inventaire des textes non traduits vide ; contrôles du système de design et
  vérification des différences Git.
- Parcours vérifié dans Chrome : couples, atelier, résultat, finalisation,
  câble sans GLB, F1, réglages avancés, connecteur, volume, dates, téléphone,
  NDA et téléchargement PDF. Inspection bureau et mobile.
- PDF final ouvert, ses trois pages rendues et relues ; volume 12 345,
  câble 725 mm, dates, durée et téléphone vérifiés dans la pièce jointe intégrée.
- **Soumission commerciale réelle vers Supabase non exécutée** : la liaison de
  l'application est active et la session distante affiche le rôle administrateur.
  Les contrats et SQL sont testés localement ; aucune demande n'a été transmise
  aux ingénieurs pour simuler une soumission. Le connecteur Supabase
  accessible correspond à un autre projet et n'a pas été utilisé.
- **Import GLB via navigateur non exécuté** : l'extension Chrome refuse l'accès
  aux fichiers locaux tant que « Allow access to file URLs » est désactivé.
  Les validations de données et les tests existants d'import/placement restent
  verts. Le GLB d'exemple intégré a toutefois été chargé dans l'aperçu distant :
  pointage de la sortie et de la connexion réussi, trajet mesuré à 85 mm.
  Seul le passage par le sélecteur d'un nouveau fichier local reste à recetter
  dans une session disposant de cette permission.

Ces deux limites empêchent de qualifier la recette d'intégration en production
de complète, malgré la validation du code, des calculs et du parcours accessible.

## Livraison

Le commit `94eba8e` est poussé sur `main` du dépôt connecté. Lovable confirme
ce commit comme dernière version prête, sans erreur ; le nouvel écran final
a également été vérifié dans l'aperçu distant, ainsi que l'atelier et le GLB
d'exemple. Après l'alerte initiale de génération, l'API Lovable confirme l'état
`ready` sans erreur et la bonne version est effectivement chargée. Le projet
reste non publié.
