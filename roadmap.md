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
- 138 tests, typecheck, build et smoke navigateur passent.

## Bloqué (hors de mon contrôle)
- Application de la migration sur `yyobodalwtsqdyrqwkjk` : réservée au propriétaire.
- Provisionnement du premier compte administrateur Standex (`service_role`).
- Signatures électroniques, catalogues distributeurs, registre des entreprises : externes.
