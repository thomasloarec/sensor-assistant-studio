# Atelier — correction UX ciblée, 23 octobre 2026

## Périmètre et sécurité

Charte Standex DETECT appliquée. Aucun téléchargement de desk.glb ou du modèle
Sketchfab, aucune publication, aucun changement backend/auth/questionnaire,
aucune migration ou modification des données de détection. La recette du vrai
fichier desk.glb reste celle du propriétaire ; ce rapport ne prétend pas l'avoir
exécutée. Géométrie, chemins persistants, clips et calculs existants conservés.

## Livraison

- Commandes : une seule colonne défilante, 360–400 px sur ordinateur ; parcours
  et arbre dans le même flux. Étapes opaques collantes, contenu remis en haut
  lors d'un changement d'étape. Sources, résumé et outils secondaires déplacés
  dans ce même flux, scène et chronologie hors défilement.
- Petit écran : sélection d'étape et cadrage par contrôles natifs ; actions
  d'import/résultat repliables ; scène, timeline et commandes sans superposition.
- Fichier statique : absence d'animation explicitée. X/Y/Z et course accessibles
  sans ouvrir les valeurs précises. Aucun axe n'est imposé lorsqu'une course
  est saisie sans direction. Course zéro : prochaine action à côté du champ.
- Validation explicite inchangée ; Voir ouvert/Voir fermé après validation.
  Suivant depuis Installation vers Essai désactivé si le mouvement n'est pas
  prêt ; accès direct Essai possible mais avertissement explicite.
- Isolation : état « Pièces fixes masquées », Tout afficher dans le parcours ;
  Installation restaure automatiquement le châssis, sans modifier la sélection.
- Arbre simplifié : seuls les parents sans mesh à enfant unique sont masqués.
  Chaque mesh conserve son identité et son chemin ; l'arbre complet reste
  accessible. Aucun changement de géométrie ou de persistance.
- Cadrage : ensemble, pièces mobiles, capteur et aimant à la pose courante.
  Transformation commune avec la scène ; déplacements caméra seuls, suivi de
  cible sans réinitialiser le zoom à chaque rendu. Boîtes de géométrie réutilisées,
  aucun échantillonnage/copie des nœuds. Choix d'axes de vue supplémentaire non
  ajouté : 3D et vue plane existantes conservées.
- Installation : support nommé fixe/mobile/animé conservé ; action explicite
  pour cliquer une autre face. Montage mobile légitime non interdit. Alignement,
  profondeur, offset, rotation dans le plan et traversant restent accessibles.
- Annulation : « Annuler le dernier réglage », et non Cancel.
- 19 clés ajoutées, avec sept traductions chacune (total 3 585). Les clés exactes
  « Aperçu de la position » et « Choisir le placement avec Standex » évitent le
  repli sur les modèles génériques qui produisait les libellés hybrides.

## Tests et compilation

- `bun test tests/` : **1 842 pass, 0 fail**, 116 fichiers, 128 555 assertions.
- Cinq nouveaux tests comportementaux : saisie sans axe ne choisit pas X ;
  Z + 300 mm reste draft puis validation et positions 0/0,5 ; Installation
  restaure le fixe sans changer les mobiles ; arbre de quatre meshes indépendant
  sous wrappers techniques ; cadrage mobile à 0/300 mm sans mutation du montage.
- Tests historiques de disposition adaptés aux exigences nouvelles, sans
  affaiblir les tests de transformation ou de calcul.
- Inventaire i18n, complétude et paramètres des huit langues passent.
- Validation automatique plateforme des types et compilation : dernier signal
  `build OK` du 23 octobre à 07:59:23 UTC. Les commandes manuelles tsgo/build
  ne sont pas relancées, conformément au fonctionnement de l'aperçu.
- Scans : aucune couleur Tailwind brute, aucun text-xs / border-input hors UI.
  Aucun nouveau écart dans les fichiers touchés. Six hex existants (theme-color
  documenté + matériaux de connecteur Three.js) ; six durées existantes dans
  les primitives UI non migrées. Rien modifié hors périmètre pour ces écarts.

