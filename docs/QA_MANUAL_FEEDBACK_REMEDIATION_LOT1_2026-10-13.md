# Retours de test manuel — Lot 1 (13 octobre 2026)

Périmètre : recommandation technique, saisie, textes. **Hors périmètre : 3D MK20 (lot précision séparé).**
Aucune publication, aucune migration (v1.11 reste non appliquée), aucune écriture Supabase, NDA inchangé.

## Résultats exécutés
- `bun test tests/` : **1 687 pass / 0 fail**, 107 fichiers (1 637 avant + 50 nouveaux dans `tests/manual-feedback-lot1-2026-10-13.test.tsx`).
- `bunx tsgo --noEmit` : aucune erreur.
- Build automatique : `build OK`.
- `bun scripts/i18n-inventory.ts` : 0 non traduit, 0 manquant. Dictionnaire 3 339 entrées (+22 nettes ; compteur de `i18n-coverage.test.ts` mis à jour, seule attente existante modifiée — c'est un décompte).
- Aucun `test.failing`, aucun test supprimé.

## Corrections
| Retour | Correction | Fichiers |
|---|---|---|
| A01 / MK26 | Classement traçable (`suggestion-ranking.ts`) : MK26 (tension plus élevée), MK21 (haute température), MK02 (cible ferreuse), MK27 (aluminium) réservés à la liste complète sauf exigence écrite vérifiée. Aucun prix ni matériau dans le score. MK26 confirmé PBT fibres de verre, −20…+80 °C câble immobile. Choix déjà enregistré conservé en tête et annoté. | suggestion-ranking.ts, pair-cards.ts (`keepOrder`), design-space.tsx |
| A02 | Champ décimal contrôlé (`9.6` et `9,6` → 9.6, saisie `9,` conservée). MK36/37/38 : retenue documentée pour trou 9,53 mm (fenêtre 0,3 mm, aucun serrage garanti). Cylindres plus petits : « entre physiquement, adaptateur/douille à étudier », classés après, jamais exclus. | decimal.ts, decimal-mm-input.tsx, candidates.ts |
| A05 | Choix M5/M6/M8 + « taille inconnue — à vérifier » sous « Corps fileté » ; diamètre nominal, pas perçage. Filtre réel MK11-M5/B-M6/M8/P-M8. `threadMm` optionnel dans le JSON (aucune colonne SQL). | dossier.ts, dossier-io.ts, candidates.ts, suggestion-filters.ts, requirement-answer.ts, english-translation.ts |
| B01 | Encart « Dimensions détectées » placé avant les couples, titre, avertissement « pas encore pris en compte », bouton principal puis secondaire. Toujours aucune application sans clic. | design-space.tsx, envelope-text.ts |
| B02 | Alerte de carte courte en gras ; plages complètes par état du câble + révision de fiche dans « Voir les détails ». Toujours non bloquant. | thermal-fit.ts, sensor-card.tsx |
| B03 | 140 °C au capteur → MK21 en tête avec raison ; 220 °C → revue d'ingénierie (inchangé). | suggestion-ranking.ts |
| B04 | Détection multi-phrases des deux sorties / fil commun / trois fils ; « deux états, une sortie » exclu. Texte : un capteur proposé n'est qu'un élément du système. | application-fit.ts |
| B05 | MK02 promu quand aimant intégré + cible acier ; carte « Aimant : intégré au capteur ». « Aucun aimant nulle part » / aluminium bloquent toujours. | suggestion-ranking.ts, design-space.tsx |
| B06 | Cause : `no` sans limite de mot dans « another ». Limites ajoutées ; « autre aimant à proximité » → point d'interférence non bloquant. | application-fit.ts |
| C03 | Négation après la liste (« … not permitted »), « magnetic marker », `0–10 VDC`. Palette magnétique à seuil reste candidate. | application-fit.ts |
| Langues mélangées | Puces paramétrées (`labelKey` + `labelArgs`, `filterLabel`) dans les 8 langues ; plus aucun `t(f.label)`. | suggestion-filters.ts, design-space.tsx |

## Limites honnêtes
- Phrases exactes A01/B06/C03 de l'utilisateur non reçues mot pour mot : les tests utilisent des reconstructions fidèles + variantes.
- B01/B05/A05 vérifiés par la logique pure et par la structure du code d'écran, pas par un rendu navigateur connecté (pas de session disponible).
- Tension « plus élevée » : la promotion MK26 se fonde sur la tension écrite au-delà de 180 V et documentée par MK26 ; le courant et la puissance ne sont pas encore comparés.
- Les champs de dimensions (longueur/largeur/hauteur) gardent l'ancienne saisie ; seul le diamètre du trou utilise le nouveau champ décimal.
- 3D MK20 non modifiée.
