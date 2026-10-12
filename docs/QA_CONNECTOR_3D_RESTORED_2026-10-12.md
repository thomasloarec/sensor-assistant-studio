# Aperçus connecteurs restaurés — 12 octobre 2026

Base : `29fcf32bd5b9613d33b8d6e79ae07c78f0891361`.
Code testé : `d492f1932f4b7e99bdb27a18f729f64a7fa85eea` (avant ce rapport et les dernières consignes documentaires).

## Correction ciblée
- `connector-choices.tsx` : quatre ConnectorPreview visibles avant sélection dans une grille à deux colonnes. Bouton natif frère du visualiseur, jamais parent. Nom, voies/pas, encombrement, aria-pressed et coche restent concis.
- Aucun aperçu supplémentaire dans les détails ; ConnectorGeometryDetails conserve les quatre descriptions, sources et limites.
- Les deux points d’entrée DesignSpace gardent leurs callbacks. Boîtiers, données enregistrées, NDA et backend inchangés.
- `tests/questionnaire-render.test.tsx` : neuf recettes supplémentaires (huit langues et conservation du choix), adaptation de la recette DesignSpace et restauration des globals Happy DOM avant chaque test.
- Documentation : design-language, AGENTS, consignes des composants et roadmap alignés.

## Résultats exécutés
| Contrôle | Résultat |
| --- | --- |
| `bun test tests/` | **1 458 pass, 0 fail, 96 649 assertions, 105 fichiers, 39,99 s** |
| `bun scripts/i18n-inventory.ts` | **0 anomalie**, huit langues |
| `git diff --check` | Aucun problème |
| Vérification automatique plateforme | **build OK**, dernier signal disponible 12:58:04 UTC |

Première exécution : dix échecs de harnais (globals DOM supprimés par une autre suite puis langue non réinitialisée). Correction des tests seulement ; suite complète relancée verte. Aucun test.failing ajouté.

Les commandes manuelles `bunx tsgo --noEmit` et `bun run build` ne sont pas relancées : l’environnement impose ses vérifications automatiques. Aucun résultat séparé de contrôle des types revendiqué ; seul « build OK » est exposé.

Charte : aucune couleur Tailwind brute ni ancien contrôle hors primitives UI. Les scans retrouvent seulement la meta theme-color documentée, les matériaux Three.js et les primitives UI non migrées préexistantes. Aucun nouvel écart.

## Preuves et limites
- Montage réel du sélecteur et questionnaire : quatre aperçus hors boutons et détails fermés, silhouettes distinctes, alvéoles correctes, boutons natifs focalisables, aria-pressed unique, gestes/clic sur aperçu sans sélection, choix conservé après remontage, quatre sources dans les détails, aucun cinquième aperçu.
- Happy DOM force le SVG : il ne prouve ni rendu WebGL ni activation clavier navigateur réelle. Focus et sémantique des boutons natifs vérifiés.
- ConnectorPreview et scène inchangés : lazy rendering, IntersectionObserver, budget partagé de quatre contextes, libération, mouvement réduit et perte de contexte conservés. Tests existants du budget inclus dans la suite verte. D’autres vignettes peuvent occuper les places ; SVG affiché jusqu’à disponibilité.
- Navigateur sans connexion : `/design` redirige vers `/`, **Accès réservé**. Capture examinée, mais **aucune capture de connecteurs ni recette WebGL desktop/mobile authentifiée**. Aucun contournement ni connexion utilisateur.
- Illustrations d’encombrement conservées : ni CAO qualifiée ni brochage.
- Skill suivie : **3d-game**, séparation contrôles DOM/visualiseur existant.

**Aucune publication, aucun déploiement, aucune migration ni modification de données externes.**