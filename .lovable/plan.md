# Audit lecture seule — extension « dashboard interne » Standex

Rien n'a été modifié. Backend inspecté uniquement par le code du dépôt : l'outil SQL
n'est pas branché sur `yyobodalwtsqdyrqwkjk`, donc l'état réel des lignes (rôle de
Thomas Loarec, dossiers existants) n'est pas vérifiable depuis ici — il est connu
seulement par l'historique projet, pas confirmé par une requête ce jour.

## 1. Ce qui existe déjà et sera réutilisé

**Routes**
- `src/routes/index.tsx` (205 l.) — accueil client.
- `src/routes/design.tsx` — redirection vers `/`.
- `src/routes/internal.tsx` (1 912 l.) — banc de test assistant (scénarios, trace,
  revue, données lead) sur les tables `sensor_test_*` du schéma V0.2. Sans rapport
  avec le CRM ; à ne pas mélanger.
- `src/routes/standex.tsx` (1 308 l.) — **console interne** existante : boîte de
  réception, affectation, revue R&D, notes internes, offre, échantillons, preuve NDA,
  rapport anglais, visionneuse documents. C'est la base du dashboard.

**Serveur (schéma `lead`, non exposé à REST — tout passe par RPC)**
- Tables : `staff_members` (role rnd/sales/admin, display_name), `design_dossiers`
  (owner_id, title, current_revision, nda_required, nda_status),
  `design_collaborators`, `dossier_assignments`, `design_revisions` (snapshot,
  content_hash, consents, transferred_files), `design_reviews` (verdict, published,
  exact_part_number, variant), `internal_notes`, `offers` (tiers, moq, currency,
  incoterm, valid_until, part_number, annual_volume_basis), `sample_requests`,
  `nda_proofs`, `upload_sessions`, `audit_log`, `revision_reports_en` (V1.5).
- RPC recensées dans `src/lib/leadmagnet/rpc.ts` (`LEAD_RPC`) : `lead_staff_inbox`,
  `lead_staff_view`, `lead_assign_dossier`, `lead_publish_review`,
  `lead_add_internal_note`, `lead_create_offer`, `lead_request_samples`,
  `lead_update_sample`, `lead_revalidate_sample`, `lead_set_dossier_title`,
  `lead_my_capabilities`, `lead_schema_version`, `lead_set_nda_requirement`,
  `lead_report_en_*`. Version serveur exigée : `1.4` (`REQUIRED_LEAD_SCHEMA_VERSION`),
  base réellement à 1.7.
- `lead_priv.staff_inbox()` renvoie déjà `assigned`, `triage` (admin), `staff_directory`
  avec e-mails et noms : socle direct des vues tableau/pipeline.

**Côté application**
- `src/lib/leadmagnet/supabase-adapter.ts` — `fetchStaffInbox`, `fetchStaffView`,
  `assignDossier`, `publishReview`, `addInternalNote`, `createOffer`, `updateSample`,
  `recordNdaProof`, `uploadDesignFile`, `signedFileUrl`, types `StaffInbox`,
  `DossierView`, `OfferView`, `SampleView`.
- `src/lib/leadmagnet/backend.ts` — `checkLeadBackend`, `staffActionEnabled(status, roles)`.
- `src/lib/leadmagnet/review.ts` — `createOffer`, invariants revue/offre/rôle.
- `src/lib/leadmagnet/english-report.ts` — `selectEnglishReport`, `canExportEnglish`
  (états missing/pending/ready) ; pipeline `english-report.pipeline.ts` + serveur.
- `src/lib/leadmagnet/dossier-io.ts` — `parseServerSnapshot` (original client).
- 3D réelle : `src/components/standex/workshop/workshop.tsx`,
  `candidate-thumbnail-scene.tsx`, `src/components/leadmagnet/candidate-thumbnail.tsx`
  (`CandidateThumbnail`, plafond de contextes WebGL, fallback 2D). Déjà utilisée dans
  `standex.tsx` : à réutiliser telle quelle, pas de nouveau viewer.
- UI : `WorkspacePanel`, `DocumentViewer`, `BrandLogo`, jetons de `src/styles.css`.

## 2. Ce qui manque réellement pour la V1 demandée

