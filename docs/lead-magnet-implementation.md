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

## Ce qui exige une migration ou une configuration externe

1. **Migration SQL versionnée** : `supabase/schema/migration_v1.0_lead_magnet.sql`.
   Schéma `lead` séparé des tables `sensor_test_*` : `design_dossiers`,
   `design_collaborators`, `design_revisions`, `design_reviews`, `internal_notes`, `offers`,
   `sample_requests`, `nda_proofs`, plus `staff_members` (rôles provisionnés côté serveur,
   aucune autoattribution), fonctions `security definer` à `search_path` figé, RLS complet,
   grants minimaux, bucket privé `lead-design-files`. Je n'ai pas d'accès DDL au projet
   `yyobodalwtsqdyrqwkjk` depuis cette session : la migration doit être appliquée dans le SQL
   editor du projet. Tant qu'elle n'est pas appliquée, `checkLeadBackend()` renvoie
   « indisponible » et les actions serveur restent désactivées.
2. **Interface R&D authentifiée** : la logique métier (revues, publication du retour client,
   notes internes, offres, invalidation par version, concurrence optimiste) est implémentée et
   testée dans `src/lib/leadmagnet/review.ts`, mais l'écran R&D n'est pas branché tant que les
   tables et les rôles staff n'existent pas côté backend.
3. **Preuve de NDA signé** : la génération et l'aperçu fonctionnent hors ligne, mais le
   passage au statut « en vigueur » demande une preuve vérifiée côté Standex (empreinte du
   document signé, date, vérificateur), stockée dans `lead.nda_proofs` — donc après migration.
4. **Longueurs standard, combinaisons connecteurs, disponibilités fournisseurs** : registres
   volontairement vides, à remplir uniquement avec des données sourcées.
5. **Préremplissage société** : aucun service de recherche n'est connecté
   (`NO_COMPANY_LOOKUP_CONFIGURED`), la saisie reste manuelle.

## Tests exécutés

`bun test tests/` → **88 tests, 0 échec**, dont 7 dans `tests/nda-docx.test.ts` (empreinte du
modèle, refus d'un fichier non conforme, paragraphes hors champs variables identiques, tous les
autres fichiers du .docx identiques octet pour octet, lieu Standex et mentions Stamp/Signature
préservés, original intact, nom de fichier non signé) et 15 dans `tests/lead-magnet.test.ts` :
exploration sans transfert, confirmé vs hypothèse, filtrage mécanique et encombrement,
polyligne vs distance directe, marges et géométrie incomplète, suffixes de références,
connecteurs non inventés, NDA brouillon incapable d'autoriser un transfert, consentement puis
NDA, volume entier / inconnu, soumission non simulée et instantané sans notes internes, prix
refusé avant revue et hors rôle, invalidation par version et concurrence, seuils
999 / 1000 / inconnu / spécifique, correspondance exacte des références).
`bunx tsgo --noEmit` → aucune erreur. Les suites existantes du banc de test et de l'atelier
sont inchangées et passent.

## Accès aperçu

Aperçu privé : `/` = banc de test interne inchangé ; `/design` = espace de co-conception
(`noindex, nofollow`, non publié).

## Emplacement du code

`src/lib/leadmagnet/` : `dossier.ts`, `candidates.ts`, `cabling.ts`, `connectors.ts`,
`privacy.ts`, `nda.ts`, `nda-docx.ts`, `submission.ts`, `review.ts`, `samples.ts`, `backend.ts`
(logique métier pure, sans UI ni réseau sauf `backend.ts`).
`src/routes/design.tsx` : UI. `supabase/schema/migration_v1.0_lead_magnet.sql` : DDL.

Emplacement réservé pour une future filière « remplacement concurrent » (référence exacte,
datasheet, montage) : non développée, aucun champ inventé.
