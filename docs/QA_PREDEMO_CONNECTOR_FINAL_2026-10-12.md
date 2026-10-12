# QA pré-démo — connecteurs et erreurs ciblées (12/10/2026)

Base initiale : `2bf4d39a254cafdcc34c537a89648cd184dd13ef`.
Révision du code testé : `a1fcd7e31381d4a127e553b574eb32c648c0bded` (le présent rapport et les consignes de dossier sont enregistrés après cette révision).

## Périmètre livré

- Les deux points d’entrée de `DesignSpace` utilisent `ConnectorChoices`, une présentation commune sans nouveau stockage ni changement de données : quatre tuiles documentées, état sélectionné, nombre de voies, pas et enveloppe extérieure (saillie XH comprise).
- Nom choisi et « Compatibilité à confirmer par Standex » visibles. Sources fabricant, cotes détaillées, contacts/embases distincts, disponibilité inconnue, câble/genre/sertissage/brochage et absence de qualification dans un dépliant natif fermé par défaut. Un seul aperçu géométrique, pour le boîtier sélectionné ; pas de lien ou dépliant dans un bouton.
- Référence manuelle et autre référence conservées dans le dépliant manuel. Fermer la préférence délègue le choix sans effacer la référence ; rouvrir retrouve la sélection.
- Le caption de l’aperçu ne répète plus le titre ; le repli SVG utilise les jetons du socle. Budget WebGL, perte de contexte et mouvement réduit inchangés.
- `humanRpcError` reconnaît uniquement les identifiants exacts `annualVolume`, `projectPhase`, `seriesStartDate`, `seriesDurationYears` après `BUSINESS_CONTEXT_REQUIRED:`. Champs inconnus ignorés, dédoublonnage, repli générique sans identifiant connu. Aucune donnée interne brute affichée.
- Messages ciblés en français canonique, traduits au rendu dans les huit langues avec un emplacement distinct par champ. Action : compléter le contexte projet ou déclarer chaque champ « Non défini pour le moment ». Aucun déplacement automatique de formulaire ajouté : l’erreur suit le chemin existant de refus vers le message d’envoi.

## Vérifications exécutées

| Vérification | Résultat |
|---|---|
| `bun test tests/` — première exécution | 1 448 pass, 1 fail, 96 298 assertions, 105 fichiers, 48,86 s |
| `bun test tests/detection-data-sql.test.ts` — reprise isolée sans modification | 14 pass, 0 fail, 93 assertions, 18,94 s |
| `bun test tests/` — reprise complète sans modification des tests SQL | **1 449 pass, 0 fail, 96 304 assertions, 105 fichiers, 41,48 s** |
| `bun scripts/i18n-inventory.ts` | **TOTAL 0** : aucun texte non traduit, manquant ou code traduit ; 3 307 clés |
| Compilation automatique de l’aperçu | **build OK**, dernier signal observé : 12/10/2026 12:42:38 UTC |
| `bunx tsgo --noEmit` / `bun run build` manuels | Non exécutés : l’environnement impose les contrôles automatiques et interdit leur relance manuelle ; aucun résultat distinct de typecheck n’est disponible |
| Scans charte sur les fichiers applicatifs modifiés | Vides : couleurs brutes, hex, durées brutes, `text-xs` |

Le premier échec complet est le test existant « la lecture effective est réellement exécutable par anon et par authenticated » (`tests/detection-data-sql.test.ts:111`) : `r.rows[0]` absent dans PGlite. Il passe isolément puis dans la reprise complète ; aucune assertion, migration ni logique applicative concernée n’a été modifiée. Cause de cette intermittence non déterminée.

Un premier test du nouveau rendu a aussi révélé une limite de Happy DOM : il ne masque pas les descendants d’un `<details>` fermé pour les requêtes d’accessibilité. Le test vérifie donc l’attribut fermé réel et que tous les liens sont à l’intérieur du dépliant, puis exerce explicitement son ouverture. Le comportement navigateur authentifié n’est pas prétendu vérifié.

## Preuves et limites

51 tests ajoutés : 50 pour les erreurs/parité i18n et la structure partagée, un parcours de rendu réel `DesignSpace` pour préférence, absence de sélection automatique, sélection PHR-2, sources/caveats, fermeture et conservation à la réouverture. Les 1 398 tests de base demeurent ; seule l’assertion de message générique du test SQL v1.11 a été remplacée par l’exigence plus précise « Phase du projet ».

Le navigateur local a été ouvert sans connexion à `/design`, puis redirigé vers l’accès réservé à `/`. Capture consultée : uniquement écran de connexion. **Pas de preuve visuelle des connecteurs, pas de recette E2E authentifiée, pas de vrai envoi, pas de vérification serveur de production.** La préférence checkbox de l’ancien panneau détaillé est couverte par les tests structurels existants ; le parcours de rendu ajouté exerce les boutons de préférence de l’espace guidé et leur sélecteur partagé.

## Fichiers concernés

`src/components/leadmagnet/{connector-choices,connector-preview,design-space}.tsx`, `src/lib/leadmagnet/rpc.ts`, `src/lib/i18n/messages.json`, `tests/{connector-final-errors,business-context-sql,i18n-coverage}.test.ts`, `tests/questionnaire-render.test.tsx`, `docs/design-language.md`, consignes `AGENTS.md` de dossier et `roadmap.md`, présent rapport.

**Aucune publication, aucun déploiement, aucune exécution SQL sur Supabase, aucune modification du NDA/consentement/privacy. La migration v1.11 reste NON APPLIQUÉE ; ces messages sont prêts à interpréter ses refus, pas une preuve que son contrôle est actif.**