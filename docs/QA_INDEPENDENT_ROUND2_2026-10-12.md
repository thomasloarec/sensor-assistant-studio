# QA indépendante — round 2 — 12 octobre 2026

**Verdict : ROUGE — 36 échecs conservés, aucun correctif produit.**

- HEAD initial inspecté : `c48d90baa5103ac83e8fd17ceb310204d82b9a8b`.
- Révision finale testée : `894379387f3acf72ca9c715b10f23bdba642e2f3` (avant ajout de ce rapport).
- Le diff entre ces révisions ne contient que `tests/qa-independent-round2-2026-10-12.test.tsx`. Les SHA évoluent automatiquement après les éditions ; aucun commit manuel.
- Rapport précédent lu : `docs/QA_CONNECTOR_3D_RESTORED_2026-10-12.md`.
- Seuls ajouts autorisés : ce rapport et un nouveau fichier test. Application, anciens tests, base, permissions, NDA, RLS, documents et données externes inchangés. Aucune publication, connexion utilisateur, migration ni requête vers le backend.

## Exécutions réelles

| Commande / contrôle | Résultat exact |
|---|---|
| `bun test tests/qa-independent-round2-2026-10-12.test.tsx` | 138 pass / 36 fail ; 174 tests ; 275 assertions ; 6,76 s ; exit 1 |
| `bun test tests/` — dernière exécution | 1 596 pass / 36 fail ; 1 632 tests ; 106 fichiers ; 96 924 assertions ; 57,46 s ; exit 1 |
| Suite préexistante seule : `mapfile -t baseline < <(rg --files tests \| rg "\.test\.(ts\|tsx)$" \| rg -v "qa-independent-round2-2026-10-12"); bun test "${baseline[@]}"` | 1 458 pass / 0 fail ; 105 fichiers ; 96 649 assertions ; 44,09 s ; exit 0 |
| `bun scripts/i18n-inventory.ts` | TOTAL 0 : untranslated 0, missing 0, code-translated 0, frozen 0 ; exit 0 |
| `git diff --check` | Aucun écart |
| `bunx tsgo --noEmit` | NON EXÉCUTÉ : instruction plateforme interdit vérification manuelle ; aucun résultat types séparé revendiqué |
| `bun run build` | NON EXÉCUTÉ : instruction plateforme interdit build manuel ; dernier signal automatique lu : build OK à 13:07:59 UTC |
| `sha256sum public/legal/nda-standex-k-motor-16062026.docx` | `6e25345f1e83e92630258774d27a451d65d615cdd9f41a5331dae75c4072740b`, identique à l’original |

Les 36 noms de tests rouges sont exactement les mêmes en exécution isolée et complète. Aucun skip/todo signalé dans les trois sorties ; aucun `test.failing`/`test.skip` ajouté. Les 1 458 tests antérieurs passent séparément ET dans la suite complète (1 596 = 1 458 + 138). Aucun échec attribuable au harnais historique dans ces exécutions. La toute première tentative a eu une promesse rejetée par `GlobalRegistrator.unregister()` non attendu : corrigée uniquement dans le nouveau harnais en attendant cette promesse ; les attentes métier n’ont jamais changé.

## Oracle et portée

- 41 fixtures originales ; les six champs sont construits explicitement dans l’ordre `detection_goal`, `target_object`, `states_motion`, `mounting`, `electrical`, `environment`, y compris les champs vides.
- 78 mutations : 60 transformations de six fixtures et 18 variantes originales (passif, synonymes, contradictions entre champs, double négation, signe moins Unicode, tiret cadratin, virgule décimale, °F, cm/m, cible étrangère). Inversion de l’ordre des propriétés normalisée vers l’ordre réel des questions.
- Oracle écrit avant l’exécution selon principe physique, architecture électrique et données constructeur : aucune attente générée par le résultat applicatif. Les IDs exacts ne sont imposés que lorsqu’une contrainte les justifie ; un secteur ne détermine jamais une MPN.
- Classification opérationnelle observée : `catalog` = chemin de cartes non bloqué ; `engineering` = blocage de revue ou points de validation explicites ; `out-of-scope` = blocage de modalité ; `insufficient` / `exploration` distinguent absence de but. Toutes les cartes gardent la revue R&D obligatoire : `catalog` ne signifie ni capable ni qualifié.
- `observe()` appelle réellement assessApplicationFit, evaluateCandidates, suggestionFilters/blockedBy, pairCards et thermalWarning, avec le même classement mécanique et la même limite trois que DesignSpace. Ce raccord n’est pas une preuve indépendante du rendu : 14 tests complémentaires montent les composants réels. CUSTOM peut ajouter une quatrième carte dans l’UI ; le plafond de trois concerne les suggestions standard.
- Les réserves listées sont celles des problèmes d’application et avertissements thermiques, pas toutes les mentions génériques présentes dans l’interface. Un FAIL pour absence de réserve signifie une exigence ciblée non remontée, pas absence totale de disclaimer R&D.
- Aucun texte de besoin perdu ni muté dans les 119 observations métier. Les avertissements manquants constituent cependant une perte d’usage d’exigence, distincte de la conservation brute du texte.
- Happy DOM, route mémoire, état réel de DesignSpace ; seules lectures de disponibilité/session remplacées. Le changement de texte utilise le setter natif et le vrai onChange React car le harnais ne simule pas correctement l’événement change natif. Ce n’est pas un E2E clavier.

## Comptages par catégorie

| Catégorie | Tests | PASS | FAIL |
|---|---:|---:|---:|
| Fixtures cœur | 41 | 30 | 11 |
| Mutations / reformulations | 78 | 64 | 14 |
| Modalité par langue | 7 | 1 | 6 |
| Dimensions pures | 5 | 4 | 1 |
| Thermique, identités, immutabilité, remplissages | 9 | 8 | 1 |
| Champs business et checkSubmission local | 20 | 20 | 0 |
| React interactions réelles | 14 | 11 | 3 |
| **Total nouvelle campagne** | **174** | **138** | **36** |

## Défauts et diagnostics prioritaires

