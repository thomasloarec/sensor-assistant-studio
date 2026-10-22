# Étude — import STEP dans l'atelier 3D (22 octobre 2026)

Statut : **étude uniquement**. Aucun import STEP n'est livré ni annoncé dans
l'interface. L'atelier lit des GLB autonomes ; le lot 2 y ajoute la relecture
des animations rigides d'un GLB.

## 1. Ce que l'on attend d'un import STEP

1. Conserver l'**arborescence d'assemblage** (produits, occurrences), les
   **noms** et les **transformations locales**, pour que les chemins de pièces
   (`0/1/2`) et les montages manuels restent stables.
2. Conserver les **unités** déclarées par le fichier (mm, m, pouce) au lieu de
   les deviner.
3. Garder un lien entre chaque triangle affiché et la **face CAO** dont il vient,
   pour cliquer « une face » et non « un triangle ».
4. Idéalement, connaître la **géométrie analytique** de cette face (plan,
   cylindre, axe, rayon) pour centrer un capteur dans un alésage sans deux clics.

Le STEP **ne garantit pas** la reprise de l'étude de mouvement de la CAO :
contraintes d'assemblage, liaisons et animations SolidWorks / Fusion ne sont
pas transmises de façon universelle par AP203/AP214/AP242. Le mouvement
resterait défini dans l'atelier (saisi, ou GLB animé exporté à part).

## 2. Pistes

### A. Navigateur — `occt-import-js` (OpenCascade compilé en WebAssembly)

Source : https://github.com/kovacsv/occt-import-js

- Lit STEP/IGES/BREP dans le navigateur, sans envoyer le fichier.
- Sortie documentée : arbre `root` → `children` / `meshes`, maillages
  triangulés, et pour chaque maillage des **plages de faces** `brep_faces`
  (`first`, `last`, `color`).
- Essai local indépendant rapporté par le propriétaire : version 0.0.23, sous
  Node, sur **deux petits STEP de contrôle** (cube, enveloppe MK03). Le
  résultat expose `root`/`children`/`meshes` et `brep_faces` avec seulement
  `first`/`last`/`color` ; **aucune définition analytique** de plan, cylindre ou
  axe n'est exposée par cette API.
- Conséquence : piste réaliste pour **visualiser et structurer un assemblage**
  et pour regrouper les triangles d'une même face CAO ; **insuffisante seule**
  pour reconnaître un axe cylindrique exact. Un axe obtenu par ajustement sur
  les triangles resterait une estimation, à présenter comme telle.
- Inconnues : poids du module WebAssembly, mémoire et durée sur de vraies
  machines industrielles, comportement dans le navigateur (seul Node a été
  essayé), unités et noms selon l'exporteur. Rien n'en est déduit ici.

### B. Conversion contrôlée — OpenCascade complet (STEP → GLB + métadonnées)

Source : guide STEP d'OCCT, https://occt3d.com/dev/doc/overview/html/occt_user_guides__step.html

- `STEPCAFControl_Reader` / XDE donnent l'assemblage, les noms, les couleurs et
  les unités ; l'accès BRep (`BRepAdaptor_Surface`) donne le **type analytique**
  de chaque face (plan, cylindre…) et ses paramètres (axe, rayon).
- Produit possible : un GLB (hiérarchie conservée) + un fichier de faces
  analytiques indexé par plage de triangles.
- Contraintes : traitement hors navigateur, donc un transfert du fichier à un
  service. Incompatible avec la politique actuelle (fichier gardé dans
  l'onglet) sans consentement explicite et décision du propriétaire.

### C. Statu quo outillé — export GLB depuis la CAO

- L'utilisateur exporte un GLB (une pièce par nœud, animation éventuelle).
- Aucun nouveau code ; pas de faces analytiques.

## 3. Ce qui devra être testé sur un corpus utilisateur

À constituer avec des fichiers réels fournis volontairement (AP203, AP214,
AP242 ; SolidWorks, Fusion, Creo, CATIA ; quelques assemblages > 500 pièces) :

1. Arborescence et noms : identiques à la CAO, doublons inclus.
2. Unités : déclarées, puis cohérentes avec une cote connue.
3. Transformations : position de 3 pièces de référence vs. la CAO (± 0,01 mm).
4. Faces : un clic sur une face plane / cylindrique sélectionne toute la face.
5. Axes : pour piste A, écart entre l'axe ajusté et l'axe CAO connu ; pour
   piste B, axe analytique exact.
6. Performance navigateur : temps de lecture, mémoire maximale, fluidité de la
   scène, annulation pendant la lecture et libération des ressources.
7. Échecs : fichier corrompu, géométrie manquante, très gros assemblage —
   message compréhensible, ancien montage intact (même transaction que le GLB).

## 4. Critères de choix

| Critère | A. occt-import-js | B. Conversion contrôlée | C. Export GLB |
| --- | --- | --- | --- |
| Fichier reste dans l'onglet | oui | non (sauf consentement) | oui |
| Arborescence / noms | oui (à vérifier sur corpus) | oui | selon exporteur |
| Faces CAO groupées | oui (plages) | oui | non |
| Axe cylindrique exact | non (estimation) | oui | non |
| Cinématique CAO | non | non | non (animation GLB possible) |
| Coût d'intégration | moyen | élevé | nul |

Recommandation provisoire : prototyper la piste A derrière un drapeau interne,
sans l'annoncer, puis décider après le corpus. Aucun solveur CAO universel
n'est promis ; le centre d'un trou reste saisi ou estimé explicitement.
