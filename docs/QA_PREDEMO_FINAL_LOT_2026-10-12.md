# QA pré-démo — lot final (12/10/2026)

Base : HEAD après `docs/QA_PREDEMO_P1_FIXES_2026-10-12.md`. Aucune publication, aucun déploiement, aucune écriture Supabase, NDA et consentements inchangés.

## Résultats des commandes (exécutées)
| Commande | Résultat |
|---|---|
| `bun test tests/` | **1 398 pass, 0 fail**, 95 747 expect(), 104 fichiers |
| `bunx tsgo --noEmit` | aucune erreur |
| `bun run build` | OK (code 0) |
| `bun scripts/i18n-inventory.ts` | TOTAL 0 (0 non traduit, 0 manquant) |
| Contrôles de charte (couleurs brutes, durées, text-xs) sur les fichiers modifiés | vides |

Aucun `test.failing` restant (les deux défauts P2 « je ne sais pas » / « ??? ok » sont convertis en `test()` normaux).

## Corrigé dans ce lot
1. **Validation serveur (P1)** — `supabase/schema/migration_v1.11_business_context_guard.sql` : déclencheur `BEFORE INSERT` sur `lead.design_revisions` qui lit le snapshot canonique (pas un drapeau client). Volume annuel, phase, date de démarrage série, durée série : valeur valide **ou** marqueur explicite `business.undefinedFields`. Échéance échantillons facultative. Historique non touché (insert seulement). **MIGRATION NON APPLIQUÉE** — à appliquer uniquement lors d'un déploiement explicite. Testée sur PGlite (`tests/business-context-sql.test.ts`, 22 tests), pas sur le vrai backend. Le même contrôle est dans `checkSubmission` (volume entier >0, phase connue, date ISO réelle, durée 0,5–100). Les anciens projets avec « exploration » par défaut ne peuvent pas être distingués d'un choix volontaire : non réinterprétés.
2. **Écran « aucune correspondance » (P1)** — trois statuts : modalité inadaptée / étude d'ingénierie (C02, C03 : pas d'alerte rouge, « ce n'est pas un refus ») / informations insuffisantes. Raison courte, phrase de la personne, 1–2 actions (« Modifier cette réponse », « Contacter l'ingénierie Standex » → envoi du projet), détails et sources repliés.
3. **A05** — `envelope-text.ts` : détecte une place capteur explicitement nommée (EN/FR, mm/cm), propose « Appliquer » / « Ne pas appliquer », n'écrase jamais des cotes saisies ; aimant, pièce, câble ignorés ; unités manquantes, négatives ou alternatives → « à vérifier ». Test d'interface : application après clic ; test de filtrage : plus d'exclusions après application.
4. **A02 MK11** — précision facultative `style` sur `kind:"screw"` : « Corps fileté — se visse dans un trou taraudé » (MK11 seuls) vs « Collerette ou boîtier fixé par vis ». MK36/37/38 restent « à emmancher ». Anciens dossiers `screw` inchangés ; le SQL existant accepte la clé supplémentaire.
5. **A03** — affichage « MK24 » + sous-titre « Forme A · connexions J — configuration illustrée » ; identifiant `MK24-A-J` inchangé.
6. **P2 remplissage** — « je ne sais pas », « I don't know », « no idea », « ??? ok » (et quelques équivalents DE/ES/IT) ne comptent pas. Montage seul ou cotes seules → « Exploration du catalogue uniquement », sans étiquette « Recommandé ». La couverture des huit langues n'est pas exhaustive.

Tests ajoutés : `tests/qa-predemo-final-lot-2026-10-12.test.tsx` (64), A05 dans `tests/questionnaire-render.test.tsx`, SQL dans `tests/business-context-sql.test.ts`.

## Fichiers modifiés
`supabase/schema/migration_v1.11_business_context_guard.sql` (nouveau), `src/lib/leadmagnet/{submission,rpc,dossier,dossier-io,candidates,suggestion-filters,pair-cards,application-fit,envelope-text}.ts`, `src/lib/standex/sensor-catalog.ts`, `src/components/leadmagnet/{compatibility-panel,design-space,result-view,project-context-fields}.tsx`, `src/lib/i18n/messages.json`, tests ci-dessus, `tests/i18n-coverage.test.ts` (3 297 clés), `tests/qa-broad-predemo-2026-10-12.test.ts`.

## Reste ouvert
- **P2 connecteurs clôturé dans le complément** : présentation commune compacte, sources et qualifications repliées, sélection conservée. Voir `docs/QA_PREDEMO_CONNECTOR_FINAL_2026-10-12.md` (code testé `a1fcd7e31381d4a127e553b574eb32c648c0bded`).
- Migration v1.11 toujours **NON APPLIQUÉE** ; le complément ajoute les noms de champs localisés au message client, sans prétendre que le garde serveur est actif.
- Repérage par texte : des formulations non testées peuvent passer à travers.
- Non testé : navigateur connecté, captures d'écran, vrai envoi au serveur, envois de fichiers, droits d'accès.

### Vérification finale du complément

`bun test tests/` : **1 449 pass, 0 fail, 96 304 assertions**, 105 fichiers, 41,48 s ; inventaire huit langues **TOTAL 0** ; compilation automatique **build OK**. Un premier échec SQL local intermittent est consigné dans le rapport complémentaire avec sa reprise isolée et complète, sans modification du test. Aucun résultat distinct de typecheck automatique n'est disponible pour ce complément ; les commandes manuelles de compilation/typecheck sont interdites dans l'environnement actuel. La seule capture navigateur est l'écran d'accès réservé, pas une validation visuelle du questionnaire. Aucun déploiement, accès Supabase externe ni authentification utilisateur.
