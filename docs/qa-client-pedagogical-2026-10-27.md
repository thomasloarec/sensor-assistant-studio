# QA — intégration pédagogique client, 27 octobre 2026

## Livraison et périmètre

- Intégration examinée : `a7778c80f82645b801759213e8bf9a23ae6bdcaa`, base scientifique `9488f7a379d0f1ecf85ae1bd68652e53a037cc16`.
- Commit des tests complétés observé avant ce rapport : `90c2633a344a4566913bcfa53805bef79224bd75`. Le commit automatique de ce rapport est nécessairement postérieur ; il est à lire dans l’historique, sans fabriquer un SHA autoréférent.
- Préversion racine : https://id-preview--9aff67a3-e0d0-4a40-95e1-da809f7ff333.lovable.app/
- Aucun appel de publication, migration, écriture de données réelles, changement d’authentification ou contournement d’accès. Thomas prend en charge la recette navigateur dans sa session (instruction du 27 octobre à 15:02 UTC).
- Contre-revue intégrée : contexte générique persistant près du verdict et en-tête distinct, statut produit non affecté par l’exploration, réglages mécaniques/environnement réintroduits progressivement, câble déconnecté pendant exploration, restauration outil/guide/historique/temps et annulation des imports en cours. Aucun moteur changé.

## Ce qui fonctionne et ce que cela ne prétend pas faire

Le même `MagneticWorkshop` est raccordé à l’étape 2 du `DesignSpace` client. Le retour produit indisponible est désormais une trace locale conservative versionnée du dossier et de son export/reprise, liée à l’identité/configuration et marquée `qualified:false`. Les anciennes prédictions binaires sont déclassées lors du nouvel essai ; le DTO n’exporte pas de computed binaire pour cette trace, et le rapport ne recalcule pas de détection prévue. Aucun favorable exploratoire n’est copié. Le couple produit reste conservé, les boîtiers indisponibles et les guards inchangés.

**Aucun boîtier nommé n’a actuellement d’adaptateur reed-66 par face suffisamment sourcé.** L’estimation attribuée au produit est donc indisponible, même avec un aimant pilote. Il manque : variante reed 66 sourcée, orientation du reed dans le boîtier et repères documentaires par face permettant un adaptateur explicite. Les orientations de présentation, cotes extérieures et décalages scalaires de brochure ne mesurent pas cette intégration interne.

Sources déjà référencées par la frontière : `docs/detection-lab/RAPPORT_COHERENCE_2026-10-26.md` (MK03/MK13), `docs/detection-lab-pass3/RAPPORT_PASS3_2026-10-27.md` (datums documentaires). Aucune nouvelle position interne, nuance magnétique ni qualification inventée.

L’action « Comprendre les zones de détection » ouvre une exploration séparée dans le même atelier ; Form66 reste identifié dans Sources et limites. Seuls SMCO5-5X4 et N45-4X19 sont pilotes caractérisés. B–F sont évaluables dans ce modèle, sans validation 3D catalogue ; A reste partielle (ATmax 10), G hors domaine. Un contact 1A n’est pas une classe AT. F conserve ses limites documentaires. Le parseur historique du dossier est inchangé.

## Résultats exécutés

### Complément PCB / réglages, recette ChatGPT communiquée à15:32 UTC

- Recette fournie : MK01 PCB +builtin:arm-v1 permettait à tort le pointage câble. Le bras à50%/2s masque bien le câble pendant l'exploration et le restaure avec produit/fichier/50% au retour. Le nouvel import par extension est **non validé**, bloqué par sa permission « Allow access to file URLs » ; aucun réglage de sécurité changé et aucun bug app établi pour cet import.
- Correctif : bouton client masqué pour `isPcbSensor`, refus d'entrer dans l'outil câble pour PCB/exploration, prop câble déconnectée pour tous ses consommateurs (panneau et scène/callbacks). MK04 conserve le pointage. D1/D3 est intégré au même accordéon Position et environnement que trajectoire/orientation/température, sans retirer de réglage ni ajouter de traduction.
- Deux nouvelles régressions comportementales : MK01+builtin:arm-v1 sans bouton/panneau/callback, témoin MK04 ouvrant le panneau et déclenchant réellement les callbacks waypoint/reset ; D3 puis passage latéral puis température autre, valeurs indépendantes conservées. Ces tests montent Workshop sous HappyDOM ; le chargement GLB réel et un clic WebGL ne sont pas prouvés par ce test (fetch local refusé possible).
- Ciblés client/coquille/i18n : **81pass,0fail,500assertions**. Compilation automatique **build OK15:33:22UTC**. Nouvelle recette visuelle réelle laissée à la session prévue, sans reproduction HTML ni publication.

