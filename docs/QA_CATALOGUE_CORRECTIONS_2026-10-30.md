# Recette des corrections catalogue et atelier — 30 octobre 2026

Base : `6090b28` (PR #11 intégrée). Branche : `codex/workshop-catalogue-corrections`.

- Onglets du catalogue alignés avec les marges de l’en-tête ; champ de recherche pleine largeur et texte saisi visible.
- Filtres : aucun débordement horizontal du popup à 390 × 844 ; organisation vérifiée à 768 × 1024 et 1920 × 1080, en français et en anglais.
- Filtre « Insertion dans un alésage » : MK03, MK14, MK18, MK20/1, MK20/2 ; les trois Press fit conservent leur catégorie.
- MK14 puis MK18 sélectionnés après MK04 : aimant rouge à une extrémité et bleu à l’autre, sans coupure longitudinale. Le matériau est recréé quand la géométrie change.
- Custom : boîtier opaque puis transparent via « Voir les contacts » ; PCB opaque dans les deux cas. Centre du reed et exclusion carte/surmoulage vérifiés numériquement ; rendu 2D cohérent.
- Distance capteur–aimant cochée initialement : décocher retire effectivement l’annotation, recocher la restaure.
- Titre « Magnet characteristics » visible en anglais et « Caractéristiques de l’aimant » en français.
- MK36/MK37/MK38 : lobes affichés après calcul, sans erreur de console ; coupe du MK37 étendue à ±48 mm (graduations ±45). Captures conservées dans le dossier local `outputs/catalogue-corrections-20261030` du projet parent.

## Calcul indicatif des variantes N42

L’utilisateur a choisi explicitement l’approximation par la même famille. Les moments de champ sont 49, 75 et 101,5 (unités du catalogue Packaged-Magnets) ; le moment documentaire de chaque variante N42 reste `null`. Le modèle expose séparément `fieldMoment`, `familyAnalogy` et `familyMagnet` et cite le catalogue source. Le bandeau signale l’approximation. Une estimation nominale forte ne devient jamais un placement favorable lorsque le moment est inconnu.

La version catalogue passe de 4.0.0 à 4.1.0. Les seuils C1 %, les distances publiées, le moteur historique et les poses importées sont inchangés. Le domaine affiché passe à ±48 mm pour les corps Press fit ; la limite physique de 60 mm du moteur reste applicable. Au départ du MK38 frontal, un centre au-delà de cette limite reste indisponible, sans fermeture forcée. La réserve existante sur la distance frontale publiée reste affichée.

## Validation

- Suite complète : **2 136 tests réussis, 0 échec**, 145 fichiers, 220 109 assertions.
- Vérification TypeScript : réussie.
- Compilation de production : réussie.
- Après la finition des couleurs du repli SVG avec les jetons existants : **12 tests ciblés réussis**, 0 échec.
- Contrôles de charte : uniquement les exceptions déjà présentes (matériaux Three.js, meta theme-color et primitives UI non migrées). Aucun nouveau jeton.
