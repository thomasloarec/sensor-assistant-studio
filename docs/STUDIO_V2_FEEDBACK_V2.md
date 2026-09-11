# Retours utilisateur V2 — Sensor Studio 1.2.0

La consultation du catalogue ne sélectionne plus de produit sur un clic de carte. Vues 2D/3D, filtres actifs, taille du repère, aides et en-têtes ont été corrigés, avec contrôle desktop et mobile 390 px.

Le catalogue contient 5 aimants en boîtier et 26 entrées nues, dont les 8 configurations des tableaux de la brochure officielle. Le matériau sert au filtrage et à une comparaison qualitative ; aucune rémanence ni distance n’en est déduite.

Le MK03 utilise désormais le cylindre 4003004003 Ø 4 × 19 mm cité dans la liste de validité du guide court p.3. Les 180 paires ajoutées pour cette référence sont distinctes des entrées M02 historiques conservées. 438 paires restent traçables ; 13 familles ont des données publiées et aucune nouvelle calibration physique n’est revendiquée. Le retrait des données du cylindre supprime ses résultats, même si les valeurs M02 restent disponibles.

La qualification de « up / to » reste ouverte. L’hypothèse utilisateur pull-in/drop-out est plausible mais non confirmée, notamment en présence des valeurs D3 inversées du MK04-1A66A-X avec SmCo5 (10,3 / 8,2 mm, brochure p.12). Les nouvelles tables ne sont pas chargées par le moteur. Les nouvelles références donnent un refus en mode de calcul documenté, et restent représentables en 3D. Les géométries actives et positions exactes des lobes sont toujours à caractériser.

Le réglage d’aimant est validé contre une liste finie ; les anciens dossiers sont conservés. La fiche figée lie la prédiction physique éventuelle au couple retenu, plutôt qu’à un réglage distinct de la scène.

Validation : 504 tests, vérification des types et construction de production ; inventaire i18n sans manquants dans les sept traductions. Les nouveaux tests sont dans tests/studio-feedback-v2.test.ts.

Le suivi détaillé, les questions P à U et l’archive brute des tableaux sont dans le dossier utilisateur SUIVI_RETOURS_V2. Pas de publication publique ni de migration appliquée.