| Priorité / ID | Reproduction, attendu → réel | Cause technique / portée |
|---|---|---|
| **P1 D01 — lead légitime rejeté** | R12, M-safe-1…10, U01 : `Reed feeds a 24 V 5 mA PLC control input. Separate externally rated contactor switches the 230 VAC 12 A machine motor.` → cartes attendues ; blocage direct_load_switching / zéro carte | application-fit.ts:140–149 identifie `contactor switches ... motor` comme un contact capteur via le sous-mot `contact`. SAFE_WIRING:180 attend `contactor` AVANT `external/rated`, pas l’ordre inverse. Evidence réelle = phrase du contacteur, pas celle du reed. P1 faux rejet, pas preuve de danger électrique. |
| **P1 D02 — MK02 intégré ignoré** | R13/U07 : pas d’aimant externe, cible ferreuse, MK02 avec bias interne → piste engineering MK02 ; réel no_magnetic_source, zéro carte | application-fit.ts:214–218,395–403 bloque toute négation d’aimant sans exception de source interne/cible ferreuse. sensor-specifications.ts:131–136 documente explicitement l’aimant intégré. L’atelier ne valide pas cette physique. |
| **P1 D03 — but analogique masqué par négation** | MX17 : `Door state detection is not required. Continuously measure temperature.` + 4–20 mA → hors modalité ; réel catalog MK04/MK05/MK13 | application-fit.ts:627 positiveMover teste DETECT_GOAL + door sans reconnaître `not required`. negatedMover:499 ne couvre que les interdictions d’éléments mobiles. Une détection explicitement refusée efface le vrai objectif. |
| **P1 D04 — borne froide Unicode perdue** | MX06 `−40 to +85°C` → -40…85 ; réel +40…85. MX07 `-40—+85°C` → -40…85 ; réel max 85, min null | temperaturesC:511–517 ne traite pas U+2212 et le tiret U+2014 comme signe/plage ; risque d’effacer l’avertissement de la borne basse MK04/MK21 mobile. |
| **P1 D05 — modalité Hall non respectée** | R16 Hall linéaire analogique trois fils explicitement requis, pas reed deux fils → orientation engineering sans substitution ; réel cartes MK04/MK05/MK13 | FitIssueId:22–29 et assessModalityAndLimits:616–753 ne traitent que température/débit, pas field-output Hall. evaluateCandidates:189–245 n’applique que mécanique. |
| **P1 D06 — couverture sémantique limitée** | L-fr/de/es/it/zh et NL hors langues UI : mesure température analogique → hors modalité ; réel catalog. Anglais L-en passe | TEMPERATURE_MEASURE:477–480 et ANALOG_CONTINUOUS:472–476 ont une liste courte essentiellement EN/FR ; `relever` FR manque. Traductions UI présentes ≠ compréhension métier multilingue. |
| **P2 D07 — “inside” non reconnu** | E01/U04 `sensor must fit inside 8 × 5 × 4 mm` → proposition de consentement ; réel null, aucun bouton | envelope-text.ts:19 `must fit (in|within|into)` exige limite de mot après `in`, exclut inside. Contre-preuve positive U13/U14 `Sensor pocket 9 × 6 × 4 mm` : appliquer ET refuser fonctionnent, sans automatisme. |
| **P2 D08 — faux but de détection** | R38 + Filler weiß nicht ; R39 montage seul ; R40 dimensions seules ; R41 qzxv → insuffisant/exploration ; réel catalog standard | application-fit.ts:273 normalisation NFD ne translittère pas ß en ss ; isSubstantive:276–279 accepte toute séquence de trois lettres ; hasStatedPurpose:293–295 lit tous les champs dont mounting. Aucune reconnaissance du but réel. |
| **P2 D09 — exigences physiques ciblées non remontées** | R04 steel + offset, R06 deux limites / deux éléments, R08 blindage, R09 voisinage aimants → engineering avec réserve spécifique ; réel chemin catalog, aucune réserve ciblée | assessment:70–82 / 597–613 n’ont que petit aimant et précision mm ; aucun point spécifique blindage, cross-talk, offset ou multiélément. Le texte brut et disclaimer global sont conservés. Pas preuve d’affirmation garantie ni de disparition du texte. |
| **P2 D10 — double négation refus contacteur** | MX05 `Not without a contactor: ... reed only signals PLC` → contrôle sûr ; réel direct_load_switching | REFUSE_INTERFACE:168 lit `without a contactor` sans portée `Not without`; SAFE_WIRING ne comprend pas ce signal formulé à rebours. |

## Fixtures cœur — attendu / observé

IDs ci-dessous = au maximum trois suggestions standard observées, jamais références commandables. `—` côté attendu signifie aucune sélection unique justifiable (pas une attente vide de catalogue). Pour MK02/M8, l’attente ID signifie “reste éligible”, pas première carte automatiquement.

| ID | Statut test | Attendu | Réel | IDs réels (≤3) | Réserves attendues / écarts |
|---|---|---|---|---|
| R01 | PASS | catalog | catalog | MK04,MK05,MK13 | ABS is nonmagnetic; dry PLC control remains plausible, qualification required |
| R02 | PASS | catalog | catalog | MK01,MK15,MK16 | SMD only, no silent bracket |
| R03 | PASS | catalog (MK11-M8 éligible) | catalog | MK11-M5,MK11-M8,MK11-P-M8 | 450 mm stroke is not sensing distance; M8 must remain available |
| R04 | FAIL | engineering | catalog | MK04,MK05,MK13 | Ferromagnetic frame and variable offset need assembly evidence **Écart : classification: expected engineering, actual catalog ; required caveat missing** |
| R05 | PASS | catalog | catalog | MK04,MK05,MK13 | Legitimate position application, not coffee-sector matching |
| R06 | FAIL | engineering | catalog | MK04,MK05,MK13 | Do not silently collapse two channels into one reed **Écart : classification: expected engineering, actual catalog ; required caveat missing** |
| R07 | PASS | catalog | catalog | MK04,MK05,MK13 | Fluid temperature is not external sensor temperature; float still needs qualification |
| R08 | FAIL | engineering | catalog | MK04,MK05,MK13 | Shielding may suppress actuation; geometry cannot prove capability **Écart : classification: expected engineering, actual catalog ; required caveat missing** |
| R09 | FAIL | engineering | catalog | MK04,MK05,MK13 | Do not promise immunity to neighboring field **Écart : classification: expected engineering, actual catalog ; required caveat missing** |
| R10 | PASS | catalog | catalog | MK04,MK05,MK13 | MK21 fixed cable covers full range, mobile cable does not |
| R11 | PASS | catalog | catalog | MK04,MK05,MK13 | MK21 mobile lower bound -30°C; warning must retain full range |
| R12 | FAIL | catalog | out-of-scope | — | High mains load elsewhere must not reject safe control architecture **Écart : classification: expected catalog, actual out-of-scope** |
| R13 | FAIL | engineering (MK02 éligible) | out-of-scope | — | MK02 internal magnet can detect ferrous target; no blanket magnetic-impossibility **Écart : classification: expected engineering, actual out-of-scope** |
| R14 | PASS | out-of-scope | out-of-scope | — | No ferrous target or field |
| R15 | PASS | out-of-scope | out-of-scope | — | Neither reed nor Hall detects unmodified plastic without field |
| R16 | FAIL | engineering | catalog | MK04,MK05,MK13 | Different supported technology must not silently become passive reed recommendation **Écart : classification: expected engineering, actual catalog** |
| R17 | PASS | catalog | catalog | MK04,MK05,MK13 | 2-wire NO reed legitimate; cannot substitute active Hall |
| R18 | PASS | out-of-scope | out-of-scope | — | Inductive mains load requires external rated interface |
| R19 | PASS | out-of-scope | out-of-scope | — | Mains high-current direct switching unsafe |
| R20 | PASS | engineering | engineering | — | No standard operating rating above 150°C |
| R21 | PASS | engineering | engineering | — | Do not invent thermal rating |
| R22 | PASS | catalog | catalog | MK04,MK05,MK13 | External sensor, not hot chamber |
| R23 | PASS | catalog | catalog | MK04,MK05,MK13 | 300°F approximately 149°C, not 300°C |
| R24 | PASS | engineering | engineering | — | 392°F = 200°C, not standard |
| R25 | PASS | catalog | catalog | MK04,MK05,MK13 | MK04 lower bound -30; warn both ends, consider MK21 |
| R26 | PASS | engineering | engineering | — | 2 m cable and scene mention cannot hide 200 mm gap |
| R27 | PASS | engineering | engineering | MK04,MK05,MK13 | Below guide maximum does not prove this tiny magnet at this gap |
| R28 | PASS | out-of-scope | out-of-scope | — | Not ordinary reed flow sensing |
| R29 | PASS | catalog | catalog | MK04,MK05,MK13 | Discrete magnetic paddle flow detection remains plausible |
| R30 | PASS | out-of-scope | out-of-scope | — | Unrelated moving magnet cannot erase temperature goal |
| R31 | PASS | catalog | catalog | MK04,MK05,MK13 | Reed senses actuator state, not continuous temperature |
| R32 | PASS | out-of-scope | out-of-scope | — | Use appropriate force technology, never fabricate reed response |
| R33 | PASS | out-of-scope | out-of-scope | — | Use appropriate humidity technology, never fabricate reed response |
| R34 | PASS | out-of-scope | out-of-scope | — | Use appropriate pH technology, never fabricate reed response |
| R35 | PASS | out-of-scope | out-of-scope | — | Use appropriate gas concentration technology, never fabricate reed response |
| R36 | PASS | out-of-scope | out-of-scope | — | Use appropriate weight technology, never fabricate reed response |
| R37 | PASS | insufficient | insufficient | — | Blank has no recommended cards |
| R38 | FAIL | insufficient | catalog | MK04,MK05,MK13 | Four filler languages do not create a purpose **Écart : classification: expected insufficient, actual catalog ; ordinary candidate cards must not be proposed** |
| R39 | FAIL | exploration | catalog | MK04,MK05,MK13 | Mounting-only text is not a detection purpose **Écart : classification: expected exploration, actual catalog** |
| R40 | FAIL | exploration | catalog | MK04,MK05,MK13 | Envelope-only requires consent, not recommended product **Écart : classification: expected exploration, actual catalog** |
| R41 | FAIL | insufficient | catalog | MK04,MK05,MK13 | Gibberish is not a defensible detection requirement **Écart : classification: expected insufficient, actual catalog ; ordinary candidate cards must not be proposed** |

