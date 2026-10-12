# Remédiation P1 (et P2 à faible risque) — campagne indépendante round 2

Date : 2026-10-12. Base : révision suivant c48d90ba (campagne docs/QA_INDEPENDENT_ROUND2_2026-10-12.md).
Aucune publication, aucun déploiement, aucune migration (v1.11 reste STAGÉE, non appliquée), aucune
modification Supabase, NDA ou authentification. Aucune attente de test round 2 modifiée, aucun test supprimé,
aucun `test.failing`.

## Résultats exécutés

| Commande | Résultat |
|---|---|
| `bun test tests/qa-independent-round2-2026-10-12.test.tsx` | 174 pass / 0 fail (avant : 138 / 36) |
| `bun test tests/` | 1 637 pass / 0 fail, 106 fichiers |
| `bun scripts/i18n-inventory.ts` | TOTAL 0 (untranslated 0, missing 0) |
| `git diff --check` | propre |
| typecheck / build | contrôle automatique de la plateforme (tsgo/build manuels non lancés) |

Seule attente historique ajustée : la cardinalité du dictionnaire (`tests/i18n-coverage.test.ts`,
3 307 → 3 317), qui suit par construction chaque libellé ajouté — 10 nouveaux textes traduits dans les 8 langues.

## Corrections (src/lib/leadmagnet/application-fit.ts sauf mention)

- **D01 contacteur externe** : `\b` autour de `contact` (ne lit plus « contactor ») ; câblage sûr reconnu quand le
  qualificatif précède l'interface (« separate externally rated contactor ») et « reed only signals » ; double
  négation « not without a contactor » n'est plus un refus. Les blocages de puissance directe (MX01–MX03, R18, R19,
  mutations `mains`) restent rouges côté produit = bloqués.
- **D02 MK02 aimant intégré** : un refus d'aimant EXTERNE n'est plus bloquant si une cible ferreuse est affirmée et
  un aimant de polarisation intégré / MK02 est cité. Point de validation R&D ajouté, sans distance garantie.
  « No magnet allowed anywhere », cible non ferreuse ou « no ferrous insert » bloquent toujours (R14, R15, MX11).
- **D03 Hall linéaire** : nouveau point `hall_analog_review` (revue d'ingénierie, statut « review » dans le panneau),
  aucune carte reed proposée, aucune référence Hall inventée. Hall nié ou « unrelated » ignoré ; le 2 fils NO (R17) reste catalogue.
- **D04 Unicode** : U+2212 et tirets U+2010–2015 lus comme « - » dans `temperaturesC` (−40…+85 conservé).
- **D05 but nié** : « detection is not required » n'est plus un but de détection masquant la mesure continue.
- **D06 langues** : mesure de température et sortie analogique reconnues en FR, DE, ES, IT, ZH (+ NL) ; « continu »
  seul n'est volontairement PAS lu comme mesure (évite de bloquer « fonctionne en continu à 140 °C »).
  RU et JA : pas de reconnaissance sémantique ajoutée — lacune connue, non revendiquée.

## P2 traités (faible risque)

- `envelope-text.ts` : « must fit inside » proposé, toujours sur consentement ; cotes d'aimant/pièce/câble ignorées.
- Remplissages : « weiß nicht » (ß→ss), mots sans voyelle (« qzxv ») non substantiels.
- Montage seul / cotes seules : exploration, jamais recommandé.
- Points de validation non bloquants : acier/décalage, blindage, aimants voisins, deux seuils/sorties indépendants.

## Non vérifié

- Rendu WebGL réel, rotation et clavier dans un navigateur (Happy DOM = repli SVG).
- Parcours authentifié et soumission réelle (LOVABLE_BROWSER_AUTH_STATUS=no_supabase).
- Validation serveur des champs business (migration v1.11 non appliquée).
- Reconnaissance sémantique RU/JA.