### Recette ChatGPT communiquée à 15:28 UTC, puis correctif d'en-tête

Attribution demandée explicitement : **recette ChatGPT**, transmise dans le fil ; ces mesures ne sont ni attribuées à Thomas ni présentées comme exécutées par l'agent Lovable.

- Chrome réel sur `481a020`, racine → Commencer → étape 2 → Tester ce couple : à390×844 le clic « Comprendre les zones de détection » est reçu ; commandes **1331px**, main **984px**, sans recouvrement, largeur **390/390**.
- Bureau : SmCo centré6mm/décalé8mm et N45 centré16mm/décalé8mm, t50 conservé, défavorable→favorable ; contexte et Résultat/revue conservatifs corrects. **26 tests client indépendants et71 régressions/i18n** passent dans la recette communiquée.
- Défaut restant observé : en-tête **219px produit /194px générique**, titre/contexte comprimés dans une colonne ~80px à droite, générique sur3lignes et référence sur4.
- Correction ciblée : contexte extrait de la zone titre pour les panneaux bare uniquement ; autres panneaux inchangés. Dans le client pédagogique sous1024px, placement explicite : retour / marque+titre / fermer sur rangée1, contexte+statut / langue sur rangée2. Retour/fermer restent des icônes à nom accessible, cibles44px ; contexte utilise les deux premières colonnes et n'est plus logé dans la colonne du titre. Aucune modification moteur/accès/métier, aucune publication, aucune nouvelle traduction.
- Vérifications agent après correction : ciblés **79pass /0fail /491assertions** ; suite **2028pass /0fail /145737assertions /130fichiers**,116,65s ; inventaire i18n **TOTAL0**, scans **0/6/6/0** (exceptions inchangées), **103empreintes identiques**, diff sans erreur, compilation automatique **build OK15:29:52UTC**. Types/compilation gérés automatiquement par la plateforme, aucune commande manuelle relancée.
- **Aucune reproduction HTML ni nouvelle recette visuelle client par l'agent** pour ce correctif : la recette réelle sera refaite dans la session prévue. À vérifier produit et générique à390×844, puis bureau : deux rangées, référence lisible, langue/retour/fermer accessibles, scène et commandes inchangées ; tester aussi les langues longues. La hauteur finale réelle de l'en-tête reste non mesurée à ce stade.

### Complément mobile signalé à 15:19 UTC

