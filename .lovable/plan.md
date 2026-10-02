# Refonte visuelle du questionnaire client

## Objectif
Recomposer uniquement la présentation des six questions, sans modifier les réponses produites, les règles métier, l’atelier, l’écran avancé, la persistance ni les échanges serveur.

## Modifications
- Conserver le sélecteur d’étapes actuel à l’identique et retirer seulement ses sous-textes visibles.
- Élargir et resserrer la carte du questionnaire avec une composition responsive : rappel du résultat attendu au-dessus, en-tête question/catégorie, progression inchangée, question plus lisible, réponse et aide en deux colonnes sur grand écran puis une colonne sur mobile.
- Ajouter le libellé traduit « Votre réponse » au champ existant, sans changer sa valeur, son placeholder ou son gestionnaire.
- Remplacer les flèches des exemples par une pagination numérique accessible et strictement manuelle, en conservant tous les exemples existants.
- Regrouper les champs structurés existants dans « Précisions facultatives », ouvert lorsque des contraintes existent, sans démonter ni effacer les champs au repli.
- Replacer « Je ne sais pas encore », la confirmation d’hypothèse et « Ajouter une précision » avant la navigation finale, avec les mêmes actions et états.
- Documenter cette composition et sa pagination dans le langage de design.

## Vérification
- Étendre le test du vrai composant pour couvrir les six questions, saisie puis retour, passage vide, délégation, confirmation d’hypothèse, montage et dimensions, précision globale, passage final et changement de langue.
- Comparer les données exportées après les mêmes interactions afin de prouver la parité des sorties.
- Vérifier le rendu à 320/390 px et sur ordinateur si l’aperçu authentifié est accessible, sans contourner l’accès.
- Exécuter toute la suite `tests/`, les types, la compilation, l’inventaire i18n et les contrôles visuels prescrits par le projet.

## Limites
Aucune publication, migration, écriture de données client, nouvelle validation ou modification du fonctionnement existant.