R32–R36 passent le blocage grâce à “no magnet”, mais la reconnaissance spécifique force/humidité/pH/gaz/poids et le conseil de technologie dédié ne sont pas prouvés : **PARTIAL**, pas false-green de la modalité complète. R10/R11 : lecture de plage et avertissement conditionnel passent ; l’état câble mobile/fixe n’est pas une entrée de thermalWarning : choix automatique du bon régime **PARTIAL**. MK21 n’est pas systématiquement dans les trois premières suggestions, la température avertit sans filtrer. R17 garde un reed plausiblement adapté mais ne prouve pas un filtre électrique Hall/reed sur la liste complète : **PARTIAL**.

### Entrées exactes et sorties structurées des 41 fixtures

Reproductions déterministes ; aucune donnée réelle. `lossOfRequirements:false` concerne le texte, pas son interprétation métier.

#### R01
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "A permanent magnet behind a 2 mm ABS guard"
    },
    {
      "key": "states_motion",
      "value": "Guard closes with magnet at 7 mm"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "2 wire NO dry contact into 24 V PLC input, 8 mA"
    },
    {
      "key": "environment",
      "value": "Sensor ambient 22°C"
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "ABS is nonmagnetic; dry PLC control remains plausible, qualification required",
    "lossOfRequirements": false,
    "notes": "ABS is nonmagnetic; dry PLC control remains plausible, qualification required"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": {
      "min": null,
      "max": 22
    },
    "lossOfRequirements": false
  }
}
```

#### R02
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Confirm nylon instrument lid seated"
    },
    {
      "key": "target_object",
      "value": "Magnet actuator"
    },
    {
      "key": "states_motion",
      "value": "Lid travels 3 mm"
    },
    {
      "key": "mounting",
      "value": "Surface mount on PCB"
    },
    {
      "key": "electrical",
      "value": "3.3 V pullup, 0.4 mA dry NO contact"
    },
    {
      "key": "environment",
      "value": "Indoor 30°C"
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "SMD only, no silent bracket",
    "lossOfRequirements": false,
    "notes": "SMD only, no silent bracket"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK01",
      "MK15",
      "MK16"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R03
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Detect hydraulic piston end position"
    },
    {
      "key": "target_object",
      "value": "Magnet moves with long-stroke piston"
    },
    {
      "key": "states_motion",
      "value": "Stroke 450 mm; terminal magnet gap 6 mm"
    },
    {
      "key": "mounting",
      "value": "Exterior threaded body in explicitly tapped M8 hole"
    },
    {
      "key": "electrical",
      "value": "24 V PLC, 10 mA"
    },
    {
      "key": "environment",
      "value": "Exterior ambient 45°C"
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [
      "MK11-M8"
    ],
    "candidatePolicy": "must remain eligible",
    "caveat": "450 mm stroke is not sensing distance; M8 must remain available",
    "lossOfRequirements": false,
    "notes": "450 mm stroke is not sensing distance; M8 must remain available"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK11-M5",
      "MK11-M8",
      "MK11-P-M8"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": {
      "min": null,
      "max": 45
    },
    "lossOfRequirements": false
  }
}
```

#### R04
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Detect agricultural implement transport lock"
    },
    {
      "key": "target_object",
      "value": "Magnet on steel linkage"
    },
    {
      "key": "states_motion",
      "value": "6 mm gap, lateral offset varies with frame flex"
    },
    {
      "key": "mounting",
      "value": "External clamp"
    },
    {
      "key": "electrical",
      "value": "24 V 5 mA PLC"
    },
    {
      "key": "environment",
      "value": "Mud and vibration"
    }
  ],
  "expected": {
    "classification": "engineering",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "offset|decal|tol[e\\u00E9]ran|acier|steel|champ|magn[e\\u00E9]t",
    "lossOfRequirements": false,
    "notes": "Ferromagnetic frame and variable offset need assembly evidence"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R05
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Coffee grounds drawer fully inserted indication"
    },
    {
      "key": "target_object",
      "value": "Magnet bonded to plastic grounds drawer"
    },
    {
      "key": "states_motion",
      "value": "Drawer slides to 5 mm gap"
    },
    {
      "key": "mounting",
      "value": "Adhesive on outside casing"
    },
    {
      "key": "electrical",
      "value": "5 V 1 mA logic input"
    },
    {
      "key": "environment",
      "value": "Humid, sensor ambient 40°C"
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Legitimate position application, not coffee-sector matching",
    "lossOfRequirements": false,
    "notes": "Legitimate position application, not coffee-sector matching"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": {
      "min": null,
      "max": 40
    },
    "lossOfRequirements": false
  }
}
```

#### R06
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "HVAC condensate float: two distinct level limits"
    },
    {
      "key": "target_object",
      "value": "One magnetic float"
    },
    {
      "key": "states_motion",
      "value": "Low and high limits 20 mm apart; two independent sensor elements required"
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": "Two separate NO PLC channels 24 V 5 mA"
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "engineering",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "deux|two|[\\u00E9e]l[\\u00E9e]ment|seuil|threshold",
    "lossOfRequirements": false,
    "notes": "Do not silently collapse two channels into one reed"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R07
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Hot tank overflow alarm"
    },
    {
      "key": "target_object",
      "value": "Magnetic float"
    },
    {
      "key": "states_motion",
      "value": "Float trips a discrete upper limit"
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": ""
    },
    {
      "key": "environment",
      "value": "Fluid inside tank at 180°C. Sensor ambient outside at 35°C."
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Fluid temperature is not external sensor temperature; float still needs qualification",
    "lossOfRequirements": false,
    "notes": "Fluid temperature is not external sensor temperature; float still needs qualification"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": {
      "min": null,
      "max": 35
    },
    "lossOfRequirements": false
  }
}
```

#### R08
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "Permanent magnet enclosed in a strong steel magnetic shield"
    },
    {
      "key": "states_motion",
      "value": "Magnet at 9 mm behind the shielding"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "2 wire NO dry contact into 24 V PLC input, 8 mA"
    },
    {
      "key": "environment",
      "value": "Sensor ambient 22°C"
    }
  ],
  "expected": {
    "classification": "engineering",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "shield|blind|[\\u00E9e]cran|champ|field",
    "lossOfRequirements": false,
    "notes": "Shielding may suppress actuation; geometry cannot prove capability"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": {
      "min": null,
      "max": 22
    },
    "lossOfRequirements": false
  }
}
```

#### R09
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "Two adjacent permanent magnets at neighboring drawers"
    },
    {
      "key": "states_motion",
      "value": "Desired magnet 5 mm away; neighbor magnet moves independently, cross-talk unknown"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "2 wire NO dry contact into 24 V PLC input, 8 mA"
    },
    {
      "key": "environment",
      "value": "Sensor ambient 22°C"
    }
  ],
  "expected": {
    "classification": "engineering",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "interf|cross|voisin|neighbor|champ",
    "lossOfRequirements": false,
    "notes": "Do not promise immunity to neighboring field"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": {
      "min": null,
      "max": 22
    },
    "lossOfRequirements": false
  }
}
```

