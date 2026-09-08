# Lead Magnet — état réel de l'implémentation

Date : 2026-09-08. Projet : Sensor Assistant Studio (privé, non publié).
Backend inchangé : projet Supabase existant du client `yyobodalwtsqdyrqwkjk`.
Aucun Lovable Cloud, aucune mutation sur un autre projet Supabase (en particulier
`vxivdvzzhebobveedxbj`, jamais touché).

## Ce qui fonctionne réellement dans l'aperçu privé

Nouvelle route `/design` (« Concevoir une détection »), accessible depuis l'en-tête du banc
de test interne, qui reste intact (`/`).

- **Dossier vivant en mémoire de l'onglet.** État typé unique : exigences, montage,
  encombrement, config atelier, câblage, pièces jointes, contraintes libres, métadonnées
  business, notes internes séparées. Badge « Sur cet appareil • non partagé », avertissement
  de perte à la fermeture, export JSON volontaire.
- **Exigences** valeur + unité + état (confirmé / hypothèse / inconnu) + source
  (utilisateur, import, assistant, R&D). Toute extraction automatique est une hypothèse ;
  seule une action explicite confirme. Une valeur vide reste « inconnu ».
- **Qualification guidée locale** clairement libellée : aucune IA distante n'est reliée dans
  ce parcours, rien n'est envoyé.
- **Candidats** filtrés par choix mécanique explicite (CMS, traversant, vissé, emboîtement
  avec diamètre, autre) et par encombrement. Chaque candidat affiche pourquoi il est retenu,
  à vérifier ou écarté. Aucun candidat n'est « validé » ; les gammes sont marquées comme
  gammes, jamais comme références commandables. Aucune recommandation par application.
- **Atelier 3D existant réutilisé** (moteur réel, GLB autonome uniquement, pas de STEP/IGES),
  ouvert en option depuis le dossier, avec rappel « unités, échelle et pièce mobile à
  confirmer » et modèle physique explicitement pédagogique.
- **Stockage 3D mémoire** : `storeMachineFileInMemory` ajouté dans
  `src/lib/standex/machine-assets.ts`. Les anciens montages IndexedDB restent lisibles.
- **Câblage** : endpoints capteur / connexion, waypoints en mm, longueur polyligne réelle
  (jamais la distance directe), trajets par état de mouvement et plus long trajet, réserve de
  service / terminaison / tolérance ajoutées explicitement, alerte rayon de courbure. Une
  géométrie incomplète ne produit jamais une longueur approuvée.
- **Longueurs standard** comparées seulement pour une référence exacte sourcée. Le registre
  est vide : aucune longueur n'a été sourcée dans ce repo, donc la réponse est « longueur à
  vérifier par la R&D ». Aucun MPN n'est fabriqué par collage de longueur ;
  `MK03-1A66-200W`, `MK03-1A66-500W` et `MK03-1A90` sont distincts.
- **Terminaison** : fils nus par défaut ; connecteur uniquement par référence exacte. Le
  catalogue de combinaisons qualifiées est vide, donc toute saisie devient une référence
  libre « à vérifier par R&D ».
- **NDA** : le binaire original approuvé est livré dans l'application
  (`public/legal/nda-standex-k-motor-16062026.docx`, SHA-256
  `6e25345f1e83e92630258774d27a451d65d615cdd9f41a5331dae75c4072740b`, vérifié avant chaque
  génération). Le remplissage est **local** (zip + XML via `fflate`, aucun envoi, aucune
  dépendance au dossier de conception) : l'original reste immuable, une copie remplie est
  produite. Champs variables, et rien d'autre, aux paragraphes `./w:body/w:p` 11 (société),
  12 (rue), 13 (code postal/ville), 14 (pays), 78 (date Standex seule — le lieu
  « Welschingen, Germany » est figé), 84 (Name), 85 (Position), 86 (lieu/date client). Les
  mentions Stamp/Signature, en-têtes, pieds, clauses et autres blocs de signature sont
  conservés ; aucune signature ni image n'est ajoutée et le fichier produit s'appelle
  explicitement « non signe.docx ». Aperçu local des clauses puis téléchargement sont
  possibles avant toute transmission. Statuts demandé / préparé / en attente / en vigueur ;
  générer n'est pas signer ; le statut « en vigueur » exige une preuve vérifiée. Sans preuve,
  tout transfert confidentiel reste bloqué.
