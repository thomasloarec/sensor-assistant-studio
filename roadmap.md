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