#### R10
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "A permanent magnet behind a 2 mm ABS guard"
    },
    {
      "key": "states_motion",
      "value": "Guard closes with magnet at 7 mm"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "2 wire NO dry contact into 24 V PLC input, 8 mA"
    },
    {
      "key": "environment",
      "value": "Sensor operating from -40 to +140°C, fixed immobile cable"
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "MK21 fixed cable covers full range, mobile cable does not",
    "lossOfRequirements": false,
    "notes": "MK21 fixed cable covers full range, mobile cable does not"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [
      "Température demandée {0} hors de la plage de fonctionnement documentée pour cette gamme ({1}) : à revoir avec la R&D Standex avant tout choix.",
      "Câble immobile",
      "Câble en mouvement",
      "Température demandée {0} hors de la plage de fonctionnement documentée pour cette gamme ({1}) : à revoir avec la R&D Standex avant tout choix.",
      "Câble immobile",
      "Câble en mouvement",
      "Température demandée {0} hors de la plage de fonctionnement documentée pour cette gamme ({1}) : à revoir avec la R&D Standex avant tout choix.",
      "Câble immobile",
      "Câble en mouvement"
    ],
    "sensorSiteC": {
      "min": -40,
      "max": 140
    },
    "lossOfRequirements": false
  }
}
```

#### R11
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "A permanent magnet behind a 2 mm ABS guard"
    },
    {
      "key": "states_motion",
      "value": "Guard closes with magnet at 7 mm"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "2 wire NO dry contact into 24 V PLC input, 8 mA"
    },
    {
      "key": "environment",
      "value": "Sensor operating from -40 to +140°C, moving cable flexes every cycle"
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "mouvement|moving|condition",
    "lossOfRequirements": false,
    "notes": "MK21 mobile lower bound -30°C; warning must retain full range"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [
      "Température demandée {0} hors de la plage de fonctionnement documentée pour cette gamme ({1}) : à revoir avec la R&D Standex avant tout choix.",
      "Câble immobile",
      "Câble en mouvement",
      "Température demandée {0} hors de la plage de fonctionnement documentée pour cette gamme ({1}) : à revoir avec la R&D Standex avant tout choix.",
      "Câble immobile",
      "Câble en mouvement",
      "Température demandée {0} hors de la plage de fonctionnement documentée pour cette gamme ({1}) : à revoir avec la R&D Standex avant tout choix.",
      "Câble immobile",
      "Câble en mouvement"
    ],
    "sensorSiteC": {
      "min": -40,
      "max": 140
    },
    "lossOfRequirements": false
  }
}
```

#### R12
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "A permanent magnet behind a 2 mm ABS guard"
    },
    {
      "key": "states_motion",
      "value": "Guard closes with magnet at 7 mm"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "Reed feeds a 24 V 5 mA PLC control input. Separate externally rated contactor switches the 230 VAC 12 A machine motor."
    },
    {
      "key": "environment",
      "value": "Sensor ambient 22°C"
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "High mains load elsewhere must not reject safe control architecture",
    "lossOfRequirements": false,
    "notes": "High mains load elsewhere must not reject safe control architecture"
  },
  "actual": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "issues": [
      "direct_load_switching"
    ],
    "caveats": [
      "La charge du moteur et son courant d'appel au démarrage dépassent largement ce qu'un contact reed peut couper. Les contacts peuvent se souder ou se dégrader, et la machine peut alors démarrer ou rester en marche sans commande.",
      "Le circuit de puissance du moteur et le circuit de signal du capteur restent deux circuits distincts.",
      "Un moteur est une charge inductive à fort courant d'appel : l'interface de puissance doit être dimensionnée et protégée en conséquence, avec une protection adaptée au type d'alimentation. Voir les précautions de charge Standex.",
      "Un capteur reed sur un capot donne une information de position. Il ne constitue pas à lui seul un verrouillage de sécurité machine certifié."
    ],
    "sensorSiteC": {
      "min": null,
      "max": 22
    },
    "lossOfRequirements": false
  }
}
```

#### R13
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Detect ferrous steel target approaching"
    },
    {
      "key": "target_object",
      "value": "No external magnet available. Ferrous steel target; MK02 includes internal bias magnet."
    },
    {
      "key": "states_motion",
      "value": "Target arrives within a few millimetres"
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": ""
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "engineering",
    "candidateIds": [
      "MK02"
    ],
    "candidatePolicy": "must remain eligible",
    "caveat": "MK02 internal magnet can detect ferrous target; no blanket magnetic-impossibility",
    "lossOfRequirements": false,
    "notes": "MK02 internal magnet can detect ferrous target; no blanket magnetic-impossibility"
  },
  "actual": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "issues": [
      "no_magnetic_source"
    ],
    "caveats": [
      "Vos réponses interdisent aujourd'hui d'ajouter un aimant ou un élément magnétique. Ces deux points ne peuvent pas être vrais en même temps.",
      "Une conception sur mesure ne change rien à ce point : elle ne crée pas de champ magnétique là où il n'y en a pas."
    ],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R14
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Detect unmodified aluminium plate"
    },
    {
      "key": "target_object",
      "value": "Nonmagnetic aluminum plate, no magnet allowed anywhere"
    },
    {
      "key": "states_motion",
      "value": ""
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": ""
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "No ferrous target or field",
    "lossOfRequirements": false,
    "notes": "No ferrous target or field"
  },
  "actual": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "issues": [
      "no_magnetic_source"
    ],
    "caveats": [
      "Vos réponses interdisent aujourd'hui d'ajouter un aimant ou un élément magnétique. Ces deux points ne peuvent pas être vrais en même temps.",
      "Une conception sur mesure ne change rien à ce point : elle ne crée pas de champ magnétique là où il n'y en a pas."
    ],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R15
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Detect unmodified plastic flap"
    },
    {
      "key": "target_object",
      "value": "Plastic target without any magnet; no ferrous insert permitted"
    },
    {
      "key": "states_motion",
      "value": ""
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": ""
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Neither reed nor Hall detects unmodified plastic without field",
    "lossOfRequirements": false,
    "notes": "Neither reed nor Hall detects unmodified plastic without field"
  },
  "actual": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "issues": [
      "no_magnetic_source"
    ],
    "caveats": [
      "Vos réponses interdisent aujourd'hui d'ajouter un aimant ou un élément magnétique. Ces deux points ne peuvent pas être vrais en même temps.",
      "Une conception sur mesure ne change rien à ce point : elle ne crée pas de champ magnétique là où il n'y en a pas."
    ],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R16
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Measure continuous magnetic field amplitude with a linear Hall sensor"
    },
    {
      "key": "target_object",
      "value": "Permanent magnet on test jig"
    },
    {
      "key": "states_motion",
      "value": ""
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": "Active three-wire linear analog voltage, NOT a two-wire reed switch"
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "engineering",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Different supported technology must not silently become passive reed recommendation",
    "lossOfRequirements": false,
    "notes": "Different supported technology must not silently become passive reed recommendation"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R17
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "A permanent magnet behind a 2 mm ABS guard"
    },
    {
      "key": "states_motion",
      "value": "Guard closes with magnet at 7 mm"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "Two-wire normally-open dry circuit required, no supply wire for active three-wire Hall"
    },
    {
      "key": "environment",
      "value": "Sensor ambient 22°C"
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "2-wire NO reed legitimate; cannot substitute active Hall",
    "lossOfRequirements": false,
    "notes": "2-wire NO reed legitimate; cannot substitute active Hall"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": {
      "min": null,
      "max": 22
    },
    "lossOfRequirements": false
  }
}
```

#### R18
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "A permanent magnet behind a 2 mm ABS guard"
    },
    {
      "key": "states_motion",
      "value": "Guard closes with magnet at 7 mm"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "The reed directly powers the 110 VAC 5 A machine motor; omit contactor."
    },
    {
      "key": "environment",
      "value": "Sensor ambient 22°C"
    }
  ],
  "expected": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Inductive mains load requires external rated interface",
    "lossOfRequirements": false,
    "notes": "Inductive mains load requires external rated interface"
  },
  "actual": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "issues": [
      "direct_load_switching"
    ],
    "caveats": [
      "La charge du moteur et son courant d'appel au démarrage dépassent largement ce qu'un contact reed peut couper. Les contacts peuvent se souder ou se dégrader, et la machine peut alors démarrer ou rester en marche sans commande.",
      "Le circuit de puissance du moteur et le circuit de signal du capteur restent deux circuits distincts.",
      "Un moteur est une charge inductive à fort courant d'appel : l'interface de puissance doit être dimensionnée et protégée en conséquence, avec une protection adaptée au type d'alimentation. Voir les précautions de charge Standex.",
      "Un capteur reed sur un capot donne une information de position. Il ne constitue pas à lui seul un verrouillage de sécurité machine certifié."
    ],
    "sensorSiteC": {
      "min": null,
      "max": 22
    },
    "lossOfRequirements": false
  }
}
```

#### R19
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "A permanent magnet behind a 2 mm ABS guard"
    },
    {
      "key": "states_motion",
      "value": "Guard closes with magnet at 7 mm"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "The 230 VAC 12 A motor is powered directly through the reed, without an interface."
    },
    {
      "key": "environment",
      "value": "Sensor ambient 22°C"
    }
  ],
  "expected": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Mains high-current direct switching unsafe",
    "lossOfRequirements": false,
    "notes": "Mains high-current direct switching unsafe"
  },
  "actual": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "issues": [
      "direct_load_switching"
    ],
    "caveats": [
      "La charge du moteur et son courant d'appel au démarrage dépassent largement ce qu'un contact reed peut couper. Les contacts peuvent se souder ou se dégrader, et la machine peut alors démarrer ou rester en marche sans commande.",
      "Le circuit de puissance du moteur et le circuit de signal du capteur restent deux circuits distincts.",
      "Un moteur est une charge inductive à fort courant d'appel : l'interface de puissance doit être dimensionnée et protégée en conséquence, avec une protection adaptée au type d'alimentation. Voir les précautions de charge Standex.",
      "Un capteur reed sur un capot donne une information de position. Il ne constitue pas à lui seul un verrouillage de sécurité machine certifié."
    ],
    "sensorSiteC": {
      "min": null,
      "max": 22
    },
    "lossOfRequirements": false
  }
}
```

