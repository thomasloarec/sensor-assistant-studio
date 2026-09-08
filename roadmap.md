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

- [ ] Corriger les deux contrastes de texte sans modifier le contexte immersif.
- [ ] Transformer visuellement l’atelier 3D en banc d’essai sombre.
- [ ] Moderniser les contrôles, l’état de contact et le catalogue sans toucher aux calculs.
- [ ] Éliminer les couleurs d’interface codées en dur dans l’atelier.
- [ ] Vérifier tests, types, build et parcours atelier à 1440/390 px.
