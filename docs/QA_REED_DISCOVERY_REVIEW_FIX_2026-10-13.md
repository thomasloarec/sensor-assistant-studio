# Correction de revue indépendante — découverte Reed

Base revue : `49eb3df54ec5038b91d3c67d38e6f6196196bd30`. HEAD du code testé : `f3c5e40d477b0f58d94c51983855c61367eb3003` ; cette note peut entraîner une sauvegarde ultérieure.

## Correction factuelle
Le modèle précédent était constitué d'ellipses pédagogiques ad hoc, **pas dipolaire**. Il est remplacé, sans réutiliser d'asset PIC, par la composante axiale absolue d'un dipôle ponctuel schématique :

`F = 80³ × |3 cos(theta) cos(theta-phi) - cos(phi)| / (r³ + 18³)`

Coordonnées relatives au centre `(220,140)`, phi=0 pour parallèle et pi/2 pour perpendiculaire. Constantes exclusivement en unités de scène, sans distance ni calibration réelle. Le disque r<18 est exclu et classé OFF : la représentation d'un dipôle ponctuel n'y est pas valide. Le terme 18³ régularise la réponse extérieure. En perpendiculaire les axes x=0 et y=0 sont exactement nuls, même au centre ; quatre lobes occupent les quadrants. En parallèle la réponse présente deux lobes principaux axiaux et deux secondaires, séparés par les directions nulles `cos²(theta)=1/3`.

Les rayons des contours sont résolus depuis **la même fonction** : `r=(80³×A(theta)/seuil−18³)^(1/3)`. Les secteurs commencent et finissent à leur intersection avec le noyau exclu ; fermeture du contour sur le noyau. Le SVG joint les points analytiques par segments. Tests : chaque point extérieur vérifie son seuil ; erreur de réponse au milieu des segments <0,004. Échantillonnage angulaire concentré vers les extrémités pour satisfaire cette borne, sans affaiblir le test. Contours mémorisés par orientation, non recalculés à chaque déplacement.

Activation 0,5 et relâchement 1/3, mémoire en HOLD et interpolation des déplacements conservées. L'avertissement non calibré demeure visible.

## Progression et présentation
- Une rotation qui ferme le contact avant toute fermeture passe à l'instruction de recul, pas à « trouver un contact » déjà fermé. Une ouverture demande de retrouver ON.
- L'orientation de l'observation HOLD est conservée. La dernière découverte exige ON dans **l'autre** orientation. Un aller-retour d'orientation puis retour dans ON initiale ne termine pas le parcours.
- Une rotation aboutissant réellement à ON dans l'autre orientation peut terminer la découverte ; le simple maintien d'un contact fermé dans HOLD ne le peut pas.
- Légende flexible avec retour naturel à la ligne ; espacements réduits. Réserve latérale de 32 px et aucune découpe de la scène, marge modèle 34 : la poignée de 56 px et son focus restent accessibles aux bords à 320 px. Le modèle/mapping restent indépendants de ces réserves.

## Vérifications exécutées
- Suite finale `bun test tests/` : **1 724 pass, 0 fail, 121 601 assertions, 109 fichiers**. Fichier découverte : 25 tests, dont quatre nouveaux. Anciennes fixtures elliptiques remplacées par la géométrie corrigée explicitement demandée, pas pour masquer un défaut ; autres tests conservés.
- Tests axes morts, quadrants, lobes parallèles, seuils/contours, même point HOLD avec deux historiques, déplacements rapides, rotation avant fermeture, retour frauduleux à l'orientation initiale, rotation vers ON et régression React des consignes.
- Inventaire huit langues : TOTAL 0, untranslated/missing/code-translated/frozen = 0. Aucune nouvelle chaîne ni changement des traductions.
- Contrôles automatiques plateforme : dernière entrée lue **build OK, 09:36:41 UTC** après correction des erreurs TypeScript initiales (`toReversed` incompatible avec la cible, type facultatif exact). `bunx tsgo --noEmit` et build manuels non exécutés : l'environnement interdit de les relancer manuellement ; aucune prétention à un résultat manuel.
- `git diff --check` propre. Quatre scans de charte exécutés : couleurs Tailwind/primitives hors UI vides ; hex et durées limités aux exceptions/dettes préexistantes du root, matériaux Three.js connecteurs et primitives UI. Aucun nouveau résultat.
- Métadonnées des routes inspectées sans modification ; accueil et routes design/internal/standex conservent leurs head. Les sous-pages Standex héritées restent hors périmètre, sans nouvelle correction SEO.

## Navigateur réel et limites
Chromium Playwright, banc temporaire importeur du **vrai composant** depuis Vite, `/tmp/browser/reed/check_review.py`. Pas de copie de la logique ni de modification de l'auth. La home du sandbox est toujours « Accès réservé » ; **recette home intégrée non exécutée**, à réaliser par le propriétaire dans son iframe connecté.

Banc isolé vérifié : 1280/390/320 px sans débordement ; captures examinées des lobes parallèle/perpendiculaire, maintien et bord mobile ; souris ON→HOLD progression 2 ; rotation ouverture ; clavier vers un quadrant ON progression 4 ; tactile Chromium via CDP OFF puis ON ; callback CTA une fois ; mouvement réduit 0 s/none. Les quatre directions poussées à leur limite à 320 px gardent la poignée entièrement dans la carte. Huit langues à 320 px sans texte de contrôle coupé. `touch-action:none` uniquement sur la poignée, `auto` sur SVG ; pas de test de défilement sur un téléphone physique.

Captures locales : `/tmp/browser/reed/hold.png`, `perpendicular.png`, `edge320.png`, `touch.png`, `320.png`, `390.png`, `1280.png`. Le navigateur isolé ne prouve pas la préservation d'un dossier réel ; callbacks et montage existants inchangés.

## Fichiers et traçabilité
Modifiés : `reed-discovery.ts`, `magnet-play.tsx`, `reed-discovery.css`, `tests/reed-discovery.test.tsx`, `AGENTS.md`, `docs/design-language.md`, `roadmap.md`, présent rapport.

SHA256 modèle : `8e06223726e6a6a789124585ebbf264dd3ecd857c2a92c2df9c96e9763c11d49`.
SHA256 composant : `48b980fcf9a8b5fd38a5d80b90957116aafac01cae2963f45d3bfd5f922817b1`.

Aucune publication, déploiement, migration, modification Supabase, NDA, auth ou atelier métier. Aucun accès aux données client.