- Thomas rapporte sur Chrome client racine 390×844 : grille 727 px / scrollH857, commandes 26 px / scrollH1061, chronologie interceptant Explorer. Ce sont ses mesures, non celles de l'agent.
- Correction limitée au client embedded : classe de scope explicite, grille mobile à deux rangées intrinsèques `max-content` avec un seul défilement vertical ; main/commandes non compressés et sans défilement imbriqué. Sur bureau, main défile si nécessaire et ses enfants ne rétrécissent pas. Badge couple mobile borné et revenant à la ligne. Physique, produits, accès, traductions et backend inchangés.
- Régression câble existante réexécutée : DEFAULT_WORKSHOP + clone builtin:arm-v1 + cableRouting → Pointer le câble → Comprendre les zones de détection : panneau absent, zéro callback, montage/outil/câble restaurés au retour. Le garde `!exploring && cableRouting && tool === "cable"` est déjà présent dans cette préversion ; aucune seconde implémentation ajoutée.
- Tests ciblés client/coquille/i18n : **79 pass, 0 fail, 491 assertions**. Suite entière après correction : **2 028 pass, 0 fail, 145 737 assertions, 130 fichiers**, 134,05 s. Inventaire i18n : **TOTAL 0**. Scans : **0/6/6/0**, mêmes exceptions préexistantes documentées ci-dessous. **103 empreintes inchangées**. Compilation automatique : **build OK à 15:20:43 UTC** ; aucun build/typecheck manuel exécuté.
- Navigateur racine de l'agent : « Accès réservé — Vérification de l'accès… ». Aucune garde modifiée. **Pas de recette réelle client authenticated réalisée par l'agent.**
- Contrôle Playwright distinct, isolé et non connecté : reproduction HTML de la coquille avec les CSS réelles compilées et contenu long, pas Workshop/DesignSpace ni WebGL. À **390×844**, grille 739,52 px / scrollH1297 ; main 698,69 px ; commandes 573,94 px, placées après main. Défilement puis clic Explorer réussi, largeur document 390 et titre sans débordement (clientWidth=scrollWidth=213). À **1280×900**, colonnes 840,11 px ; clic réussi, largeur document 1280. Captures inspectées `/tmp/browser/client-mobile/layout-{390,1280}.png`. Ces mesures prouvent uniquement le comportement de cette coquille isolée, pas la recette visuelle de l'atelier client réel.
- À reproduire par Thomas : racine → Commencer → étape 2 → Tester ce couple, en 390×844 puis 1280×900 ; défiler jusqu'à Comprendre les zones de détection, vérifier clic reçu, contexte générique et chronologie séparés, puis retour produit. Refaire avec outil câble actif et un montage ; aucun panneau ni callback câble durant exploration, restauration au retour. Vérifier les références longues de l'en-tête et les huit langues.

| Contrôle | Résultat et preuve |
| --- | --- |
| Tests client + i18n ciblés | **42 pass, 0 fail, 370 assertions** (25 client, 17 i18n) ; export/reprise réel via JSON, rendu ResultView et rapport, Workshop monté en outil câble |
| Suite entière finale, `bun test tests/` | **2 028 pass, 0 fail, 145 737 assertions, 130 fichiers**, 120,79 s |
| Types automatiques de la plateforme | `tsgo -b --noEmit --incremental`, **exit 0**, 15:07:38 UTC ; `/tmp/exec-logs/d835f21c-189f-488b-b127-10857bfb0558.log` |
| Compilation automatique de la plateforme | **build OK**, 15:16:47 UTC après correction du dernier import manquant ; `/tmp/observability/build-errors.log` ; aucun build/typecheck manuel relancé |
| Inventaire, `bun scripts/i18n-inventory.ts` | **TOTAL 0** : untranslated 0, missing 0, code-translated 0, frozen 0 |
| Dictionnaire | **3 879 entrées**, sept traductions non vides par entrée ; FR, EN, ZH, DE, ES, RU, IT, JA |
| Diff | `git diff --check` sans erreur |
| Empreintes scientifiques et NDA | **103 fichiers identiques à la base**, zéro changement ; manifeste adjacent détaillé avant/après |

Les journaux `/tmp` sont des preuves locales de l’exécution, pas des fichiers livrés ni des URL durables. Le manifeste d’empreintes est conservé dans le dépôt.

### Scans de charte, résultats bruts et exceptions

Les quatre commandes exactes d’`AGENTS.md` ont été exécutées, sans ignorer les résultats :

1. Couleurs Tailwind brutes dans `src/` : **0**.
2. Hex dans routes/leadmagnet TSX : **6** préexistants, aucun ajouté par le lot. Un `theme-color` `#254061` dans `__root.tsx` (exception explicite). Cinq couleurs de rendu Three.js dans `connector-preview-scene.tsx` (clearColor et matériaux), pas des couleurs d’interface ; fichier inchangé.
3. Durées numériques/cubic-bezier hors `src/styles.css` : **6** préexistants dans les primitives UI : accordion 1, input-otp 1, navigation-menu 1, sidebar 3. État des primitives non migrées accepté par la charte ; aucun de ces fichiers changé ou nouvellement monté par ce lot.
4. Bordures/champs/text-xs hors primitives : **0**.

Ne pas présenter les scans bruts 2/3 comme vides. Le lot n’ajoute aucune occurrence ; charte client documentée dans `docs/design-language.md`, sans nouveau jeton.

## Couverture exacte

### Tests client nouveaux

