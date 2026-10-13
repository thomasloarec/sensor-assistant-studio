# Découverte Reed — réalisation et recette du 13 octobre 2026

## Périmètre et révision
Base inspectée : `1f2770d04d484787a79178bbf458e7d4bf83aa7c`.
HEAD observé après sauvegarde automatique : `2ba2b3325f165fa6567b773cfe04e5272456d31a` (les notes finales peuvent créer une révision ultérieure).
Pas de publication, déploiement, migration, accès aux données client ou modification Supabase/NDA/auth. Aucun changement des dossiers ni de l'atelier métier. Aucune dépendance ajoutée.

## Livré
- MagnetPlay remplacé par un capteur générique complet en boîtier avec câble. Aucune référence produit ni calibration, distance en mm ou LED fictive.
- Aimant N/S mobile en 2D, deux orientations, commandes zones/intérieur indépendantes du contact, symbole de contact extérieur accompagné du texte.
- Boîtier opaque initialement ; intérieur translucide facultatif et lames réellement jointes seulement lorsque fermé.
- Progression : fermeture, arrêt dans HOLD après fermeture, changement d'orientation puis nouvelle zone ON. Une fermeture seule ne valide pas l'hystérésis.
- CTA raccordé directement à `openWorkspace`. Home et DesignSpace restent montés comme avant ; aucun stockage de la découverte.
- FR, EN, ZH, DE, ES, RU, IT, JA : commandes, progression, aria et limites traduits. N/S restent des codes.

## Modèle partagé, limites physiques explicites
Géométrie pédagogique déterministe, pas un simulateur constructeur : deux ellipses par orientation. Réponse sans unité `max(1/(1+q))`, q = rayon elliptique au carré. Activation 0,5 ; relâchement 1/3. ON = q≤1 ; HOLD = 1<q<2 ; OFF = q≥2. Les contours SVG sont les mêmes niveaux analytiques, pas une deuxième approximation décorative. Les hachures sont le périmètre de maintien et non des lignes de champ. Le trajet ne modifie jamais les contours.

Déplacements interpolés par segments de deux unités de scène au maximum pour ne pas manquer ON entre événements. État précédent conservé en HOLD. Progression indépendante de la visibilité des zones et de l'intérieur. Mapping via inverse de `getScreenCTM`, donc respect du viewBox et des marges de centrage. Poignée HTML du socle 56×56 px, capture avec décalage de prise, pointerup/cancel/lostcapture, pointeur primaire uniquement. `touch-action:none` sur la poignée seule, `auto` sur la scène. Flèches dans les deux axes ; Majuscule pour affiner.

## Résultats réellement exécutés
| Vérification | Résultat |
|---|---|
| `bun test tests/reed-discovery.test.tsx` | 21 pass, 0 fail, 331 assertions |
| `bun test tests/` final | **1 720 pass, 0 fail, 98 765 assertions, 109 fichiers** |
| Historique | 1 699 tests conservés ; 21 nouveaux |
| `bun scripts/i18n-inventory.ts` | TOTAL 0 ; untranslated/missing/code-translated/frozen = 0 |
| Dictionnaire | 3 360 entrées ; 16 nouvelles, sept traductions chacune |
| `git diff --check` | propre |
| Compilation automatique plateforme | `build OK` observé, dernière entrée 09:26:36 UTC |
| `bunx tsgo --noEmit`, `bun run build` manuels | Non exécutés : interdits dans cet environnement, qui lance automatiquement ses contrôles. Pas de résultat manuel inventé. |

Attente de cardinalité i18n mise à jour de 3 344 à 3 360 uniquement ; aucune attente métier existante modifiée, aucun test supprimé ou marqué expected failure.

## Navigateur réel : exécuté, mais composant isolé
Playwright Chromium via `/tmp/browser/reed/check_reed.py`, contre Vite localhost. L'accueil réel reste **Accès réservé** sans session ; aucun contournement d'authentification. Un banc temporaire exclusivement dans le navigateur importe le vrai MagnetPlay React, son modèle et ses styles pour tester la scène indépendamment. Aucun fichier de banc n'est livré au site.

Vérifié dans ce banc :
- 1280 px desktop et 390/320 px mobile : captures examinées, pas de débordement, textes des contrôles sans coupure ; cibles ≥44 px, poignée 56 px.
- Souris avec CTM réel : ON puis HOLD, contact fermé et progression 2.
- Changement d'orientation : ouverture ; flèches : nouvelle ON et progression 4.
- Événements tactiles Chromium réels via CDP : départ OFF ouvert puis retour ON fermé.
- Mouvement réduit : transition 0 s, animation none pour le pouce.
- Huit locales à 320 px : aucun débordement ni texte de bouton coupé.
- CTA isolé : callback appelé exactement une fois.

Captures temporaires : `/tmp/browser/reed/320.png`, `390.png`, `1280.png`, `hold.png`, `perpendicular.png`, `touch.png`, `ja.png`. Le banc n'établit **pas** une recette de la home connectée, du brouillon réel, de ses échanges ou de la composition complète du hero. Ces vérifications nécessitent la connexion du propriétaire. La conservation du composant DesignSpace et le raccord du callback sont couverts par les tests et la modification d'une seule ligne de la home.

## Charte
Scans prescrits exécutés : couleurs Tailwind brutes = vide ; primitives hors UI = vide. Aucun nouveau résultat hex/durée brute. Exceptions préexistantes : theme-color exact du root, couleurs matériaux Three.js de connector-preview-scene, durées des primitives UI non migrées. Ces éléments n'ont pas été modifiés. Les textes N/S du SVG utilisent des unités du viewBox, conformément à l'exception documentaire existante des schémas SVG. Toutes les couleurs/rayons/transitions CSS nouvelles utilisent les jetons existants.

Métadonnées de l'accueil inspectées : titre, description, og:title/description/type, twitter:card, noindex conservés. Pas d'image absolue de couverture. Les routes internes héritées n'ont pas été modifiées dans ce lot.

## Fichiers modifiés ou ajoutés
- `src/components/leadmagnet/magnet-play.tsx`
- `src/components/leadmagnet/reed-discovery.css` (nouveau)
- `src/lib/leadmagnet/reed-discovery.ts` (nouveau)
- `src/routes/index.tsx` : callback existant uniquement
- `src/lib/i18n/messages.json`
- `tests/reed-discovery.test.tsx` (nouveau)
- `tests/i18n-coverage.test.ts` : cardinalité
- `docs/design-language.md`, `AGENTS.md`, `roadmap.md`, présent rapport

SHA256 des trois fichiers principaux :
- MagnetPlay : `bdd935fa87f9d1f289de8b277331b50dd2bbdca534cc1d7138aa7a31849e9f0c`
- Modèle : `bd5cf999cdaa0b6335269b152b92f547ad54eeedb94e496bd4c85258d557bfe4`
- CSS : `001c504f02c5729cfde14ee116cebdf2ed1c6e9821cd0d81b831668a0438ee27`