#### R20
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "A permanent magnet behind a 2 mm ABS guard"
    },
    {
      "key": "states_motion",
      "value": "Guard closes with magnet at 7 mm"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "2 wire NO dry contact into 24 V PLC input, 8 mA"
    },
    {
      "key": "environment",
      "value": "Sensor must operate continuously at 170°C"
    }
  ],
  "expected": {
    "classification": "engineering",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "No standard operating rating above 150°C",
    "lossOfRequirements": false,
    "notes": "No standard operating rating above 150°C"
  },
  "actual": {
    "classification": "engineering",
    "candidateIds": [],
    "issues": [
      "extreme_temperature_review"
    ],
    "caveats": [
      "Proposer une gamme standard sans limite de température vérifiée laisserait croire qu'elle convient. La tenue du capteur, de l'aimant et du câble doit être évaluée par la R&D Standex.",
      "Ce n'est ni un refus ni une impossibilité : c'est une revue d'ingénierie Standex obligatoire avant toute proposition."
    ],
    "sensorSiteC": {
      "min": null,
      "max": 170
    },
    "lossOfRequirements": false
  }
}
```

#### R21
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "A permanent magnet behind a 2 mm ABS guard"
    },
    {
      "key": "states_motion",
      "value": "Guard closes with magnet at 7 mm"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "2 wire NO dry contact into 24 V PLC input, 8 mA"
    },
    {
      "key": "environment",
      "value": "Sensor remains at 200°C continuously"
    }
  ],
  "expected": {
    "classification": "engineering",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Do not invent thermal rating",
    "lossOfRequirements": false,
    "notes": "Do not invent thermal rating"
  },
  "actual": {
    "classification": "engineering",
    "candidateIds": [],
    "issues": [
      "extreme_temperature_review"
    ],
    "caveats": [
      "Proposer une gamme standard sans limite de température vérifiée laisserait croire qu'elle convient. La tenue du capteur, de l'aimant et du câble doit être évaluée par la R&D Standex.",
      "Ce n'est ni un refus ni une impossibilité : c'est une revue d'ingénierie Standex obligatoire avant toute proposition."
    ],
    "sensorSiteC": {
      "min": null,
      "max": 200
    },
    "lossOfRequirements": false
  }
}
```

#### R22
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "A permanent magnet behind a 2 mm ABS guard"
    },
    {
      "key": "states_motion",
      "value": "Guard closes with magnet at 7 mm"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "2 wire NO dry contact into 24 V PLC input, 8 mA"
    },
    {
      "key": "environment",
      "value": "Chamber operating at 200°C. Sensor ambient outside enclosure 40°C."
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "External sensor, not hot chamber",
    "lossOfRequirements": false,
    "notes": "External sensor, not hot chamber"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": {
      "min": null,
      "max": 40
    },
    "lossOfRequirements": false
  }
}
```

#### R23
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "A permanent magnet behind a 2 mm ABS guard"
    },
    {
      "key": "states_motion",
      "value": "Guard closes with magnet at 7 mm"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "2 wire NO dry contact into 24 V PLC input, 8 mA"
    },
    {
      "key": "environment",
      "value": "Sensor continuous ambient 300°F"
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "300°F approximately 149°C, not 300°C",
    "lossOfRequirements": false,
    "notes": "300°F approximately 149°C, not 300°C"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [
      "Température demandée {0} hors de la plage de fonctionnement documentée pour cette gamme ({1}) : à revoir avec la R&D Standex avant tout choix.",
      "Câble immobile",
      "Câble en mouvement",
      "Température demandée {0} hors de la plage de fonctionnement documentée pour cette gamme ({1}) : à revoir avec la R&D Standex avant tout choix.",
      "Câble immobile",
      "Câble en mouvement",
      "Température demandée {0} hors de la plage de fonctionnement documentée pour cette gamme ({1}) : à revoir avec la R&D Standex avant tout choix.",
      "Câble immobile",
      "Câble en mouvement"
    ],
    "sensorSiteC": {
      "min": null,
      "max": 148.9
    },
    "lossOfRequirements": false
  }
}
```

#### R24
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "A permanent magnet behind a 2 mm ABS guard"
    },
    {
      "key": "states_motion",
      "value": "Guard closes with magnet at 7 mm"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "2 wire NO dry contact into 24 V PLC input, 8 mA"
    },
    {
      "key": "environment",
      "value": "Sensor continuous ambient 392°F"
    }
  ],
  "expected": {
    "classification": "engineering",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "392°F = 200°C, not standard",
    "lossOfRequirements": false,
    "notes": "392°F = 200°C, not standard"
  },
  "actual": {
    "classification": "engineering",
    "candidateIds": [],
    "issues": [
      "extreme_temperature_review"
    ],
    "caveats": [
      "Proposer une gamme standard sans limite de température vérifiée laisserait croire qu'elle convient. La tenue du capteur, de l'aimant et du câble doit être évaluée par la R&D Standex.",
      "Ce n'est ni un refus ni une impossibilité : c'est une revue d'ingénierie Standex obligatoire avant toute proposition."
    ],
    "sensorSiteC": {
      "min": null,
      "max": 200
    },
    "lossOfRequirements": false
  }
}
```

#### R25
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "A permanent magnet behind a 2 mm ABS guard"
    },
    {
      "key": "states_motion",
      "value": "Guard closes with magnet at 7 mm"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "2 wire NO dry contact into 24 V PLC input, 8 mA"
    },
    {
      "key": "environment",
      "value": "Sensor operating range -40..+85°C"
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "hors|condition|exceeded",
    "lossOfRequirements": false,
    "notes": "MK04 lower bound -30; warn both ends, consider MK21"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [
      "Température demandée {0} hors de la plage de fonctionnement documentée pour cette gamme ({1}) : à revoir avec la R&D Standex avant tout choix.",
      "Câble immobile",
      "Câble en mouvement",
      "Température demandée {0} hors de la plage de fonctionnement documentée pour cette gamme ({1}) : à revoir avec la R&D Standex avant tout choix.",
      "Câble immobile",
      "Câble en mouvement",
      "Température demandée {0} hors de la plage de fonctionnement documentée pour cette gamme ({1}) : à revoir avec la R&D Standex avant tout choix.",
      "Câble immobile",
      "Câble en mouvement"
    ],
    "sensorSiteC": {
      "min": -40,
      "max": 85
    },
    "lossOfRequirements": false
  }
}
```

