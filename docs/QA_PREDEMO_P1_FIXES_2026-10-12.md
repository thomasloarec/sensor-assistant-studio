# Correctifs P1 pré-démo — 12/10/2026

Base : `2e6e4aad` (campagne QA). Révision après correctifs : `ed19425f` + ce rapport (commit automatique suivant).
Pas de publication, pas de déploiement, aucune écriture Supabase, aucun changement de schéma. NDA optionnel inchangé.

## Fichiers modifiés
- `src/lib/leadmagnet/application-fit.ts` — B02 limité au but énoncé (un but de détection explicite, pas « un aimant/porte cité n'importe où » ; mesure par un autre appareil ignorée) ; B03 « flow output », « litres per minute », m³/h, exclusion « flow switch » ; C01 « cut the motor power », « switch … load with the reed », passif « switched by the reed » ; températures : plages à deux bornes, °F converties, soudure exclue, zone voisine sans capteur exclue, « reaches / at the sensor / sensor at » reconnus ; seuil bloquant = **> plus haute limite vérifiée** (`MAX_VERIFIED_OPERATING_C`, calculée = 150 °C via MK21) ; écart : câble écarté mesure par mesure, « gap = 500 mm », mention du guide comme seuil de revue ; nouveaux champs `validationPoints` (petit aimant, ±1 mm) et `sensorSiteC`.
- `src/lib/leadmagnet/thermal-fit.ts` (nouveau) — avertissement par gamme : `exceeded`, `conditional` (ex. MK21 à −40 °C : couvert câble immobile seulement), `unknown` (pas de fiche transcrite). Jamais « qualifié ».
- `src/components/leadmagnet/design-space.tsx` — avertissement thermique sur chaque carte (`notice-warning`), encart « Points à valider avec la R&D Standex » (`notice-info`).
- `src/lib/leadmagnet/submission.ts` — `missingBusinessContext` dans `checkSubmission` : volume, phase, date de lancement, durée = valeur réelle ou « Non défini pour le moment » explicite. Date d'échantillons facultative. Aucune donnée réécrite ; empreinte de consentement inchangée (le contrôle ne touche pas le DTO).
- `src/lib/leadmagnet/dossier.ts` — phase par défaut `unknown` (au lieu d'`exploration`) ; valeur déjà acceptée par le SQL existant.
- `src/components/leadmagnet/project-context-fields.tsx` — option « Choisir une phase » tant que rien n'est choisi.
- `src/lib/i18n/messages.json` — 12 entrées × 7 traductions (ordre d'origine conservé).
- Tests : `tests/qa-predemo-p1-fixes-2026-10-12.test.ts` (nouveau, 67 tests), `tests/qa-broad-predemo-2026-10-12.test.ts` (10 `test.failing` → `test`), `tests/questionnaire-render.test.tsx` (+3 rendus réels), `tests/lead-magnet.test.ts` (fixture : champs différés explicitement), `tests/i18n-coverage.test.ts` (cardinalité 3 271).
- `AGENTS.md` — deux règles d'architecture.

## Défauts passés de rouge à vert (anciens `test.failing`)
B02 porte dans une autre réponse · B03 « proportional flow output … litres per minute » · C01 « cut the motor power » · C01 « switch the mains load with the reed » · C02 « component temperature at the sensor reaches 180°C » · C03 câble dans la même phrase · C03 « gap = 500 mm » · 300 °F · 150 °C MK21 · contexte projet non renseigné à la soumission. Le test 140 °C est réécrit : pas de blocage global, avertissement MK03 « dépassé », MK21 couvert.

## Vérification
| Commande | Résultat |
|---|---|
| `bun test tests/` | **1311 réussis, 0 échec, 94 876 assertions, 102 fichiers** (avant : 1241) |
| `bunx tsgo --noEmit` | 0 erreur |
| `bun run build` | OK |
| `bun scripts/i18n-inventory.ts` | 0 manquant / 0 non traduit |

Rendus réels (happy-dom, composant `DesignSpace` réel, session et backend simulés) : A06 → cartes + avertissement thermique ; C02 220 °C → aucune carte + « Aucune correspondance standard documentée » ; C03 petit aimant ±1 mm → cartes + points de validation.
**Non vérifié :** navigateur authentifié, captures desktop/mobile, soumission réelle vers le serveur (le contrôle serveur SQL n'exige toujours pas ces champs : non modifié, schéma interdit).

## Compromis
- Une plage couverte par la fiche n'affiche rien : cela ne vaut pas qualification de la référence commandable (texte du guide R&D inchangé).
- Gammes sans fiche (GENERIC, CUSTOM exclu) : « inconnue — à vérifier ».
- Anciens dossiers enregistrés avec `exploration` par défaut sont lus comme une phase choisie (indiscernable) : à confirmer par le client à la relecture.
- « Another sensor detects the lid » n'annule plus un blocage B02 (détection attribuée à un autre appareil).

## Restant (prochain lot)
- P1 UX : écran « aucune correspondance » trop verbeux.
- P1 : contrôle serveur du contexte projet (SQL) non aligné sur le client.
- P2 : A05 dimensions en texte libre non filtrées ; MK11 fileté vs emmanché ; libellé MK24-A-J ; surcharge du texte connecteurs ; « je ne sais pas » / « ??? ok » tapés comptent comme réponse (toujours `test.failing`) ; montage seul suffit à afficher des cartes.
- Les règles restent des motifs de texte : d'autres reformulations peuvent échapper. Aucune garantie d'exhaustivité.