- Identité exacte M04, M13, 4003004003 et des deux pilotes ; boîtier inconnu donc état indisponible, jamais faux favorable.
- Contact 1A distinct d’une classe AT ; exploration ne modifie pas le choix original.
- Deux pilotes × A–G dans l’exploration ; causes partial/missing pour A/G.
- Même profondeur et instant : centré perpendiculaire défavorable, décalé favorable sous les neuf hypothèses ; inversion N/S conserve l’état.
- Workshop réellement monté : action explicite, changement de pilote exploratoire, retour Résultat attribué à MK04/M04 et son câble 500 mm ; aucun circuit électrique binaire dans le conteneur monté ; aucun brouillon GENERIC transmis.
- Régression de clôture : retour explicite au dossier, fermeture par démontage puis réouverture, pose latérale 3 mm/rotation 25° et câble 750 mm préservés ; changement de l’aimant produit vers N45 puis de classe B vers C, nouvelles clés de configuration et retours toujours non qualifiants.
- Contre-revue : ancien expected puis trace indisponible, vrai export/reprise JSON, ResultView sans conclusion positive, rapport/export sans expected ; invalidation autre dossier/configuration. Outil câble actif à l’entrée : aucun panneau/callback ni changement de statut produit en exploration ; retour au montage/outil/câble original. Le test chargeant le montage peut journaliser un fetch local refusé sous Happy DOM : aucune assertion ne prétend que la géométrie GLB est chargée dans ce test.

Ces tests montent Workshop directement : **ils ne constituent pas une recette de la racine ou un test du parent DesignSpace → ResultView**. Les callbacks sont témoins de test. Le contrôle `configKey` et l’effacement au changement de configuration dans DesignSpace ont été inspectés, pas exercés de bout en bout dans le navigateur. Le test de changements de couple prouve de nouveaux résultats au niveau Workshop, pas le rendu du résultat périmé dans son parent.

### Régressions partagées existantes (suite entière verte)

- `pedagogical-diagnosis-2026-10-27.test.tsx` : causes cumulables, nominal déjà favorable expliqué par les hypothèses, constats limités aux essais, remède vérifié dans les libertés déclarées, neuf hypothèses, quatre états/circuit du Workshop, pause sans ancienne cause, légendes de coupe hors SVG.
- `pedagogical-review-2026-10-27.test.tsx` : arrondi prudent D4 après correction documentaire, reproduction CSV source, refus de profils/intégrations inconnus, clip GLB réel et poses, chronologie non certifiée.
- `pedagogical-imported-2026-10-27.test.tsx` : OBB par pièce et corps pilote complet, chevauchement possible pas collision certaine, absence d’asset/clip/mouvement confirmé, même pose pour coupe/point/volume.
- `pedagogical-reopen-pick-2026-10-27.test.tsx` : GLB réellement rechargé, poses/instant 25 % conservés et navigation Installation → Essai. Scène remplacée par un témoin ; ce n’est pas une preuve de rendu WebGL client.

Ces tests partagés portent sur le moteur ou l’atelier pilote/staff. Ils ne sont pas rebaptisés tests navigateur client. Les solides exacts, matériaux ferromagnétiques du GLB, convergence des volumes et traversées rapides restent non caractérisés ; aucune interpolation angulaire ou optimisation nouvelle.

## Empreintes

Manifeste : `qa-client-pedagogical-2026-10-27-empreintes.json`, 103 chemins triés ; SHA-256 agrégé des lignes UTF-8 `chemin + NUL + hash-après + LF` :

`ec69e9b335a0e61e85d60526de51ecbda77df539e2820d517f18d86aa4707621`

| Fichier clé | SHA-256 identique avant/après |
| --- | --- |
| `src/data/detection-lab/workshop-profile.json` | `bb83d53439847176e699e19aac644bdab8c330bb89f5de001ccf45223e421c91` |
| `src/lib/detection-lab/workshop-experiment.ts` | `196100d84f0797e2556ec8fb241dc51667e5847761883c80e47c2d55d9a2e1f5` |
| NDA original | `6e25345f1e83e92630258774d27a451d65d615cdd9f41a5331dae75c4072740b` |