#### R26
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "2 × 2 mm permanent magnet"
    },
    {
      "key": "states_motion",
      "value": "Detection gap = 200 mm; show in 3D"
    },
    {
      "key": "mounting",
      "value": "Cable 2 m to control box"
    },
    {
      "key": "electrical",
      "value": "2 wire NO dry contact into 24 V PLC input, 8 mA"
    },
    {
      "key": "environment",
      "value": "Sensor ambient 22°C"
    }
  ],
  "expected": {
    "classification": "engineering",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "2 m cable and scene mention cannot hide 200 mm gap",
    "lossOfRequirements": false,
    "notes": "2 m cable and scene mention cannot hide 200 mm gap"
  },
  "actual": {
    "classification": "engineering",
    "candidateIds": [],
    "issues": [
      "extreme_gap_review"
    ],
    "caveats": [
      "Aimant de très petite taille indiqué : sa capacité à actionner le capteur à la distance prévue doit être vérifiée par la R&D Standex.",
      "La distance d'activation dépend de l'aimant, de son orientation et du capteur. Aucune distance n'est extrapolée au-delà des valeurs publiées, et aucune précision de position n'est garantie sans essai.",
      "Un aimant plus gros, un écart réduit ou un autre emplacement peuvent changer la conclusion : rien n'est déclaré impossible ici.",
      "Seuil de revue : la plus grande distance publiée dans le guide d'activation Standex. Ce n'est pas une distance validée pour un couple précis ; la limite réelle est confirmée par la R&D Standex."
    ],
    "sensorSiteC": {
      "min": null,
      "max": 22
    },
    "lossOfRequirements": false
  }
}
```

#### R27
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Packaging guard closed indication"
    },
    {
      "key": "target_object",
      "value": "2 × 2 mm permanent magnet"
    },
    {
      "key": "states_motion",
      "value": "Detect magnet at 70 mm with +/-1 mm precision"
    },
    {
      "key": "mounting",
      "value": "Adhesive carrier on stationary guard frame"
    },
    {
      "key": "electrical",
      "value": "2 wire NO dry contact into 24 V PLC input, 8 mA"
    },
    {
      "key": "environment",
      "value": "Sensor ambient 22°C"
    }
  ],
  "expected": {
    "classification": "engineering",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "essai|v[e\\u00E9]rifi|garanti",
    "lossOfRequirements": false,
    "notes": "Below guide maximum does not prove this tiny magnet at this gap"
  },
  "actual": {
    "classification": "engineering",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [
      "Aimant de très petite taille indiqué : sa capacité à actionner le capteur à la distance prévue doit être vérifiée par la R&D Standex.",
      "Précision de position de l'ordre du millimètre demandée : aucune précision de commutation n'est garantie sans essai Standex."
    ],
    "sensorSiteC": {
      "min": null,
      "max": 22
    },
    "lossOfRequirements": false
  }
}
```

