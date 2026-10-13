# Lot 2 — fidélité MK20/1, MK20/2 et matériaux MK11 (2026-10-13)

Base HEAD : de080bfeec6dfd1ee8c54268bec801771720b16d (lot 1 conservé, aucune règle application-fit modifiée).

## MK20/1 et MK20/2 (MK21 inchangé)
- Catalogue : `section: "one_flat"`, `leads: "wires"`. Cotes officielles inchangées : MK20/1 10 × Ø3 × 2,7 (méplat), MK20/2 7,5 × Ø2,7 × 2,5.
- `Body` partagé (atelier + vignettes candidates) extrude un profil à un méplat (`src/lib/standex/section-profile.ts`) le long de l'axe longitudinal. **Profil illustratif** : orientation du méplat et rayons de raccord non tirés de la CAO.
- `cableConstruction` → `wires` : plus de second cylindre rigide ; deux fils isolés sortent d'un seul boîtier. Fiche câble : « Deux fils isolés séparés 2 × 0,06 mm² ». Vue plan 2D : repère pointillé du méplat.
- Matériau : PBT 30 % fibres de verre (déjà présent).

## Matériaux MK11
- Cartes « Couples suggérés » : lignes « Boîtier du capteur » (matériau fiche) et « Filetage » (M5/M6/M8), distinctes du matériau de l'aimant.
- MK11-M5/M8 acier inoxydable, MK11-P-M8 « Plastique Crastin », MK11-B-M6 laiton. Détails : filetage ajouté sous « Boîtier ». MK26 reste PBT GF, MK27 aluminium. Aucun prix.

## Vérifications exécutées
- `bun test tests/` : 1 699 tests, 1 698 pass / 1 fail → le seul échec était le compte d'entrées i18n (3 339 → 3 344, +5 clés traduites 8 langues), mis à jour puis vert.
- `tests/manual-feedback-lot2-2026-10-13.test.ts` : 12 / 12.
- `bunx tsgo --noEmit` : propre. Inventaire i18n : 0 manquant. Build : automatique plateforme.

## Risques / non vérifié
- Rendu WebGL réel, rotation et budget de contextes non vérifiés en navigateur connecté (aucune session ; Happy DOM = repli SVG). Tests géométriques = profil pur + câblage source du composant partagé.
- Aucun déploiement, aucune migration, aucune écriture Supabase, NDA inchangé.