Aucune de ces données n'existe aujourd'hui, ni en table ni dans le snapshot client
(le snapshot n'a que `contactName`, `contactEmail`, `contactCompany`, `annualVolume`) :

- statut pipeline (Lead → … → Dead) ;
- société / projet / **pays** normalisés côté Standex ;
- responsables **commercial** et **FAE** distincts (aujourd'hui `dossier_assignments`
  est une simple appartenance sans rôle sur le dossier) ;
- prix unitaire retenu, revenu annuel estimé, coût FAE, marge ;
- checklist par rôle avec échéance, âge du projet et âge de l'étape ;
- notes SAP anglaises générées à chaque avancement ;
- envoi e-mail de la revue au client avec lien retour.

## 3. Delta minimal proposé

**Base (une seule migration additive V1.8, à appliquer par vous, jamais depuis ici)**
- `lead.dossier_crm` (1 ligne / dossier) : `stage` (enum 8 valeurs),
  `stage_since`, `company`, `project_name`, `country`, `sales_owner`, `fae_owner`,
  `unit_price`, `currency`, `annual_volume_override`, `fae_cost`, `notes_lang`.
  Revenu et marge **calculés**, jamais stockés en double.
- `lead.dossier_tasks` : `dossier_id`, `role` (rnd/sales/admin/fae), `label`, `due_on`,
  `done_at`, `done_by`.
- `lead.sap_notes` : `dossier_id`, `revision`, `stage_from`, `stage_to`, `body_en`,
  `created_at`, `author_id` — insert-only.
- RPC nouvelles, mêmes conventions (definer privé + wrapper invoker, `search_path`
  sûr, `NOT_ALLOWED`, CAS sur `updated_at`/révision) : `lead_crm_board`,
  `lead_set_stage`, `lead_set_crm_fields`, `lead_set_owners`, `lead_upsert_task`,
  `lead_complete_task`, `lead_add_sap_note`, `lead_admin_overview`.
- `REQUIRED_LEAD_SCHEMA_VERSION` passe à `1.8` seulement après application réelle,
  sinon le dashboard s'affiche en lecture dégradée (le mécanisme existe déjà).

**Application**
- `src/lib/leadmagnet/crm.ts` : enum des 8 statuts, transitions autorisées, calcul
  `revenuAnnuel = volume × prixUnitaire`, `marge = revenu − coûtFAE`, inconnus
  explicites (jamais 0 implicite), âge projet/étape.
- `src/lib/leadmagnet/sap-note.ts` : génération déterministe anglaise, concise,
  à partir des données réellement présentes — pas d'appel fournisseur.
- Adaptateur : ajout des appels ci-dessus dans `supabase-adapter.ts`.
- `/standex` : trois vues (Tableau, Pipeline par statut, Tâches) au-dessus de la
  console actuelle, qui reste intacte. Page `/standex/admin` (rôle admin) : staff,
  affectations commercial/FAE, seuils, diagnostic de version.
- Revue : la langue client vient de `sourceLocale` déjà conservé ; original client et
  rapport anglais restent deux objets distincts (`revision_reports_en`).

## 4. Limites réelles à acter avant de coder

- **E-mail : aucun fournisseur.** Vérifié : aucun `resend/sendgrid/smtp/sendEmail`
  dans le dépôt, et aucun domaine d'envoi configuré pour ce projet. Sans domaine
  vous possédant, aucun e-mail ne peut partir. V1 livrera donc un **lien de revue
  copiable** et une file « à notifier » ; l'envoi réel sera branché après mise en
  place d'un domaine d'envoi.
- **Activation base obligatoire** : sans V1.8 appliquée, statuts, tâches, marges et
  notes SAP n'existent pas côté serveur. Aucun stockage local de substitution.
- **Rôle admin** : le code lit le rôle via `lead_my_capabilities` ; l'attribution
  admin de Thomas Loarec est connue par l'historique projet mais n'a pas pu être
  reconfirmée par une requête ce jour.
- **FAE** n'est pas un rôle serveur existant (`rnd`/`sales`/`admin`) : il faudra soit
  étendre l'enum, soit porter le FAE dans `dossier_crm.fae_owner`. Proposition :
  `fae_owner` référence un `staff_members` de rôle `rnd`, sans nouvelle permission.
- Aucune donnée client, société, pays ou compte ne sera inventé : champs vides tant
  que la personne ne les saisit pas.

## 5. Ordre d'exécution proposé

1. Migration V1.8 rédigée, relue, appliquée par vous.
2. Modèle `crm.ts` + `sap-note.ts` + tests unitaires (statuts, marges, inconnus, âges).
3. Adaptateur + vues Tableau / Pipeline / Tâches dans `/standex`.
4. Page admin + lien de revue et file de notification.
5. Gates : `bun test tests/`, `bunx tsgo --noEmit`, `bun run build`, inventaire i18n,
   les quatre scans `rg` d'AGENTS.md, QA navigateur 1280/390.

Projet privé, non publié ; NDA original inchangé ; backend inchangé tant que vous
n'appliquez pas la migration.
