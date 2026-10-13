# Finition visuelle Reed — 13 octobre 2026

Référence utilisateur : `1fd35762bec9b52c09148c13d995827843c3927e`.

## Périmètre

- Libellé visible « À 90° », traduit dans les huit langues ; nom accessible et infobulle « Perpendiculaire » explicites. Pas de césure ni de réduction de taille.
- Scène à 100 % de la largeur intérieure, marge gauche nulle, débordement visible ; marges de carte conservées (20 px, 12 px sous 359 px).
- Focus de poignée : anneau 3 px, décalage 1 px. La règle globale donnait 3 + 2 px : à 320 px elle dépassait le cadre de 0,61 px. Le décalage réduit protège l'anneau complet sans réduire la scène, la cible ou changer le moteur.
- Moteur, contours, progression, atelier métier, auth, NDA et données inchangés. Aucune publication ni opération backend.

## Vérifications effectuées

- Suite complète : **1 724 pass / 0 fail**, 121 656 assertions, 109 fichiers.
- Après l'ajustement CSS final : **42 pass / 0 fail**, 23 437 assertions, 2 fichiers (Reed et couverture i18n).
- Inventaire : **TOTAL 0**, untranslated/missing/code-translated/frozen tous à zéro ; dictionnaire 3 361 entrées.
- Compilation plateforme : `build OK` observé le 13 octobre à 09:47:51 UTC. Aucun build ni typecheck manuel exécuté : interdits par l'environnement. Aucun résultat distinct de typecheck revendiqué.
- `git diff --check` propre. Scans charte : aucun nouvel écart ; restent les exceptions préexistantes Three.js, theme-color et durées des primitives UI non migrées. Aucun changement de métadonnées de page.

## Navigateur réellement exécuté

Playwright Chromium, vrai composant importé depuis Vite, styles réels, cadre avec les mêmes marges externes et clipping arrondi que la home ; **banc isolé, pas recette de home authentifiée**. Mesures aux quatre bords dans chacune des deux orientations, au clavier, sur 320, 378 et 1 280 px : 24 positions limites. Poignée 56 × 56 px, aimant et anneau complet à l'intérieur du cadre. Défilement horizontal absent.

| Vue | Largeur scène | Taille N/S effective |
| --- | --- | --- |
| 320 px | 264 px | 14,4 px |
| 378 px | 306 px | 16,69 px |
| Desktop 1 280 px, carte max 520 px | 480 px | 26,18 px |

Huit langues vérifiées à chacune des trois largeurs : libellé compact entier, sans clipping, `white-space: nowrap`, nom accessible identique à l'infobulle. Captures 320/378 px relues. Scripts et mesures sous `/tmp/browser/reed-finish/`, non livrés dans l'application. Le mapping pointeur et `touch-action` n'ont pas changé ; aucune nouvelle recette tactile revendiquée.

La première exécution a été interrompue par une navigation de l'aperçu ; relance stable effectuée. Le module de traduction a ensuite été résolu avec son URL Vite exacte pour éviter de tester une seconde instance du dictionnaire.

La recette intégrée finale et les captures dans l'iframe restent au propriétaire, conformément à sa demande.

## Fichiers concernés

`src/components/leadmagnet/magnet-play.tsx`, `src/components/leadmagnet/reed-discovery.css`, `src/lib/i18n/messages.json`, `tests/reed-discovery.test.tsx`, `tests/i18n-coverage.test.ts`, `docs/design-language.md`, `roadmap.md`, ce rapport. Aucun changement de `src/lib/leadmagnet/reed-discovery.ts`.