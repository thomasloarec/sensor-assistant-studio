# QA adverse pré-démo — 12/10/2026

Révision testée : `2e6e4aad36e4105cfeb78753148988dcac013525` (HEAD au début de la campagne).
Aucune modification de logique applicative. Ajouts : `tests/qa-broad-predemo-2026-10-12.test.ts` et ce rapport.
Pas de publication, pas de déploiement, aucune lecture ni écriture sur la base Supabase réelle, NDA et authentification inchangés.

## 1. Commandes et résultats

| Commande | Résultat | Durée |
|---|---|---|
| `bun test tests/` (avant ajout) | 1171 réussis, 0 échec, 94 293 assertions, 100 fichiers | 47,8 s |
| `bun test tests/` (après ajout) | 1241 réussis, 0 échec, 94 391 assertions, 101 fichiers | 63,8 s |
| `bun test tests/qa-broad-predemo-2026-10-12.test.ts` | 70 réussis (dont 13 `test.failing` = défauts confirmés), 98 assertions | 0,2 s |
| `bunx tsgo --noEmit` | 0 erreur | 4,3 s |
| `bun run build` | OK | 16,3 s |
| `bun scripts/i18n-inventory.ts` | 0 non traduit, 0 manquant (8 langues) | — |

Une sonde ponctuelle hors suite (`/tmp/qa/probe.ts`, 55 formulations) a servi à repérer les cas, puis chaque constat a été figé dans le fichier de tests.

**Convention :** `test.failing` = le test écrit le comportement *attendu*. Il passe tant que le défaut existe et deviendra rouge à la correction (il faudra alors le passer en `test`). Une suite verte n'est donc **pas** une absence de défauts.

## 2. Matrice des scénarios (règle de compatibilité, exécutée)

