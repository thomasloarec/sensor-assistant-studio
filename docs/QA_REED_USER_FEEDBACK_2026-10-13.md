# Retours utilisateur Reed — 13 octobre 2026

Base demandée : `44b443c227767817e170e1d98794587a25534898`.
Commit du code testé : `d20e74c44e7358300f8b962802ba3815552bdbb8`. Cette note et la clôture de feuille de route peuvent entraîner une sauvegarde ultérieure automatique ; aucun commit Git créé manuellement.

## Modèle pédagogique et rendu

Le changement du moteur est explicitement demandé dans ce lot. La réponse est maintenant

`F = 80³ × A(θ) × r³ / (r³ + 18³)²`.

`A` conserve la réponse axiale absolue parallèle/perpendiculaire, multipliée par une fenêtre : zéro à moins de 0,10 rad d'une direction nulle ; raccord smoothstep jusqu'à 0,16 rad ; réponse originale au-delà. Quatre lobes par orientation, nulls exacts et seuils 0,5 / 1/3 conservés. Un contact précédemment fermé se relâche dans ces couloirs : ce n'est pas un masquage graphique.

La régularisation radiale continue annule la réponse au centre et remplace le disque exclu. Les deux racines analytiques en `u=r³` donnent les limites interne et externe de chaque zone. Aucun arc circulaire constant, disque opaque ou masque central. Les contours remplis suivent les deux limites ; seuls les arcs externes portent un trait. Modèle dimensionless et volontairement pédagogique, pas calibration physique ni qualification produit ; aucune copie PIC.

Suppression du manchon de câble et du reflet en vue intérieure. Câble raccordé directement au boîtier. Fermé, contour du boîtier et lames prennent le signal ; des tirets parcourent le câble et les contacts visibles. Courant des contacts monté uniquement fermé **et** intérieur. Ouvert, aucun courant ; HOLD conserve exactement l'état mémoire. En mouvement réduit les tirets sont immobiles et le contour de signal demeure. Pas de LED intégrée, étincelle ou dépendance nouvelle.

Zones visibles par défaut, commande « Champ magnétique » au singulier traduite dans les huit langues ; légende visible « Zones de commutation indicatives ». Cardinalité du dictionnaire inchangée : 3 361 clés, remplacement de la clé devenue inutilisée, pas ajout.

## Résultats exécutés

- `bun test tests/reed-discovery.test.tsx` : **30 pass, 0 fail, 47 244 assertions**.
- `bun test tests/` : **1 729 pass, 0 fail, 145 701 assertions, 109 fichiers**.
- `bun scripts/i18n-inventory.ts` : **TOTAL 0**, untranslated/missing/code-translated/frozen = 0.
- Dernière compilation automatique inspectée : **build OK, 10:11:21 UTC**. Aucun lancement manuel de build ou de typecheck, interdit par l'environnement ; pas de prétention à un résultat tsgo indépendant.
- `git diff --check` propre. Scans couleurs Tailwind et primitives hors UI vides. Hex limités au theme-color du root et matériaux connecteurs préexistants ; durées littérales limitées aux primitives UI préexistantes. Aucun nouveau résultat dans le module Reed.
- Attentes historiques « zones initialement masquées » / « Voir les zones » remplacées parce que le propriétaire a explicitement changé ces exigences. Tests hystérésis, progression, interpolation et gestes conservés, non affaiblis.
- Ajouts : OFF depuis fermé autour de chaque null aux rayons 5/12/18/24/40/75, contours internes sur seuil, erreur au milieu de leurs segments <0,004, absence de fermeture circulaire constante, courant conditionnel dans les deux vues et HOLD dans les deux historiques.

## Revue visuelle réelle — limites explicites

Chromium Playwright sur localhost, script `/tmp/browser/reed-feedback/check_feedback.py`. La vraie home renvoie **« Accès réservé »** ; aucune connexion contournée ni donnée client ouverte. Recette intégrée home/dossier non exécutée : le propriétaire la termine dans son iframe connecté.

Le banc isolé importe le **vrai composant** et les CSS depuis Vite, dans la même surface immersive, largeur extérieure max 520 px et marge de page 16 px, avec overflow de carte réaliste. Pas de copie du moteur. Une première tentative de capture des langues utilisait une seconde instance de module Vite et restait française ; les captures finales ont été refaites avec l'instance de langue réellement importée par le composant, et les labels traduits sont vérifiés par assertion avant capture.