Le manifeste couvre tous les fichiers suivis à la base dans `src/lib/detection-lab`, `src/data/detection-lab`, `docs/detection-lab`, `docs/detection-lab-pass2`, `docs/detection-lab-pass3`, plus `pedagogical-poses.ts`, `pedagogical-envelopes.ts` et le NDA original. Les guards staff, routes, serveur existant et migrations n’ont pas de diff avec la base d’intégration.

## Fichiers du lot

- Frontière : `src/lib/standex/client-pedagogical.ts`.
- Atelier : `workshop.tsx`, `client-pedagogical-controls.tsx`, `scene.tsx`, `machine-scene.tsx` sous `src/components/standex/workshop/`.
- Parcours : `src/components/leadmagnet/design-space.tsx`, `result-view.tsx`.
- Langues/tests : `src/lib/i18n/messages.json`, `tests/client-pedagogical-2026-10-27.test.tsx`, `tests/i18n-coverage.test.ts`.
- Règles/docs : `AGENTS.md`, AGENTS imbriqués leadmagnet/workshop, `docs/design-language.md`, `roadmap.md`, présent rapport et manifeste.

## Recette navigateur confiée à Thomas — non exécutée par l’agent

Retour de Thomas à 15:11 UTC, Chrome racine : accueil → Commencer → question 1 → étape 2 → Tester ce couple PASS ; SmCo centré 6 mm à 50 % défavorable, décalé 8 mm favorable au même instant ; retour produit/Résultat correct immédiatement. Ces observations sont les siennes, pas celles de l’agent. Les quatre corrections de contre-revue nécessitent son nouveau contrôle visuel, notamment persistance du contexte après défilement, réimport exploratoire et reprise de dossier.

Partir de la **racine de préversion**, jamais `/internal`, sur bureau puis Chrome 390×844 :

1. Démarrer le nouveau parcours, aller à l’étape 2 et ouvrir l’atelier existant. Contrôler quatre étapes, absence de l’ancien chat, couple/variante/classe/câble du dossier conservés.
2. MK04/M04 par défaut : indisponibilité produit explicite, corps réel opaque conservé, pas de pilote N45 implicite ni lampe/contact binaire contradictoire. Ouvrir Sources et limites : plages documentaires distinctes des poses.
3. Déclencher l’exploration Form66 ; contrôler sa légende indépendante. Essayer SmCo puis N45, B–F, A partielle et G hors domaine. Changer les choix sans ancien volume/verdict ; lancer puis mettre en pause sans ancienne cause/remède.
4. À profondeur 6 mm SmCo ou 16 mm N45, même instant, comparer centré perpendiculaire et décalé 8 mm ; inverser N/S. Vérifier causes/constats limités aux essais et remède seulement confirmé dans les libertés déclarées.
5. Revenir au couple d’origine, fermer/réouvrir puis Résultat. Vérifier pose, produit et câble inchangés, indisponibilité produit et aucune qualification générique. Changer couple/classe puis contrôler qu’un ancien résultat ne s’affiche plus.
6. Importer un GLB volontairement, conserver attaches et mouvements ; tester mouvement non confirmé puis confirmé, fichier absent à la reprise. Aucune fausse estimation favorable. Installation → Essai conserve l’instant ; ne pas envoyer le fichier.
7. Bureau/mobile : scène, chronologie, commandes et coupe accessibles ; légendes complètes (projection hors-plan/hachures), N/S visibles, aucune bulle redondante recouvrant reed/lobes, aucun débordement horizontal. Vérifier bascule de langue et mouvement réduit.

**Statut : vérifications automatisées terminées ; recette visuelle client à confirmer par Thomas.** Aucun résultat navigateur authentifié, écran mobile ou rendu WebGL final n’est prétendu vérifié ici.

## Consommation

Le plafond autorisé reste 20 crédits pour le lot : 8 déclarés pour le premier tour, 12 disponibles pour cette clôture. Contrôle existant appelé au début puis en cours : compteur de période 1453 puis 1458 (+5 constatés à ce contrôle, pas coût final garanti). Aucun contournement de pause. Le coût facturé final se lit dans le contrôle existant ; ces valeurs ne sont pas une limite de facturation configurée côté serveur.