| Cas | Attendu | Constaté | Statut |
|---|---|---|---|
| A01 lave-vaisselle NO 5 V 2 mA | pas de blocage | pas de blocage | PASS |
| A02 vérin, montage externe / fileté | pas de blocage | pas de blocage | PASS (règle) — distinction fileté/emmanché : revue statique seulement |
| A03 PCB CMS | pas de blocage | pas de blocage | PASS (règle) — variantes MK24 non testées en rendu |
| A04 protecteur | pas de faux blocage | pas de blocage | PASS — la mise en garde « pas un verrouillage certifié » n'existe que dans l'encart C01 : non affichée ici (P2) |
| A05 8×5×4 mm en texte libre | pas de blocage | pas de blocage | PASS — mais le texte libre ne filtre **pas** l'encombrement (seule la saisie structurée compte) : P2 |
| A06 −40..+85 °C vs gamme −30..+80 | avertissement candidat | aucun avertissement | **FAIL P1** (non implémenté, connu) |
| A07 vanne deux positions | pas de blocage | pas de blocage | PASS |
| B01 aluminium sans aimant EN/FR | blocage | `no_magnetic_source` | PASS |
| B02 température continue 4–20 mA | blocage | `continuous_temperature_measurement` (EN, FR, réparti sur 2 questions, sans °) | PASS |
| B03 débit 0–40 L/min 0–10 V sans aimant/turbine EN/FR | blocage | `continuous_flow_measurement` (+ `no_magnetic_source`) | PASS |
| C01 courant moteur direct « without a relay or contactor » | blocage | `direct_load_switching (8 A · 230 V AC)` | PASS |
| C01 contacteur externe / relais / « not directly » | pas de blocage | pas de blocage | PASS |
| C02 220 °C continu / 250 °C pointe EN/FR | revue d'ingénierie | `extreme_temperature_review (250)` | PASS |
| C02 citée en comparaison / chambre ailleurs | pas de blocage | pas de blocage | PASS |
| C03 aimant 5×2 mm à 500 mm ±1 mm | revue de faisabilité | `extreme_gap_review (500)` | PASS (porté par l'écart seul) |
| C03 câble de 500 mm | pas de blocage | pas de blocage | PASS |
| D01 FR seuil de niveau, flotteur | pas de blocage | pas de blocage | PASS |
| D02 DE « SPS, Schließer » | pas de blocage | pas de blocage | PASS |
| D03 ES « normalmente abierto » | pas de blocage | pas de blocage | PASS |
| Questionnaire vide / tout délégué | aucune carte | vide → blocage `no_meaningful_requirement` | PASS |

Métamorphiques exécutés et conformes : casse, ordre des phrases, `4-20mA ≡ 4–20 mA ≡ 4 to 20 mA`, `500 mm ≡ 0,5 m ≡ 50 cm`, `220°C ≡ 220 °C`, `230Vac ≡ 230 VAC`, contraction « don't », aimant déjà posé, plastique non magnétique avec aimant sur le capot, flotteur d'alarme de température, sonde de température séparée d'un seuil de niveau.

## 3. Défauts confirmés (reproduits par `test.failing`)

### P1 — faux négatifs (aucun blocage alors qu'il en faut un)
1. **B02 contournable depuis une autre question** : « Continuous temperature measurement 20-250°C, 4-20mA » + Q2 « Oven door position is known by another system » → aucun blocage. Cause : `positiveMover` est évalué sur **toutes** les réponses (`door`, `position`, `magnet`… n'importe où annulent le blocage).
2. **B03 reformulé** : « Proportional flow output 0-10 V, 0-40 litres per minute » + « No moving parts allowed » → aucun blocage. Cause : `FLOW_MEASURE` ne reconnaît ni « flow output » ni « litres per minute ».
3. **C01 « Reed should cut the motor power » (230 V 8 A)** → aucun blocage. Cause : `DIRECT_SWITCH` n'a « couper » qu'en français, pas « cut ».
4. **C01 « Switch the 230 V mains load with the reed, 8 A »** → aucun blocage. Cause : les motifs exigent le capteur *avant* le verbe ou le mot « directly ».
5. **C02 « Component temperature at the sensor reaches 180°C »** → aucun blocage. Cause : `THERMAL_OPERATING` n'a ni « reaches/atteint » ni « at the sensor ».
6. **C03 « Magnet at 500 mm from the sensor, with 2 m cable »** → aucun blocage. Cause : `CABLE_CONTEXT` neutralise toute la phrase dès qu'un câble est cité.
7. **C03 « gap = 500 mm »** → aucun blocage (le motif exige un mot puis un espace avant le nombre).

### P1 — seuils vs catalogue
8. **150 °C déclaré « sans correspondance documentée » alors que MK21 est documenté à 150 °C** (`sensor-specifications.ts`, câble immobile −40..150 °C). Fausse exclusion d'une gamme réelle. Cause : `EXTREME_TEMPERATURE_C = 150` avec `>=`.
9. **Entre 131 et 149 °C, aucun avertissement** alors que toutes les gammes documentées sauf MK21 s'arrêtent à 130 °C ou moins, et le moteur de candidats n'utilise aucune température (`candidates.ts`, `suggestion-filters.ts`, `pair-cards.ts` : aucune occurrence). Même cause pour A06.
10. **Seuil d'écart = 75 mm, pas 58,3 mm** : le maximum calculé sur `ACTIVATION_GUIDE` vaut 75. 74 mm passe, 76 mm bloque. À confirmer avec la R&D quel maximum doit faire foi ; 58,3 mm n'est pas la valeur en vigueur.
11. **Soumission sans volume/phase/dates** : `checkSubmission` n'exige ni volume, ni phase, ni dates, ni mention explicite « à définir ». Un dossier neuf avec `annualVolume: unknown` et un consentement lié est accepté (test exécuté).

### P2
12. « je ne sais pas » ou « ??? ok » tapés à la main comptent comme une réponse → des cartes apparaissent.
13. `300°F` est lu comme 300 °C (≈149 °C réels) → revue déclenchée à tort ; °F non géré.
14. Le choix d'un montage seul suffit à afficher 3 cartes (décision assumée par le code ; à valider produit).
15. C03 : la petite taille de l'aimant et la précision ±1 mm ne sont pas évaluées séparément ; seul l'écart déclenche.
16. « 220°C » seul, sans verbe, ne déclenche pas la revue (prudent contre les faux positifs, mais silencieux).

## 4. Câblage de l'interface (revue statique de `design-space.tsx` et `result-view.tsx`)
- `fit` est recalculé à chaque édition (`useMemo` sur exigences, contraintes libres, montage, encombrement). Quand `fitBlocked` est vrai : titre des couples, filtres, grille des 3 cartes, **carte sur mesure**, lien « Voir tous les couples » et liste dépliée sont tous masqués (l. 2667–2698). Basculer les filtres ne change rien : la grille entière est masquée.
- Atelier, atelier câble, essai d'un couple : protégés par `fitGuard()` qui ouvre la question à revoir.
- ResultView reçoit `applicationBlocked` : pas de verdict positif, encart « la démonstration ne vaut pas vérification ». Les `proposals` lui sont tout de même transmises ; elles ne servent qu'à « prochaine proposition » — non vérifié en rendu bloqué (P2 à contrôler).
- Dossier repris : le blocage est calculé sur le contenu, pas sur un état enregistré → un ancien dossier contradictoire est bloqué à la réouverture (déduit du code, non testé en rendu).
- Bouton final désactivé quand le questionnaire est vide ; « Je ne sais pas encore » sur la dernière question ouvre l'onglet des couples, mais celui-ci n'affiche que l'encart (pas de carte).
- Tests de rendu existants exécutés : `questionnaire-render.test.tsx` (vide, C01, B02, contrôle contacteur externe).

## 5. Non testé (limites honnêtes)
- Aucune session authentifiée : pas de contrôle visuel desktop/étroit, pas de capture de l'écran « aucune correspondance » (le défaut UX « trop verbeux » du PDF reste **ouvert, P1 UX**, non mesuré).
- Aucune soumission réelle, aucun dépôt de fichier, aucune vérification Edge, aucune RLS : base réelle non sollicitée volontairement.
- Persistance des réponses entre onglets et à la réouverture : couverte par les tests existants en local, pas en navigateur réel.
- Libellés catalogue MK24-A-J, fileté vs emmanché, surcharge du texte connecteurs : non revus visuellement ; classés **P2 ouverts**, non présumés corrigés.
- Aucune note de fiche technique ni certification n'a été inventée ; les valeurs citées viennent de `sensor-specifications.ts` et `activation-guide`.

## 6. Synthèse
Les six cas du PDF (B01, B02, B03, C01, C02, C03) et le questionnaire vide sont bloqués **dans leur formulation d'origine** et dans les variantes testées. La règle reste fragile face aux reformulations (7 faux négatifs P1) et un seuil exclut à tort MK21 à 150 °C. Pour la démo : utiliser les formulations d'origine ; ne pas improviser de variantes devant le public.