- **Soumission** : contrôles de complétude, instantané immuable avec révision, hash SHA-256,
  horodatage, consentements et liste des fichiers *réellement* transférés. Sans backend prêt,
  la soumission échoue proprement avec un message clair — aucun succès simulé.
- **Échantillons** : routage < 1000 / ≥ 1000 / inconnu / spécifique faible volume, liens de
  recherche partenaires explicitement libellés « recherche, pas preuve de stock »,
  disponibilités « inconnu » et non zéro, aucun e-mail envoyé.

## État réel de la migration et de l'activation

1. **Migration SQL versionnée, NON appliquée** :
   `supabase/schema/migration_v1.2_lead_magnet.sql` (les brouillons V1.0 et V1.1 sont
   supprimés et ne doivent pas être appliqués). Schéma `lead` séparé des tables
   `sensor_test_*` : dossiers, collaborateurs, affectations staff, révisions immuables,
   revues, notes internes, offres, échantillons, preuves NDA, sessions d'upload, journal
   d'audit, bucket privé `lead-design-files`. Fonctions `security definer` isolées dans
   `lead_priv` (`search_path` figé, EXECUTE de PUBLIC révoqué), wrappers publics invoker,
   RLS complet, aucun accès `anon` hors sonde de version.
   Le propriétaire applique cette migration lui-même après relecture ; aucune session ici
   n'a modifié le backend `yyobodalwtsqdyrqwkjk`.
2. **Activation** : `checkLeadBackend()` compare réellement la version de schéma renvoyée
   par le serveur à `1.2` (et non un simple booléen), puis exige une session et un rôle
   renvoyé par le serveur. Tant que la migration n'est pas appliquée, les écrans annoncent
   « liaison à activer » et n'affichent aucun succès simulé.