## Recette navigateur réelle

Chromium sur `http://localhost:8080`, **sans route de recette temporaire ni harness** :

1. Accueil → Commencer → Menu → Atelier 3D : vrai DesignSpace et vrai
   WorkspacePanel `.workspace-panel-bare`.
2. Mode autonome existant : `/internal` → Atelier magnétique. Aucun changement
   de ces pages ou de leur logique.
3. Le portail privé requiert une session : accès simulé localement uniquement
   via interception de `/auth/v1/user`, autres appels au serveur bloqués.
   Aucun compte réel/session réelle/donnée privée utilisé. Ce test ne valide
   donc ni connexion réelle ni opérations serveur.
4. Import **par le champ fichier de l'interface** de la démo autonome
   `demo-tiroir-deux-pieces.glb`, pas téléchargement du modèle utilisateur.
5. Sélection indépendante dans l'arbre ; Isoler ; passer à Mouvement ; état
   masqué constaté ; choix Z, course 300 mm, validation, Voir ouvert = 300 mm.
6. Cadrer mobile, capteur, ensemble ; Installation réaffiche le fixe.
   Clic dans la scène : attache réelle créée sur **Support : pièce fixe Dessus**,
   avec offset/spin et action Changer de support visibles (deux modes).
7. 390 px : course changée à 250 mm puis validation et Voir ouvert = 250 mm,
   scène et chronologie restent dans l'écran pendant le défilement des commandes.
8. Anglais : véritable étiquette de slider **Position preview** constatée.
9. Mouvement réduit activé pour la recette : commandes manuelles fonctionnelles.
10. Aucun `pageerror` dans les deux modes.

### Dimensions observées

| Mode | Fenêtre | Scène | Colonne de commandes | Timeline |
|---|---|---|---|---|
| Intégré | 1920×945 | 1472×520 px | 398 px intérieur, un scroll | 73 px |
| Intégré | 1366×768 | 958×343 px | 358 px intérieur, un scroll | 73 px |
| Intégré | 390×844 | 374×186 px | 372 px intérieur, un scroll | 73 px |
| Autonome | 1920×945 | 1472×482 px | 398 px intérieur, un scroll | 73 px |
| Autonome | 1366×768 | 958×333 px | 358 px intérieur, un scroll | 73 px |
| Autonome | 390×844 | 374×186 px | 372 px intérieur, un scroll | 73 px |

Les hauteurs de l'en-tête peuvent varier après chargement des fontes ; la scène
absorbe cette variation. Aucun débordement horizontal observé dans les
conteneurs de scène/commandes ; timeline intégralement dans chaque fenêtre.
Contraste mesuré étape active sur surface opaque : **14,32:1** dans les deux
modes. Les autres commandes emploient les jetons sémantiques existants ; toutes
les combinaisons de contraste n'ont pas été mesurées individuellement.
Captures et scripts de recette conservés sous `/tmp/browser/workshop-ux/`.

## Limites précises

- desk.glb réel non testé ici, non téléchargé ; sélection et placement du modèle
  Sketchfab restent à vérifier par le propriétaire dans sa session réelle.
- 1920×889 non rejoué séparément ; 1920×945 et 1366×768 couverts.
- Sur téléphone, la scène mesure environ 186 px pour laisser place au parcours :
  zoom/cadrage explicite disponible ; pas de promesse d'ergonomie équivalente au
  grand écran pour chaque face d'une grande machine.
- Zoom manuel non réinitialisé par le rendu : architecture vérifiée ; pas de
  mesure instrumentée du zoom sur un clip utilisateur dans cette recette.
- L'étiquette anglaise de délégation est couverte par le dictionnaire/inventaire,
  non cliquée dans le parcours des candidats.
- Aucun résultat physique validé ; toutes les limites illustratives et sources
  existantes sont conservées, même si le verdict détaillé est compacté sur mobile.
- Aucun identifiant de commit annoncé avant la sauvegarde automatique de ce tour.
