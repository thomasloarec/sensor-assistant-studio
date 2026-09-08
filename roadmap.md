# Feuille de route — parcours Lead Magnet (projet privé, SQL non appliqué)

## En cours
- [x] Adaptateur Supabase réel + RPC V1.2
- [x] Composant de suivi client (dossiers, retours, offres, échantillons)
- [x] Console Standex (boîte de réception, revue, notes, offre, échantillons, preuve NDA)
- [ ] Câbler le suivi client dans /design (reprise, envoi réel, plus de simulation locale)

## Audit racine 2026-09-08 (9 tests runtime en échec)
- [ ] 1. Lire le vrai `business.annualVolume` `{kind, sensorsPerYear}` en SQL ; entier sûr non négatif ; tests 999/1000/custom/inconnu
- [ ] 2. Refuser explicitement NaN/±Infini (le test `x <> x` ne détecte rien en Postgres)
- [ ] 3. Valider le schéma réel du dossier soumis (but, contact, structures) — pas de JSON arbitraire
- [ ] 4. Lier le consentement au dossier/révision/empreinte, valider la date et la portée ; consentement réel dans `open_upload_session` ; pas de titre confidentiel avant NDA vérifié
- [ ] 5. Verrouiller le dossier dans `accept_variant` et refuser une variante périmée
- [ ] 6. Retour d'échantillon rattaché à la révision réellement testée ; interdire la réactivation d'un échantillon périmé ; ordre de verrouillage dossier→échantillon
- [ ] 7. Preuve NDA : dépôt du document signé avec empreinte calculée, ou preuve externe déclarée ; jamais de signature automatique
- [ ] 8. Annuaire interne avec nom/e-mail vérifiés (plus d'identifiants techniques à l'écran)
- [ ] 9. Envoi réel du fichier 3D depuis la mémoire après consentement/NDA, visible par la R&D affectée
- [ ] 10. Sonde : comparer la version réelle du serveur à la version requise

## Bibliothèque connecteurs documentés
- [ ] Ajouter les 4 boîtiers JST documentés (XHP-2/3, PHR-2/3) en préremplissage, `à vérifier par la R&D`, brochage/jauge inconnus, conservés à l'export et dans l'instantané

## Vérifications finales
- [ ] `bun test tests/`, `bunx tsgo --noEmit`, build, recette SQL 46 contrôles + 9 tests racine, smoke navigateur
- [ ] Documentation mise à jour (état réellement testé, limites)