3. **Écrans branchés** : `/design` (client : conception, câble, connecteurs, NDA, envoi,
   suivi réel des retours, variantes, offres, échantillons et retours d'usage) et
   `/standex` (équipe : boîte de réception, affectation par nom, lecture du dossier envoyé,
   retour R&D publié avec référence exacte et variante, notes internes séparées, offres,
   suivi des échantillons, enregistrement d'une preuve NDA). Ces écrans appellent les RPC
   réelles ; ils restent inactifs sans migration ni rôle serveur.
4. **Preuve de NDA signé** : le document original reste immuable ; générer une copie remplie
   ne vaut pas signature. Un administrateur habilité dépose le document signé (empreinte
   SHA-256 calculée automatiquement) ou déclare explicitement une archive externe ; le
   serveur exige contreparties, référence de preuve, date et vérificateur.
5. **Modèle 3D** : il reste en mémoire de l'onglet tant que le partage n'est pas coché ; le
   partage ouvre une session d'upload consentie et dépose le fichier réel dans le bucket
   privé, visible par l'équipe affectée.
6. **Connecteurs** : quatre boîtiers documentés par le fabricant (JST XHP-2/XHP-3,
   PHR-2/PHR-3) avec contact et embase distincts et sources PDF officielles. Brochage,
   section réelle et disponibilité restent inconnus, statut « à vérifier par la R&D ». Ce
   n'est pas un catalogue du marché.
7. **Restent extérieurs** : signatures électroniques, catalogues et stocks distributeurs,
   registre des entreprises (`NO_COMPANY_LOOKUP_CONFIGURED`), longueurs de câble hors des
   gammes réellement sourcées.

## Recettes SQL exécutées (base PostgreSQL jetable, jamais le vrai backend)

- `bun tools/sql-review.mjs` → **58/58 contrôles**.
- `bun tools/sql-independent-review.mjs` → **9/9 contrôles indépendants**, avec l'instantané
  réel produit par `createDossier`/`toClientDto` (`tests/fixtures/synthetic-dossier-fixture.json`).

## Accès aperçu

Aperçu privé : `/` = banc de test interne inchangé ; `/design` = espace de co-conception
(`noindex, nofollow`, non publié).

## Emplacement du code

`src/lib/leadmagnet/` : `dossier.ts`, `candidates.ts`, `cabling.ts`, `connectors.ts`,
`privacy.ts`, `nda.ts`, `nda-docx.ts`, `submission.ts`, `review.ts`, `samples.ts`, `backend.ts`
(logique métier pure, sans UI ni réseau sauf `backend.ts`).
`src/routes/design.tsx` : UI. `supabase/schema/migration_v1.2_lead_magnet.sql` : DDL.

Emplacement réservé pour une future filière « remplacement concurrent » (référence exacte,
datasheet, montage) : non développée, aucun champ inventé.

## Recette navigateur (exécutée dans l'environnement de développement)

Smoke UI réel joué avec Playwright sur `http://localhost:8080/design`, données entièrement
fictives (Fictif Motion SAS, Claire Fontaine), aucune transmission à un tiers :

| Étape | Preuve observée |
| --- | --- |
| Entrée « Concevoir une détection » | URL `/design`, titre « Concevoir une détection » |
| But + états + électrique + environnement | 4 exigences passées à « Confirmé » |
| Montage | choix explicite « PCB — report CMS », enveloppe 40 × 18 × 12 mm |
| Candidat non commandable | « MK24 · Form A · J — Retenu à ce stade … la référence exacte est fixée après revue R&D » |
| Câblage avec un waypoint | « Plus long trajet mesuré (polyligne) : 327.9 mm » |
| Informations projet tardives | volume annuel, dates, contact saisis en fin de parcours seulement |
| NDA original rempli | aperçu des clauses + téléchargement `NDA Standex x Fictif_Motion_SAS - non signe.docx` (144 073 octets) |
| Envoi | bouton désactivé sans NDA en vigueur ; message « liaison … pas encore activée », aucun faux succès, aucun terme technique |
| Atelier 3D puis retour | « Retour au dossier » ; objectif et cotes conservés |

Console : 0 erreur applicative, seulement 2 réponses `406` attendues (sondage de la liaison
serveur absente). Vérifications automatiques : `bun test tests/` → 96 tests, 0 échec ;
`bunx tsgo --noEmit` et `bun run build` OK.

## Audit confidentialité et rôles

- `src/lib/lovable-error-reporting.ts` : une portée privée (`openPrivateErrorScope`) est ouverte
  tant que l'espace de conception est monté. Dans cette portée, la télémétrie ne reçoit qu'un code
  fixe (`design_workspace_error`), sans message d'origine, sans pile et sans contexte applicatif.
  `src/routes/design.tsx` possède sa propre frontière d'erreur qui n'émet que ce code.
- `src/lib/standex/machine-assets.ts` : l'échec d'analyse du JSON interne d'un GLB ne remonte plus
  le message natif (qui cite un extrait du fichier) mais un message fixe.
- `src/lib/leadmagnet/review.ts` : `staffIdentityFromClaims` ne lit que `app_metadata.standex_role`
  (écrit par le serveur, signé dans le jeton). `user_metadata`, un champ `role` libre ou un choix
  d'interface sont ignorés ; `assertServerTrustedIdentity` refuse toute identité sans rôle fiable.
- `src/lib/leadmagnet/backend.ts` / `submission.ts` : messages client sans nom de table, de schéma
  ni de fichier de migration ; le détail technique vit dans `adminDetail`, réservé à un panneau
  administrateur.
