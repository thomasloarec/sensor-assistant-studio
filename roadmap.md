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
