# Sensor Studio 1.2 — vérification de l’aperçu niveau

25 novembre 2026. Branche locale `codex/level-interface-20261125`, base `40935b34`. Ce rapport concerne l’interface expérimentale et ses règles de démonstration, pas une validation du cerveau technique ni un gel de conception.

## Corrections demandées par Thomas

- En-tête commun avec logo, titre renommable, état, langue et menu.
- Barre de progression existante à quatre segments : **Mon besoin / Configuration / Résultat / Avec Standex**.
- Questionnaires basés sur les classes du parcours classique.
- Résultat et Avec Standex basés sur `review-grid`, avec grande colonne gauche et colonne droite de 420 px. Projet et solution en haut à gauche ; détails du projet en bas à gauche ; actions puis coordonnées à droite.
- Réutilisation de `ProjectContextFields`, `IndustryField`, `ConnectorChoices` et du titre de projet extrait sans changement de comportement.
- Disposition propre au configurateur conservée : réglages, mise en situation et piste de famille.

## Contrôles automatisés

| Contrôle | Résultat |
|---|---|
| Vérification TypeScript (`tsgo --noEmit`) | Réussie sur les composants finaux. |
| Construction de l’application (`bun run build`) | Réussie après la correction des classes mobiles et du défilement. |
| Suite complète (`bun test tests/`) | **2 369 réussis, 1 ignoré, 0 échec** ; 338 698 assertions, 185 fichiers, 284,95 s. Le test ignoré nécessite Blender réel. |
| Inventaire des textes (`scripts/i18n-inventory.ts --json`) | Liste vide : aucune traduction manquante détectée. 209 entrées ajoutées, 4 580 entrées au total. |
| Contrôles de charte | Aucune nouvelle anomalie. Les correspondances restantes sont les exceptions existantes : couleur de méta, matériaux Three.js des connecteurs et primitives UI non migrées. |
| `git diff --check` | Réussi. |

La première passe après extraction du titre a révélé un test qui cherchait encore son balisage dans `design-space.tsx`. Le contrôle lit maintenant le composant partagé, vérifie toujours le même balisage et vérifie son import dans DesignSpace. Aucun critère visuel n’a été supprimé.

Les onze tests propres au niveau couvrent les plafonds documentaires, l’ambiguïté LS05 au-delà de 160 °C, les températures inconnues, l’immersion du câble, le comptage distinct points/flotteurs, les combinaisons non couvertes, la géométrie incohérente, le sur-mesure, l’immersion du corps et les dimensions fixes des séries compactes.

## Vérifications dans le navigateur

L’aperçu utilisé est `http://127.0.0.1:5199/level-preview.html`. Les essais utilisent un projet de démonstration, sans envoi externe.

| Scénario | Observation |
|---|---|
| Parcours des trois questions | Navigation avant/arrière et conservation du liquide, des températures, de l’application et de l’immersion. |
| Signal simple | Le changement du niveau fait varier l’état illustratif ouvert/fermé. |
| LS04, quatre points | Deux flotteurs affichés et cinq zones souhaitées ; codage par résistances à définir, sans valeur résistive inventée. |
| Retour au liquide/température | Une modification de 25 à 90 °C conserve les dimensions et les positions, et remplace la piste plastique par une piste LS05 à étudier. |
| Demande continue | Lecture illustrative par pas de 5 mm ; ce pas n’est pas présenté comme une précision garantie. |
| Remplissage animé | Le niveau atteint l’extrémité et la lecture s’arrête. |
| Horizontal avec quatre points | Le besoin multipoint reste intact ; la piste et le signal sont suspendus. Aucun passage automatique à un seul point. |
| LS03 horizontal | Configuration simple et choix de branchement DK conservés. La géométrie de chaque variante reste à compléter. |
| Forme spécifique | Description conservée dans la revue ; câble et connecteur peuvent être renseignés. |
| Pages communes corrigées | Grille mesurée à 744 px + 420 px dans une fenêtre de 1 440 px ; titres, cartes, champs et barre segmentée issus des styles existants. |
| Petit écran | À 390 px, une colonne, aucune largeur débordante : largeur utile et largeur du contenu de 375 px. En-tête commun et titre restent lisibles ; le défilement tient compte de la hauteur réelle du bandeau. |
| Renommage | Le projet renommé « Cuve de démonstration » est conservé dans le brouillon. |
| Données partagées | Câble de 500 mm, volume de 10 000 capteurs/an et phase Prototype conservés de Résultat à Avec Standex. |
| Export local | Le JSON téléchargé contient titre, contexte, quatre positions, deux points par flotteur, câble, volume, phase, pays/ville et notes. Statuts `draft_not_submitted` et `not_qualified`. |
| Langue | Contrôle visuel français/anglais ; libellés du configurateur traduits, puis retour en français. |
| Console | Aucune erreur relevée lors du contrôle final de l’aperçu. |

Le contrôle d’affichage anglais ne constitue pas une relecture métier de toutes les traductions.

## Captures de référence

Les captures finales sont réunies dans `outputs/interface-niveau-2026-11-25` à côté du dossier de travail :

- `01-questionnaire.jpg` : questionnaire et barre commune.
- `04-resultat.jpg` : récapitulatif, câble, données du projet et actions.
- `05-avec-standex.jpg` : récapitulatif et détails à gauche, coordonnées à droite.
- `06-configurateur.jpg` : configuration à quatre points / deux flotteurs.
- `07-avec-standex-mobile.jpg` : disposition mobile.

Les anciennes captures `02-montage-horizontal.jpg`, `03-questionnaire-mobile.jpg` et `07-resultat-mobile.jpg` précèdent la dernière correction d’en-tête. Elles ne font pas partie du dossier de revue final.

## Limites et prochaine revue

- Le site en ligne et l’accueil ne sont pas modifiés. L’entrée de menu et la route sont préparées dans une branche locale. Le parcours complet via le menu d’une session authentifiée n’a pas été vérifié ; l’aperçu local vérifie les composants isolés et le contrôle d’accès existant reste actif.
- La saisie reste en mémoire de l’onglet et peut être exportée. Il n’y a pas encore de sauvegarde/reprise du dossier niveau ni de soumission à Standex.
- Le rendu emploie des volumes et des matériaux physiques, mais n’atteint pas encore le rendu photoréaliste final demandé. Les enveloppes longues et le LS03 restent simplifiés ; les vraies géométries et courses doivent être reprises depuis les plans ou les STEP.
- Les seuils animés expriment le comportement demandé. Densité, hystérésis, flottabilité, charge et défauts électriques ne sont pas simulés.
- Le filtrage de famille est documentaire et partiel. Il ne remplace pas les règles validées du cerveau ni la qualification d’une construction complète par le BE.
- Pour Claude : vérifier en priorité la réutilisation des pages communes, la séparation besoin/illustration/qualification, la conservation des données et le futur contrat de dossier niveau. Les questions BE déjà transmises ne sont pas rouvertes par cette maquette.
