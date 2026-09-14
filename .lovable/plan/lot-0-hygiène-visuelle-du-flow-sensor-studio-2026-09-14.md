# Lot 0 — hygiène visuelle du flow Sensor Studio

## Résultat attendu
- Un seul bandeau compact dans l’espace projet, avec les actions secondaires regroupées dans son menu et le rail des trois étapes toujours lisible.
- Des questions guidées, cartes candidats, résumés et formulaires plus courts et mieux alignés, sans modifier les règles métier.
- Un atelier allégé : un seul bandeau, scène visible plus haut, contrôles sans défilement interne et contenus avancés retirés du parcours client.
- Les données, imports/exports, sélections, sauvegardes et protections existantes restent inchangés.

## Mise en œuvre
1. **Espace projet**
   - Condenser le bandeau `embedded` à 56 px : marque, Sensor Studio, titre éditable, état Brouillon/Envoyé, langue et Menu.
   - Déplacer export, reprise, conservation et réglages détaillés dans le menu existant.
   - Fixer correctement le rail des trois étapes sous le bandeau avec `--standex-header-h`.
2. **Contenu du parcours**
   - Aligner Longueur/Largeur/Hauteur sur une ligne avec suffixe mm.
   - Fusionner les deux divulgations de précision.
   - Uniformiser la largeur des badges du résumé et des états candidats.
   - Simplifier les cartes candidats, déplacer les réserves dans les détails et raccourcir les libellés Choisir/Choisi ✓.
   - Réutiliser `applySensorSelection()` lors du choix, tout en préservant un aimant explicitement enregistré.
   - Remplacer le rappel de câble technique par une phrase courante.
   - Afficher le résumé technique en HTML lisible et normaliser les libellés du contexte projet.
3. **Atelier client**
   - Réduire l’en-tête et l’introduction, déplacer Exporter dans le menu, simplifier l’import de modèle.
   - Supprimer les explications et alertes redondantes ; conserver un seul état Enregistré lié à Joindre au dossier.
   - Retirer le défilement interne de la colonne gauche, sécuriser les boutons Continuer et replier les distances publiées.
   - Limiter le bas de l’atelier au résumé du montage et à la source ; masquer Studio V2 du parcours client sans toucher à `/internal`.
   - Corriger la hauteur du panneau et bloquer le défilement de l’arrière-plan.
4. **Traductions et vérification**
   - Ajouter ou modifier chaque texte via `t()` et fournir les sept traductions.
   - Vérifier le parcours réel en bureau 1440×900 et sur mobile.
   - Exécuter les tests, le contrôle de types, la compilation et les quatre scans de conformité.

## Limites garanties
- Aucun changement dans les moteurs de montage ou de magnétisme.
- Aucun changement de `/internal`, `/standex`, de base, de migration, de secret ou de publication.