#### R28
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Measure analog fluid flow in L/min continuously"
    },
    {
      "key": "target_object",
      "value": "Sealed pipe without magnetic marker or moving parts"
    },
    {
      "key": "states_motion",
      "value": ""
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": "4-20 mA proportional signal"
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Not ordinary reed flow sensing",
    "lossOfRequirements": false,
    "notes": "Not ordinary reed flow sensing"
  },
  "actual": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "issues": [
      "continuous_flow_measurement"
    ],
    "caveats": [
      "Vos réponses interdisent tout élément mobile ou aimant dans la conduite et demandent un signal analogique. Un contact reed ne fournit qu'un état tout-ou-rien déclenché par un champ magnétique.",
      "Une mesure de débit sans pièce mobile relève d'une autre technologie (électromagnétique, ultrasons, thermique) : nous ne garantissons pas d'avance sa performance."
    ],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R29
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Flow threshold alarm"
    },
    {
      "key": "target_object",
      "value": "Floating magnetic paddle allowed in water line"
    },
    {
      "key": "states_motion",
      "value": "Paddle crosses discrete threshold when flowing"
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": "24 V 5 mA dry contact"
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Discrete magnetic paddle flow detection remains plausible",
    "lossOfRequirements": false,
    "notes": "Discrete magnetic paddle flow detection remains plausible"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R30
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Continuously measure temperature"
    },
    {
      "key": "target_object",
      "value": "Process chamber"
    },
    {
      "key": "states_motion",
      "value": "An unrelated motor has a magnet on its shaft"
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": "Analog temperature transmitter 4–20 mA"
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Unrelated moving magnet cannot erase temperature goal",
    "lossOfRequirements": false,
    "notes": "Unrelated moving magnet cannot erase temperature goal"
  },
  "actual": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "issues": [
      "continuous_temperature_measurement"
    ],
    "caveats": [
      "Le contact reed s'ouvre ou se ferme sous l'effet d'un champ magnétique. Il ne produit pas de valeur proportionnelle à la température.",
      "Une mesure de température continue relève d'une autre technologie (sonde de température, thermocouple, RTD) : nous ne garantissons pas d'avance sa performance."
    ],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R31
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Overheat alarm using a magnetic actuator"
    },
    {
      "key": "target_object",
      "value": "Bimetal actuator carrying permanent magnet"
    },
    {
      "key": "states_motion",
      "value": "At the alarm limit actuator moves the magnet to reed"
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": "NO dry contact into PLC"
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "catalog",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Reed senses actuator state, not continuous temperature",
    "lossOfRequirements": false,
    "notes": "Reed senses actuator state, not continuous temperature"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R32
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Measure force continuously with reed"
    },
    {
      "key": "target_object",
      "value": "Nonmagnetic process sample, no magnet or ferrous target"
    },
    {
      "key": "states_motion",
      "value": ""
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": "Analog 0-10 V proportional measurement"
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Use appropriate force technology, never fabricate reed response",
    "lossOfRequirements": false,
    "notes": "Use appropriate force technology, never fabricate reed response"
  },
  "actual": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "issues": [
      "no_magnetic_source"
    ],
    "caveats": [
      "Vos réponses interdisent aujourd'hui d'ajouter un aimant ou un élément magnétique. Ces deux points ne peuvent pas être vrais en même temps.",
      "Une conception sur mesure ne change rien à ce point : elle ne crée pas de champ magnétique là où il n'y en a pas."
    ],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R33
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Measure humidity continuously with reed"
    },
    {
      "key": "target_object",
      "value": "Nonmagnetic process sample, no magnet or ferrous target"
    },
    {
      "key": "states_motion",
      "value": ""
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": "Analog 0-10 V proportional measurement"
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Use appropriate humidity technology, never fabricate reed response",
    "lossOfRequirements": false,
    "notes": "Use appropriate humidity technology, never fabricate reed response"
  },
  "actual": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "issues": [
      "no_magnetic_source"
    ],
    "caveats": [
      "Vos réponses interdisent aujourd'hui d'ajouter un aimant ou un élément magnétique. Ces deux points ne peuvent pas être vrais en même temps.",
      "Une conception sur mesure ne change rien à ce point : elle ne crée pas de champ magnétique là où il n'y en a pas."
    ],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R34
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Measure pH continuously with reed"
    },
    {
      "key": "target_object",
      "value": "Nonmagnetic process sample, no magnet or ferrous target"
    },
    {
      "key": "states_motion",
      "value": ""
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": "Analog 0-10 V proportional measurement"
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Use appropriate pH technology, never fabricate reed response",
    "lossOfRequirements": false,
    "notes": "Use appropriate pH technology, never fabricate reed response"
  },
  "actual": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "issues": [
      "no_magnetic_source"
    ],
    "caveats": [
      "Vos réponses interdisent aujourd'hui d'ajouter un aimant ou un élément magnétique. Ces deux points ne peuvent pas être vrais en même temps.",
      "Une conception sur mesure ne change rien à ce point : elle ne crée pas de champ magnétique là où il n'y en a pas."
    ],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R35
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Measure gas concentration continuously with reed"
    },
    {
      "key": "target_object",
      "value": "Nonmagnetic process sample, no magnet or ferrous target"
    },
    {
      "key": "states_motion",
      "value": ""
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": "Analog 0-10 V proportional measurement"
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Use appropriate gas concentration technology, never fabricate reed response",
    "lossOfRequirements": false,
    "notes": "Use appropriate gas concentration technology, never fabricate reed response"
  },
  "actual": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "issues": [
      "no_magnetic_source"
    ],
    "caveats": [
      "Vos réponses interdisent aujourd'hui d'ajouter un aimant ou un élément magnétique. Ces deux points ne peuvent pas être vrais en même temps.",
      "Une conception sur mesure ne change rien à ce point : elle ne crée pas de champ magnétique là où il n'y en a pas."
    ],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R36
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "Measure weight continuously with reed"
    },
    {
      "key": "target_object",
      "value": "Nonmagnetic process sample, no magnet or ferrous target"
    },
    {
      "key": "states_motion",
      "value": ""
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": "Analog 0-10 V proportional measurement"
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Use appropriate weight technology, never fabricate reed response",
    "lossOfRequirements": false,
    "notes": "Use appropriate weight technology, never fabricate reed response"
  },
  "actual": {
    "classification": "out-of-scope",
    "candidateIds": [],
    "issues": [
      "no_magnetic_source"
    ],
    "caveats": [
      "Vos réponses interdisent aujourd'hui d'ajouter un aimant ou un élément magnétique. Ces deux points ne peuvent pas être vrais en même temps.",
      "Une conception sur mesure ne change rien à ce point : elle ne crée pas de champ magnétique là où il n'y en a pas."
    ],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R37
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": ""
    },
    {
      "key": "target_object",
      "value": ""
    },
    {
      "key": "states_motion",
      "value": ""
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": ""
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "insufficient",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Blank has no recommended cards",
    "lossOfRequirements": false,
    "notes": "Blank has no recommended cards"
  },
  "actual": {
    "classification": "insufficient",
    "candidateIds": [],
    "issues": [
      "no_meaningful_requirement"
    ],
    "caveats": [
      "Les capteurs proposés sont filtrés d'après vos réponses. Sans aucune réponse, aucun filtre ne peut s'appliquer."
    ],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R38
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "I do not know"
    },
    {
      "key": "target_object",
      "value": "je ne sais pas"
    },
    {
      "key": "states_motion",
      "value": "no sé"
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": "weiß nicht"
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "insufficient",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Four filler languages do not create a purpose",
    "lossOfRequirements": false,
    "notes": "Four filler languages do not create a purpose"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R39
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": ""
    },
    {
      "key": "target_object",
      "value": ""
    },
    {
      "key": "states_motion",
      "value": ""
    },
    {
      "key": "mounting",
      "value": "Bracket with two screw holes only"
    },
    {
      "key": "electrical",
      "value": ""
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "exploration",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Mounting-only text is not a detection purpose",
    "lossOfRequirements": false,
    "notes": "Mounting-only text is not a detection purpose"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R40
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": ""
    },
    {
      "key": "target_object",
      "value": ""
    },
    {
      "key": "states_motion",
      "value": ""
    },
    {
      "key": "mounting",
      "value": "Sensor must fit inside 8 × 5 × 4 mm"
    },
    {
      "key": "electrical",
      "value": ""
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "exploration",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Envelope-only requires consent, not recommended product",
    "lossOfRequirements": false,
    "notes": "Envelope-only requires consent, not recommended product"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

#### R41
```json
{
  "answersInQuestionOrder": [
    {
      "key": "detection_goal",
      "value": "qzxv qzxv qzxv"
    },
    {
      "key": "target_object",
      "value": ""
    },
    {
      "key": "states_motion",
      "value": ""
    },
    {
      "key": "mounting",
      "value": ""
    },
    {
      "key": "electrical",
      "value": ""
    },
    {
      "key": "environment",
      "value": ""
    }
  ],
  "expected": {
    "classification": "insufficient",
    "candidateIds": [],
    "candidatePolicy": "not uniquely fixed by domain; max three observed",
    "caveat": "Gibberish is not a defensible detection requirement",
    "lossOfRequirements": false,
    "notes": "Gibberish is not a defensible detection requirement"
  },
  "actual": {
    "classification": "catalog",
    "candidateIds": [
      "MK04",
      "MK05",
      "MK13"
    ],
    "issues": [],
    "caveats": [],
    "sensorSiteC": null,
    "lossOfRequirements": false
  }
}
```

## Mutations : 78 assertions normalement bloquantes en cas de violation

Chaque M-* reprend la fixture définie dans le fichier test avec la transformation indiquée ; aucune attente ajustée après observation. Les MX-* ont des textes originaux complets dans le même fichier.

| ID | Statut | Attendu → réel | IDs réels | Écart |
|---|---|---|---|---|
| M-heat-1 | PASS | engineering → engineering | — | — |
| M-heat-2 | PASS | engineering → engineering | — | — |
| M-heat-3 | PASS | engineering → engineering | — | — |
| M-heat-4 | PASS | engineering → engineering | — | — |
| M-heat-5 | PASS | engineering → engineering | — | — |
| M-heat-6 | PASS | engineering → engineering | — | — |
| M-heat-7 | PASS | engineering → engineering | — | — |
| M-heat-8 | PASS | engineering → engineering | — | — |
| M-heat-9 | PASS | engineering → engineering | — | — |
| M-heat-10 | PASS | engineering → engineering | — | — |
| M-mains-1 | PASS | out-of-scope → out-of-scope | — | — |
| M-mains-2 | PASS | out-of-scope → out-of-scope | — | — |
| M-mains-3 | PASS | out-of-scope → out-of-scope | — | — |
| M-mains-4 | PASS | out-of-scope → out-of-scope | — | — |
| M-mains-5 | PASS | out-of-scope → out-of-scope | — | — |
| M-mains-6 | PASS | out-of-scope → out-of-scope | — | — |
| M-mains-7 | PASS | out-of-scope → out-of-scope | — | — |
| M-mains-8 | PASS | out-of-scope → out-of-scope | — | — |
| M-mains-9 | PASS | out-of-scope → out-of-scope | — | — |
| M-mains-10 | PASS | out-of-scope → out-of-scope | — | — |
| M-safe-1 | FAIL | catalog → out-of-scope | — | classification: expected catalog, actual out-of-scope |
| M-safe-2 | FAIL | catalog → out-of-scope | — | classification: expected catalog, actual out-of-scope |
| M-safe-3 | FAIL | catalog → out-of-scope | — | classification: expected catalog, actual out-of-scope |
| M-safe-4 | FAIL | catalog → out-of-scope | — | classification: expected catalog, actual out-of-scope |
| M-safe-5 | FAIL | catalog → out-of-scope | — | classification: expected catalog, actual out-of-scope |
| M-safe-6 | FAIL | catalog → out-of-scope | — | classification: expected catalog, actual out-of-scope |
| M-safe-7 | FAIL | catalog → out-of-scope | — | classification: expected catalog, actual out-of-scope |
| M-safe-8 | FAIL | catalog → out-of-scope | — | classification: expected catalog, actual out-of-scope |
| M-safe-9 | FAIL | catalog → out-of-scope | — | classification: expected catalog, actual out-of-scope |
| M-safe-10 | FAIL | catalog → out-of-scope | — | classification: expected catalog, actual out-of-scope |
| M-flow-1 | PASS | out-of-scope → out-of-scope | — | — |
| M-flow-2 | PASS | out-of-scope → out-of-scope | — | — |
| M-flow-3 | PASS | out-of-scope → out-of-scope | — | — |
| M-flow-4 | PASS | out-of-scope → out-of-scope | — | — |
| M-flow-5 | PASS | out-of-scope → out-of-scope | — | — |
| M-flow-6 | PASS | out-of-scope → out-of-scope | — | — |
| M-flow-7 | PASS | out-of-scope → out-of-scope | — | — |
| M-flow-8 | PASS | out-of-scope → out-of-scope | — | — |
| M-flow-9 | PASS | out-of-scope → out-of-scope | — | — |
| M-flow-10 | PASS | out-of-scope → out-of-scope | — | — |
| M-gap-1 | PASS | engineering → engineering | — | — |
| M-gap-2 | PASS | engineering → engineering | — | — |
| M-gap-3 | PASS | engineering → engineering | — | — |
| M-gap-4 | PASS | engineering → engineering | — | — |
| M-gap-5 | PASS | engineering → engineering | — | — |
| M-gap-6 | PASS | engineering → engineering | — | — |
| M-gap-7 | PASS | engineering → engineering | — | — |
| M-gap-8 | PASS | engineering → engineering | — | — |
| M-gap-9 | PASS | engineering → engineering | — | — |
| M-gap-10 | PASS | engineering → engineering | — | — |
| M-alarm-1 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| M-alarm-2 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| M-alarm-3 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| M-alarm-4 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| M-alarm-5 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| M-alarm-6 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| M-alarm-7 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| M-alarm-8 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| M-alarm-9 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| M-alarm-10 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| MX01 | PASS | out-of-scope → out-of-scope | — | — |
| MX02 | PASS | out-of-scope → out-of-scope | — | — |
| MX03 | PASS | out-of-scope → out-of-scope | — | — |
| MX04 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| MX05 | FAIL | catalog → out-of-scope | — | classification: expected catalog, actual out-of-scope |
| MX06 | FAIL | catalog → catalog | MK04,MK05,MK13 | sensor site: expected {"min":-40,"max":85}, actual {"min":40,"max":85} |
| MX07 | FAIL | catalog → catalog | MK04,MK05,MK13 | sensor site: expected {"min":-40,"max":85}, actual {"min":null,"max":85} |
| MX08 | PASS | engineering → engineering | — | — |
| MX09 | PASS | engineering → engineering | — | — |
| MX10 | PASS | engineering → engineering | — | — |
| MX11 | PASS | out-of-scope → out-of-scope | — | — |
| MX12 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| MX13 | PASS | out-of-scope → out-of-scope | — | — |
| MX14 | PASS | out-of-scope → out-of-scope | — | — |
| MX15 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| MX16 | PASS | catalog → catalog | MK04,MK05,MK13 | — |
| MX17 | FAIL | out-of-scope → catalog | MK04,MK05,MK13 | classification: expected out-of-scope, actual catalog; ordinary candidate cards must not be proposed |
| MX18 | PASS | catalog → catalog | MK04,MK05,MK13 | — |

## Langues : ne pas confondre inventaire et sens

Application réelle : FR, EN, DE, ES, IT, ZH, RU, JA. **NL non supporté dans l’UI** : test négatif de couverture uniquement, pas régression d’une promesse NL. RU/JA ont inventaire vert mais pas nouvelle fixture de modalité ici : **UNTESTED** sémantiquement.

| ID | Locale UI supportée | Résultat attendu | Réel | Statut |
|---|---|---|---|---|
| L-en | oui | out-of-scope | out-of-scope | PASS |
| L-fr | oui | out-of-scope | catalog | FAIL |
| L-de | oui | out-of-scope | catalog | FAIL |
| L-es | oui | out-of-scope | catalog | FAIL |
| L-nl | non | out-of-scope | catalog | FAIL |
| L-it | oui | out-of-scope | catalog | FAIL |
| L-zh | oui | out-of-scope | catalog | FAIL |

## Rendu / interactions : composants de production

| ID | Statut | Preuve / limite |
|---|---|---|
| U01 | FAIL | Six réponses → contacteur externe séparé, zéro carte au lieu de cartes ; même D01 que fonction pure. |
| U02 | PASS | Capteur 200°C → zéro carte, titre engineering et détails fermés. La concision est vérifiée structurellement, pas mesurée visuellement. |
| U03 | PASS | -40..85 → cartes ET avertissements thermiques. |
| U04 | FAIL | inside : hint absent, impossible de cliquer appliquer ; même D07. Les étapes postérieures non atteintes sont UNTESTED dans ce scénario. |
| U05 | PASS | Dimensions aimant + câble : pas de hint, champ longueur vide. |
| U06 | PASS | Six réponses vides : bouton désactivé et zéro carte. |
| U07 | FAIL | Ferrous / MK02 interne : zéro carte, défaut D02. |
| U08 | PASS | Quatre IDs différents avant sélection, SVG hors bouton/détails ; ouvrir ne crée pas un cinquième ; quatre sources et caveat qualification. |
| U09 | PASS | Pointer-down/move/click aperçu ne sélectionne pas ; bouton natif focalisable, clic explicite, une sélection. Enter/Space navigateur réel UNTESTED. |
| U10 | PASS | DesignSpace : préférence XHP-3, fermeture/réouverture conserve aria-pressed et quatre aperçus. |
| U11 | PASS | 70 mm, aimant 2×2, +/-1 mm : deux points R&D explicitement visibles, aucune validation physique conclue. |
| U12 | PASS | Reed direct 110 VAC 5 A : zéro carte. |
| U13 | PASS | sensor pocket : champs vides avant consentement, 9/6/4 après clic. |
| U14 | PASS | Refus dimensions : champs vides, hint ne revient pas lors du retour à question. |

### Accessibilité / performance structurelles

- Boutons natifs, type button, aria-pressed, focus DOM ; preview frère et détails séparés : exercés dans les nouveaux tests et les tests historiques. Aucun test statique “un seul aperçu”.
- use-webgl-slot.ts:17 budget MAX_LIVE_CONTEXTS=4 ; acquire/release:62–99 ; tests existants du budget inclus dans les 1 458 verts. connector-preview.tsx:162–185 observation lazy et cleanup, 198–212 fallback/error boundary ; connector-preview-scene.tsx:88–94 OrbitControls autoRotate désactivé sous reduced. Inspection **PARTIAL** : pas mesure GPU, pas compteur réel de contextes.
- Taille stable aspect 8/5 et grille deux colonnes dans source. Quatre previews partagent le budget avec autres vignettes : tous visibles ne signifie pas tous WebGL actifs.
- Couverture nouvelle du chemin préférences/revue ; le second emplacement DesignSpace n’a pas un nouveau parcours complet dans ce lot : **PARTIAL** (sélecteur commun exercé, suite précédente verte).
- Pas de mesure navigateur du contraste, taille de cible 44 px, reflow mobile, temps CPU/GPU ni performance. **UNTESTED** pour ces mesures ; sources et attributs ne remplacent pas une recette visuelle.

## Business / NDA / backend

- 20 nouveaux tests locaux verts : quatre champs manquants individuellement refusés, marker propre au champ admis, marker autre champ refusé ; volume 0/négatif/fraction/NaN/Inf/>1e9 refusé, durée 0/négative/NaN/Inf/>100 refusée, calendrier invalide et datetime non date refusés.
- Date bissextile 2028-02-29, phase exploration explicite, 2 700 capteurs/an, durée 4,5 : checkSubmission réel avec consentement lié au hash passe ; changement vers date invalide échoue. NDA not_required reste optionnel ; aucun submit/RPC invoqué.
- v1.11 est indiquée STAGÉE/NON APPLIQUÉE dans le dernier rapport source : aucun serveur interrogé pour le vérifier. Validation distante, statuts/permissions/consentements DB réels : **UNTESTED**. Les tests PGlite historiques ne valent pas preuve serveur.
- L’empreinte de l’original NDA correspond exactement ; pas modification, génération ou signature.

## Limites navigateur et prochain walkthrough de 15 minutes

Aucun navigateur connecté supposé ou fabriqué ; `LOVABLE_BROWSER_AUTH_STATUS=no_supabase` ne prouve pas les paramètres hébergés. Pas de Playwright dans cette campagne : aucune nouvelle preuve visuelle / WebGL / soumission réelle revendiquée. Le précédent rapport avait observé /design → Accès réservé sans connexion. Les erreurs anciennes du journal dev (assets public / server transform) ne sont pas attribuées à ce lot de tests ; dernier journal automatique build OK.

1. **0–2 min** : le propriétaire se connecte, crée un projet jetable ; confirme que rien n’est partagé automatiquement.
2. **2–5 min** : six questions, cas PLC/contacteur R12 puis MK02 R13 ; constater les deux faux rejets, capturer sans soumettre.
3. **5–7 min** : capteur 200°C puis Unicode −40…85 ; contrôler les avertissements et l’absence de proposition trompeuse.
4. **7–9 min** : phrase “inside” puis “sensor pocket” ; appliquer/refuser les cotes ; vérifier qu’aucune cote ne change avant clic.
5. **9–12 min** : quatre connecteurs sur desktop/mobile, rotation sans sélection, Tab/Enter/Space sur boutons, changement PHR-3/XHP-3, fermeture/réouverture, sources et caveats repliés ; vérifier rendu WebGL réel et repli sans GPU/mouvement réduit.
6. **12–15 min** : préparation de revue, quatre champs business valeur ou non défini, NDA optionnel ; contrôle visuel des consentements **sans envoi réel**. Un envoi de recette et le retour serveur nécessitent accord explicite distinct (créent des données) et validation du déploiement v1.11.

**Prochaine décision : autoriser un lot de corrections ciblées D01–D06 avant la démo ; conserver les 36 tests rouges comme critères de recette. Aucun correctif effectué ici.**