- Captures ouvert/fermé × intérieur/extérieur à **1280, 378, 320 px**, examinées ; quatre lobes et séparations, pas d'anneau central parasite ni manchon. Pas de débordement horizontal.
- Scène : **480 / 306 / 264 px**. N/S : **26,18 / 16,69 / 14,4 px** au rendu. Poignée 56 × 56 px ; quatre bords avec réserve focus 4 px entièrement dans la carte aux trois largeurs. Commandes ≥44 px.
- Souris ON → HOLD fermé → OFF → même HOLD ouvert ; clavier vers les quatre limites ; tactile CDP ON puis OFF sur axe mort ; orientation perpendiculaire ON puis couloir OFF proche du centre (222,165) vérifiés. Pas de test de téléphone physique.
- Animation CSS câble **1,8 s** quand fermé, contacts uniquement dans l'intérieur ; absence des éléments ouverts. Mouvement réduit : animation `none`, signal statique visible. Aucun mouvement des zones.
- Huit langues à 320 px : libellé « Champ magnétique » réellement traduit, captures finales conservées. CTA appelé une fois. Le montage partagé de DesignSpace et son callback restent inchangés ; la préservation d'un dossier réel n'est pas prouvée par le banc isolé.
- Erreurs JavaScript capturées : **0**.

Captures : `/tmp/browser/reed-feedback/{320,378,1280}-{exterior,interior}-{open,closed}.png`, `perpendicular-gap-open.png`, `reduced-motion-closed.png`, `locale-{fr,en,zh,de,es,ru,it,ja}.png`, `home-access.png`.

Relecture indépendante du code : contours/réponse et mémoire cohérents. Le réglage Maj pour affiner et les coordonnées initiales existaient avant ce lot, inchangés. Métadonnées de toutes les routes inspectées : accueil/design/internal et layout Standex ont leurs heads ; sous-pages Standex héritées sans head spécifique restent une dette préexistante hors périmètre, non corrigée ici.

## Fichiers changés depuis la base

- `src/lib/leadmagnet/reed-discovery.ts`
- `src/components/leadmagnet/magnet-play.tsx`
- `src/components/leadmagnet/reed-discovery.css`
- `src/lib/i18n/messages.json`
- `tests/reed-discovery.test.tsx`
- `AGENTS.md`
- `docs/design-language.md`
- `roadmap.md`
- `docs/QA_REED_USER_FEEDBACK_2026-10-13.md`

Empreintes SHA256 du code testé :

- moteur : `97812e6bdb0eb20e68fa90e86c4d10ac76d462b618160ae191ba81e187fc3deb`
- composant : `fc9d87366dca0233002636fef79265606a1820fc7d45498d8b385c99a8f1d137`
- CSS : `1a03cb256e743bcd0ebef544b4112e9fccff05390d52f865809fcfd3b7d8e56a`

Aucune publication, migration, modification backend, NDA, auth, dossiers ou atelier métier. Exploration en mémoire du composant, aucun transfert ajouté.

## Finition du flux — 10:17 UTC

Recette indépendante sur l'accueil connecté fournie par Thomas : lobes, défaut, raccord et contour extérieur validés ; tirets des contacts auparavant confondus avec les lames. Correction locale CSS : flux partagé câble/contacts `--heading`, largeur 1,5 ; lames fermées inchangées `--signal`, largeur 2,5. Moteur et SVG inchangés.

Playwright sur le vrai composant isolé (accueil sandbox toujours « Accès réservé »), script `/tmp/browser/reed-current/check_current.py` : style calculé flux `oklch(0.985 0.004 250)` / `1.5px`, lames `oklch(0.72 0.13 205)` / `2.5px`. Sur 350 ms, dashoffset contacts `0 → -1.30003px`, câble `-0.278696 → -3.53556px` ; différence de couleur/épaisseur et mouvement vérifiés par assertions. Reduced-motion : animation `none`, offsets `0 → 0px` pour les deux flux sur 350 ms. Ouvert : les deux éléments disparaissent ; opaque fermé : câble seul. Quatre captures de scène examinées dans `/tmp/browser/reed-current/` (`interior-closed`, `interior-reduced`, `interior-open`, `exterior-closed`). Aucun pageerror.

Tests ciblés : **31 pass, 0 fail, 47 249 assertions** ; compilation automatique **build OK à 10:18:03 UTC**. Suite complète antérieure non relancée pour cette finition demandée locale. Changements de finition : CSS, test ciblé, documentation de design, feuille de route et cette note ; aucune publication.