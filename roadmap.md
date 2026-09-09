# Lead Magnet — état des travaux

## Fait

- Migration `supabase/schema/migration_v1.2_lead_magnet.sql` corrigée (volume annuel réel,
  refus NaN/Infini, instantané validé, consentement daté et rattaché, variante verrouillée,
  retour d'échantillon lié à sa version, revalidation explicite, preuve NDA liée à un fichier
  réel ou une archive externe, annuaire staff lisible, sessions d'upload consenties).
  Recettes : 58/58 (locale) et 9/9 (indépendante) sur base jetable. NON appliquée.
- Adaptateur : comparaison réelle de version de schéma, upload consenti, preuve NDA,
  revalidation d'échantillon, titre de dossier.
- Écran client `/design` : suivi réel (dossiers, retours publiés, variantes, offres,
  échantillons, retours d'usage), partage explicite du fichier 3D, bibliothèque de quatre
  boîtiers documentés.
- Console `/standex` : affectation par nom, dépôt du document signé avec empreinte calculée,
  revalidation explicite d'un échantillon dépassé.
- Pointage réel du câble dans la 3D (`/design` + atelier) : rôles capteur/passage/connexion,
  annuler/effacer, polyligne et repères dessinés, pose de scène enregistrée par état, points en
  millimètres sans double mise à l'échelle, saisie numérique conservée sans modèle.
- Reprise de fichier durcie : montage, encombrement, volume annuel et atelier réellement
  validés, version d'export non supportée refusée, avis explicites au lieu de données inventées.
- Note de longueurs de GAMME MK03 sourcée (fiche officielle 02/2019), sans MPN ni tolérance.
- 150 tests, typecheck, build et smoke navigateur réel (162 mm mesurés) passent.

## Bloqué (hors de mon contrôle)

- Application de la migration sur `yyobodalwtsqdyrqwkjk` : réservée au propriétaire.
- Provisionnement du premier compte administrateur Standex (`service_role`).
- Signatures électroniques, catalogues distributeurs, registre des entreprises : externes.

## Lot R&D / connexion — terminé

- `/standex` : proposition de variante structurée (réserve, tolérance, choix de longueur,
  fabricant/référence/voies du connecteur) réellement reprise par `applyVariant` côté client ;
  les notes restent descriptives et un connecteur proposé reste « à vérifier ».
- `/standex` : résumé technique lisible de la version envoyée (brut repliable) et
  téléchargement des fichiers réellement transférés via lien signé.
- Connexion réelle (compte du projet Supabase existant) accessible depuis `/design` et
  `/standex`, avec rafraîchissement du statut sur changement de session.
- Variante déjà remplacée : bouton désactivé côté client.
- Vérifs : `bun test` 154/154, SQL 62/62, indépendant 9/9, typecheck, build, smoke navigateur.
- La migration Lead Magnet reste NON appliquée au backend live.

## Lot fichiers / envoi / provenance — terminé (2026-09-08)

- Boucle d'envoi supprimée : le fichier 3D est déposé et vérifié AVANT l'accord
  ("1. Déposer le fichier 3D"), l'accord porte donc sur ce qui partira réellement.
  Une nouvelle tentative réutilise le dépôt existant au lieu d'en refaire un.
- Verrou d'action : double clic impossible, aucun envoi concurrent, contexte
  serveur (dossier + version) revérifié juste avant l'envoi.
- Vérification serveur réelle des octets : route `/api/lead/verify-upload`
  (lecture sous les droits de l'appelant, empreinte recalculée) puis
  `lead_finalize_upload` réservée au `service_role`. Sans clé de service :
  réponse 503 honnête, fichier NON joint, rien de simulé.
- SQL 1.4 : un fichier n'est annonçable qu'après relecture serveur ; formes
  imbriquées fermées (montage, encombrement, câblage, terminaison) ;
  provenance d'échantillon conservée (`origin_revision`, `revalidated_from_revision`).
- Reprise atomique : contenu, dossier serveur, version, NDA, accords, relecture et
  dépôt préparé changent d'un seul tenant ; n'importe quelle version envoyée peut
  être reprise, pas seulement la dernière.
- Variante : refusée si elle vient d'un autre dossier que celui ouvert.
- Version de schéma exigée par l'application portée à 1.4.
- Vérifs : `bun test` 160/160, SQL 76/76, indépendant 9/9, typecheck OK.
- La migration Lead Magnet reste NON appliquée au backend live ; aucun rôle attribué.

## 2026-09-08 — Sérialisation canonique des nombres

- `stableStringify` développe désormais la notation exponentielle JSON exactement comme PostgreSQL rend un `jsonb` en texte (aucun arrondi, aucune valeur modifiée).
- Cas vérifiés identiques JS/SQL sur PostgreSQL réel (PGlite) : 1e-7, 6.123233995736766e-17, 1e21, 5e-324, 0.123456789, 1000, 0, et leurs négatifs.
- Un snapshot d'atelier avec résidus de rotation 3D n'est donc plus refusé en CONTENT_HASH_MISMATCH. Le serveur reste l'autorité et le contrôle du hash reste actif.
- Régression : `tests/number-canonicalization.test.ts`. Suites : 163 tests / 0 échec, SQL 76/76, revue indépendante 9/9, typecheck OK.
- Migration Lead Magnet toujours NON appliquée au backend live, projet privé, NDA original inchangé.

## 2026-09-08 — Diff serveur appliqué + branchements d'écran

- Diff SQL appliqué à l'identique dans `supabase/schema/migration_v1.2_lead_magnet.sql` :
  `state`/`source` d'exigence non nulls, révision/revue d'origine immuables avec
  `revalidated_for_revision`/`revalidated_review_id` distincts, fichier déposé
  insert-only (aucune policy UPDATE/DELETE client), session fermée à finalisation.
- Vérification des octets déplacée vers la VRAIE fonction Edge Supabase
  (`getUser` JWT + lecture RLS + finalisation `service_role`) ; l'adaptateur passe
  par `supabase.functions.invoke("lead-verify-upload")` et la route applicative
  `/api/lead/verify-upload` est supprimée. La plateforme d'édition refusant
  d'écrire dans `supabase/functions/`, la source exacte est déposée dans
  `supabase/edge-functions-src/lead-verify-upload/index.ts`, à copier vers
  `supabase/functions/lead-verify-upload/` avant déploiement (`verify_jwt=true`).
- Ouvrir un dossier charge d'abord son dernier contenu envoyé (`fetchClientView`)
  puis change le contexte édité ; en cas d'échec, rien ne change à l'écran.
- Reprise : `sourceRevision` (contenu repris) et `currentRevision` (version
  attendue par le serveur) sont distincts et affichés.
- Variante : appliquée à la snapshot de la version relue, refus/échec AVANT
  `acceptVariant`, donc aucune variante n'est marquée reprise sans l'être.
- Import JSON et changement de contexte remettent à zéro contraintes ajoutées,
  partage du modèle, atelier, NDA et accords ; les réponses asynchrones d'un
  contexte périmé (dépôt, NDA) sont ignorées par un compteur de génération.
- `/standex` ouvre le VRAI GLB envoyé dans MagneticWorkshop en mémoire, avec la
  configuration exacte de la version et son câble, après contrôle SHA-256 contre
  les fichiers transférés ; aucun montage par défaut de remplacement, et un
  enregistrement local ne vaut jamais retour publié.
- Vérifs : `bun test` 174/174, SQL 76/76, indépendant 9/9, typecheck OK, build OK,
  navigateur réel `/design`, `/standex`, `/` sans erreur console.
- Migration toujours NON appliquée, aucun rôle attribué, projet privé, NDA inchangé.

## 2026-09-08 (fin de journée) — état réel du backend

- Le SQL de `supabase/schema/migration_v1.2_lead_magnet.sql` est APPLIQUÉ sur le
  backend Standex existant yyobodalwtsqdyrqwkjk (diff identique, seules des
  lignes vides diffèrent). Sonde réelle : HTTP 200, `ready=true`, schéma 1.4.
- Fonction Edge `lead-verify-upload` DÉPLOYÉE et ACTIVE (v1, verify_jwt=true) ;
  appel anonyme refusé en 401. Aucune copie ni déploiement supplémentaire.
- AUCUN rôle staff attribué : le contrôle automatique a refusé le
  provisionnement admin. Ce privilège attend un accord explicite du
  propriétaire et ne sera pas contourné.
- Raccordements finaux : `/standex` passe réellement `cableRouting` à l'atelier
  (sélecteur d'état, pointage, annulation, remise à zéro, longueur) sur une
  COPIE locale du câble, et vérifie l'`assetKey` de la configuration contre le
  binaire contrôlé ; un dossier sans contenu envoyé n'hérite plus de l'ancien
  contenu ; `fetchClientView`, `loadView`, les actions R&D et l'ouverture du GLB
  ignorent les réponses périmées ; le changement de contexte est bloqué pendant
  une opération en cours.

## Refonte UX 2026-09-08 (état actuel)

- `/` = accueil client (aimant manipulable souris/tactile/clavier + curseur) puis espace projet unifié montant `DesignSpace` (`src/components/leadmagnet/design-space.tsx`).
- Banc de test interne déplacé INTACT vers `/internal` (`src/routes/internal.tsx`, scénarios, trace, batch, 8 langues). `/standex` inchangé. `/design` monte le même `DesignSpace`.
- Parcours guidé « Mon besoin → Mon montage → Avec Standex » : une question à la fois, « Je ne sais pas encore », retour arrière ; tous les onglets détaillés restent accessibles via « Ouvrir les outils détaillés ».
- Aucun changement SQL, Edge, rôles, NDA, moteur métier ni backend. `resetServerContext`, `contextGenRef`, `busyRef`, snapshot/sourceRevision/CAS, variantes et GLB SHA/assetKey conservés tels quels dans `design-space.tsx`.
- Vérifs : 180 tests bun (0 échec), typecheck OK, build OK, parcours navigateur desktop+mobile sans erreur console ni débordement 320px.

## Refonte visuelle — lot B/4

- [x] Mettre en scène l’accueil immersif sans modifier son parcours ni ses textes.
- [x] Moderniser la démonstration aimant sans modifier sa physique ni ses contrôles.
- [x] Vérifier tests, types, build, trois largeurs et réduction des animations.

## Réglage fin de l’accueil — lot B.2

- [x] Resserrer le rythme du héros et équilibrer le titre sur deux lignes.
- [x] Clarifier le champ magnétique, l’ampoule et les lamelles du capteur.
- [x] Fusionner la démonstration en une carte et vérifier les trois largeurs.

## Refonte visuelle — lot C/4

- [x] Recomposer le chrome et la progression de l’espace projet sans modifier son état.
- [x] Mettre en scène la question guidée et les outils contextuels.
- [x] Moderniser les panneaux sans toucher au montage, au focus ni à leur masquage.
- [x] Vérifier tests, types, build et parcours navigateur desktop/mobile.

## Refonte visuelle — lot E

- [x] Corriger les deux contrastes de texte sans modifier le contexte immersif.
- [x] Transformer visuellement l’atelier 3D en banc d’essai sombre.
- [x] Moderniser les contrôles, l’état de contact et le catalogue sans toucher aux calculs.
- [x] Éliminer les couleurs d’interface codées en dur dans l’atelier.
- [x] Vérifier tests, types, build et parcours atelier à 1440/390 px.

## Refonte visuelle — lot F

- [x] Migrer le banc interne sur le socle visuel commun.
- [x] Harmoniser les écrans design et R&D sans modifier leur structure.
- [x] Éliminer les anciens motifs visuels résiduels dans l’application.
- [x] Vérifier clavier, mouvement réduit, contrastes et trois largeurs.
- [x] Actualiser le langage de design et exécuter tests, types et build.

## Finition langues + vignettes

- [x] Confirmer dictionnaire, inventaire AST et couverture des huit langues.
- [x] Corriger le compte de contextes 3D des vignettes (jeton d'appartenance, relais atomique, nettoyage idempotent, repli si le rendu échoue).
- [x] Ramener les lames du reed nu à l'intérieur du verre et les rendre visibles sans radiographie.
- [ ] Parcours navigateur réel atelier + capteurs possibles en ja/zh/ru.
- [ ] Rapport enregistré en anglais (lot suivant, déjà autorisé).

## Version anglaise du rapport (2026-09-08)
- Migration 1.5 appliquée (stockage). Migration 1.6 `supabase/schema/migration_v1.6_english_report_pipeline.sql` ÉCRITE, NON appliquée : à appliquer sur yyobodalwtsqdyrqwkjk.
- Chaîne serveur : autorisation en base (droits, empreinte, NDA, consentement `ai_assistant` exact) → réservation `pending` → traduction Anthropic → publication `ready`.
- Configuration manquante côté serveur : `SUPABASE_SERVICE_ROLE_KEY` (sans elle, la demande répond « non configuré » et rien n'est transmis).

- Rapport anglais : logique isolée dans `src/lib/leadmagnet/english-report.pipeline.ts` (dépendances injectées, testée), codes d'erreur stables traduits dans les huit langues, validation d'entrée à l'exécution (jeton/UUID/SHA-256) et succès annoncé uniquement si le serveur confirme `ready`. Migration 1.6 toujours refusée/non appliquée, `SUPABASE_SERVICE_ROLE_KEY` toujours absent.

## 2026-09-09 — Activation serveur du rapport anglais

- Migration 1.6 APPLIQUÉE par root sur yyobodalwtsqdyrqwkjk (6 fonctions, EXECUTE refusé à
  anon/authenticated, accordé à service_role). Ne pas réappliquer.
- Nom applicatif de la clé privée serveur : `standex_supabase_secret_key` (le préfixe
  `SUPABASE_` est réservé par la plateforme), avec repli sur `SUPABASE_SERVICE_ROLE_KEY`.
  URL serveur optionnelle : `STANDEX_SUPABASE_URL` (défaut : projet Standex).
- Configuration enregistrée : `standex_supabase_secret_key`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`.
- Test réel minimal effectué : `scripts/test-secret-real.ts` appelle `lead_report_en_authorize`
  avec des UUIDs synthétiques ; la réponse `{"reason":"DOSSIER_NOT_FOUND","allowed":false}`
  confirme que la clé serveur est active et que les RPC V1.6 sont atteignables.
- Vérifications : 274 tests / 42 561 assertions, typecheck OK, build OK, scans de design
  conformes (seule exception documentée `#254061` dans `theme-color`).

## 2026-09-09 — Recette RÉELLE bout en bout (fixtures synthétiques)

- Clé privée serveur : `standex_supabase_secret_key` (Lovable, minuscules). Audit du dépôt :
  seul consommateur applicatif = `src/lib/leadmagnet/english-report.server.ts`
  (repli `SUPABASE_SERVICE_ROLE_KEY` conservé) ; `english-report.functions.ts` importe
  `SERVICE_KEY_NAME`. `supabase/edge-functions-src/lead-verify-upload` lit
  `SUPABASE_SERVICE_ROLE_KEY` fourni automatiquement par Supabase à l'Edge (hors périmètre
  Lovable, inchangé). Clés publiques inchangées. Aucune valeur de secret lue ni affichée.
- Script de recette : `scripts/e2e-english-report.ts` (isolé par `runId`, e-mails
  `@example.invalid`, comptes créés par l'API admin serveur, dossier + soumission par les
  RPC normales avec empreinte et consentement `ai_assistant` exacts).
- Résultats (run réel, provider Anthropic réellement appelé 3 fois) :
  FR/JA/RU → `ready` ; retry → `ready` sans nouvel appel fournisseur ni doublon ;
  état stocké `ready` confirmé en base ; original client et `sourceLocale` intacts ;
  vue client sans version anglaise ; refus `NOT_ALLOWED` (autre utilisateur),
  `CONTENT_HASH_MISMATCH`, `AI_CONSENT_MISSING`, aucun appel fournisseur sur les refus.
- NDA : un dossier `nda_required` sans preuve vérifiée est refusé DÈS `lead_submit_revision`
  (`NDA_NOT_IN_FORCE`), donc avant toute traduction possible. Le NDA original est inchangé.
- Correctif réel découvert par cette recette : le service renvoyait parfois l'entrée telle
  quelle (champ `text` au lieu de `en`), ce qui faisait échouer JA/RU. `anthropicProvider`
  précise désormais le schéma de l'outil et effectue UNE relance corrective ; la validation
  aval n'est pas assouplie (un écho reste refusé). Tests : `tests/anthropic-provider.test.ts`.
- Limites factuelles :
  - projection staff NON vérifiée : aucun rôle staff ne peut être attribué sans SQL
    privilégié ; seul le refus `NOT_ALLOWED` d'un non-staff a été vérifié ;
  - nettoyage partiel : `auth.admin.deleteUser` échoue (« Database error deleting user »,
    dépendances lead) et aucune RPC de suppression de dossier n'existe ; les dossiers
    synthétiques créés restent en base, identifiés par leur titre `E2E <runId>` ;
  - wiring UI non testé en navigateur authentifié : la chaîne serveur a été exercée
    directement (mêmes dépendances réelles que la fonction serveur), pas via l'interface.
- Gates : 277 tests / 42 567 assertions, typecheck OK, build OK, scans de design conformes.

## 2026-09-09 — Diagnostic de transmission et NDA

- Cause du blocage muet : le CTA était désactivé par `!ndaOk` alors que l'état initial exige
  un NDA et commence à `requested`; les consentements cochés ne constituent pas la preuve
  serveur requise (`in_force` avec preuve vérifiée).
- Le CTA reste maintenant utilisable pour lancer les validations locales sans transfert. Un
  diagnostic distinct couvre `requested`, `prepared`, `awaiting_signatures` et l'état
  incohérent `in_force` sans preuve, avec accès direct à Confidentialité/NDA et actualisation
  du statut serveur. Aucun contrôle NDA, document, droit ou workflow n'a été assoupli.
- Les vraies opérations restent seules bloquantes et portent un libellé contextualisé (dépôt
  3D, transmission, reprise). Leur verrou est libéré en `finally`; les erreurs utilisent
  `notice-danger`, jamais le style succès.
- Couverture rendue : NDA requis non vérifié, NDA vérifié/non requis, opération active et
  message d'échec. Les nouvelles phrases sont présentes dans les huit langues.

## 2026-09-09 — NDA optionnel (choix explicite du client)

- Nouveau défaut applicatif : `INITIAL_NDA` = `{ required: false, status: "not_required",
  proof: null }`. Un nouveau dossier peut donc être rempli, déposé, traduit et transmis
  sans NDA. Les consentements de partage restent distincts et inchangés.
- Case explicite « Je souhaite un accord de confidentialité (NDA) » dans Confidentialité et
  NDA. Décochée : champs, aperçu, téléchargement, préparation et statut serveur sont masqués,
  une notice explique que rien n'est demandé. Cochée : les gardes précédentes s'appliquent
  intégralement (preuve serveur `in_force` obligatoire avant tout transfert confidentiel).
  Les champs déjà saisis survivent aux deux sens du basculement.
- Helpers : `enableNda`, `disableNda`, `canDisableNda`, `ndaDisableBlockedReason`
  (`src/lib/leadmagnet/nda.ts`). La désactivation est refusée dès qu'il y a un engagement :
  `awaiting_signatures`, `in_force`, ou une preuve vérifiée.
- Serveur : `supabase/schema/migration_v1.7_optional_nda.sql` **APPLIQUÉE** sur
  `yyobodalwtsqdyrqwkjk` (grants vérifiés : `anon = false`, `authenticated = true`).
  NE PAS réappliquer. Elle ajoute `lead_priv.set_nda_requirement` + wrapper
  `public.lead_set_nda_requirement`, réservé au propriétaire du dossier, sans mise à jour
  en masse. Le retrait est permis tant que la demande n'est pas signée
  (`requested`, `prepared`, `awaiting_signatures` sans preuve) ; `in_force` ou toute
  preuve enregistrée le refusent (`NDA_ENGAGEMENT_IN_PROGRESS`). Le SQL reste l'autorité
  (`lead_submit_revision` refuse toujours `NDA_NOT_IN_FORCE`).
- Dossiers existants : aucun n'est modifié automatiquement. Un dossier déjà créé avec NDA
  requis reste requis jusqu'à ce que son propriétaire décoche la case.
- Export / reprise : le fichier client transporte seulement la métadonnée booléenne
  `ndaRequested` (la DEMANDE). Aucune preuve, aucun statut vérifié, aucun document signé
  n'est exportable ; un ancien export sans le champ ne reconstitue aucun choix, et à la
  réouverture d'un dossier enregistré c'est le serveur qui fait autorité.
- Synchronisation : `src/lib/leadmagnet/nda-sync.ts` isole verrou unique + époques.
  Double bascule, relecture périmée, changement de dossier, démontage et erreur réseau
  sont couverts ; pendant l'enregistrement, préparation, génération, dépôt et envoi sont
  inhibés, et l'erreur reste visible même quand les champs NDA sont masqués.
- Recette réelle (`scripts/e2e-nda-optional.ts`, fixtures synthétiques) : 9/9 PASS sur
  `yyobodalwtsqdyrqwkjk` — dossier neuf sans NDA soumis, dossier avec NDA préparé
  (`awaiting_signatures`) retiré par son propriétaire puis soumis, autre utilisateur
  refusé (`NOT_ALLOWED`) sans effet. Mises au point : 3 exécutions, donc 6 dossiers
  `E2E NDA <runId>` et quelques comptes `@example.invalid` subsistent — la suppression
  des comptes échoue toujours (`Database error deleting user`), limitation connue.
- Gates : 306 tests / 43 292 assertions, typecheck OK, build OK, inventaire i18n `TOTAL 0`.
  Smoke navigateur : case décochée par défaut, champs masqués, activation → champs +
  gardes NDA, désactivation → plus de blocage, zéro erreur console.

