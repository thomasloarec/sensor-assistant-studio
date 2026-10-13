# Reed — raccords ON et état électrique, base 79a282b

## Livraison
- Image annotée examinée : les quatre racines signalées sont maintenant des bandes ON, pas des raccords peints.
- Parallèle : grands lobes allongés conservés, réduction progressive près des racines principales ; gouttes latérales à racine émoussée de 16 unités sous x178/262. Contours internes latéraux construits explicitement.
- À 90° : contours internes explicites, bords proches conservés jusqu'aux attaches sous y122/158. Croix OFF conservée ; son couloir horizontal central est désormais de 28 unités, contre 44, pour permettre le raccord demandé. Aucun disque ON central.
- Les polygones SVG sont ceux du hit-testing. Tous les sommets et milieux d'arêtes ON restent dans leur propre contour extérieur.
- Cyan des lobes inchangé. Deux jetons locaux `.reed-discovery` : état fermé ambré et flux jaune pâle, documentés dans la charte. Traits respectifs 2,5 et 1,5 ; trajectoires, vitesse, visibilité et reduced-motion inchangés. Invitation, textes, huit langues et CTA préservés.

## Recettes
- `bun test tests/reed-discovery.test.tsx` : **33/33**, 24 167 assertions. Bandes principales/latérales parallèles (180 points) et quatre racines à 90° (448 points), ouvert→ON→fermé ; inclusion des contours, HOLD extérieur, OFF légitime, gestes souris/tactile/clavier et huit langues.
- `bun test tests/` : **1 732/1 732**, 122 624 assertions, 109 fichiers.
- Inventaire i18n : **0** manquant/non traduit. `git diff --check` propre. Compilation automatique plateforme : **build OK** ; aucun build/typecheck manuel exécuté.
- Les quatre scans de charte n'ajoutent aucune anomalie Reed. Résidus existants : theme-color autorisé, matériaux Three.js connecteur et primitives UI non migrées ; aucune retouche hors périmètre.
- Navigateur réel, vrai composant chargé depuis Vite, montage isolé sous section immersive à **320/378/1280 px** : deux orientations, ouvert/fermé, opaque/intérieur ; cyan et attaches contrôlés visuellement, poignée 56 px, disparition de l'invitation après flèche et prise.
- Couleurs calculées du flux/lames : `oklch(0.98 0.06 100)` / `oklch(0.82 0.16 85)` ; épaisseurs distinctes, dashoffset change réellement, flux absent ouvert et animation `none`/offset stable sous reduced-motion.
- Captures et script : `/tmp/browser/reed-roots/`, résultat final `final-results.log`.

## Limites honnêtes
Accueil intégré affiche « Accès réservé » : aucune recette connectée revendiquée. Les bandes exhaustives sont vérifiées par tests indépendants moteur ; le navigateur confirme un raccord par orientation aux trois tailles. Une tentative de balayage répété des bandes en navigateur isolé a subi des décalages de position dans le banc à 378 px et n'est pas présentée comme réussie. Le contrôle connecté indépendant du propriétaire reste prévu.

Aucune publication, migration, écriture backend, modification NDA ou atelier métier. Les commits sont enregistrés automatiquement par la plateforme ; ce rapport ne prétend pas créer un commit Git manuel.