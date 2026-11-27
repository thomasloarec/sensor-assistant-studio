# Questionnaire corrections and 104-test replay — 27 November 2026

**104 / 104 acceptance checks passed in Google Chrome on the corrected local application.**
The original published-site audit had 41 NOK, 17 reserves and 46 OK. A PASS here means the requested proposal, clarification or engineering route is present. It does **not** mean every application has a qualified standard product.

## Nine workstreams

| ID | Correction | Verification examples |
|---|---|---|
| F01 | Distinguish existing/additional magnet, ferrous target/material negation and allowed remote placement; clarify late contradictions. | S006–S013, S049, S082, S089 |
| F02 | Keep sensing gap separate from speed, cable length, travel and remote placement; normalize mm/cm/m/inches and warn per displayed pair. | S014–S025, S083–S084, S090–S091 |
| F03 | Read the sensor signal circuit separately from motor/load power; remove invented current and motor labels for other loads. | S026–S028, S032–S033, S046, S085 |
| F04 | No random products for empty/filler/numeric-only answers; explicit non-sensor requests get a scope explanation. Partial sensor projects remain open. | S001–S005, S042–S043, S047, S070–S075, S086–S088 |
| F05 | Analog measurement keeps its own technology-study route. NF/Form C require exact-variant confirmation; independent limits are distinct from SPDT. | S029–S031, S044–S045, S056, S095 |
| F06 | Show qualification reserves for ATEX, SIL/OSSD, immersion and cadence; read the real sensor temperature and avoid an unsupported Recommended badge. | S034–S041, S057, S094 |
| F07 | Recognize explicit mounting in all eight offered languages; translate new customer copy in all seven non-French languages. | S076–S081, S096, W006 |
| F08 | Free-text through-hole mounting uses the structured filter; cylinder groove needs a specific mounting study. | S053, S055, S061 |
| F09 | Explain non-positive dimensions, preserve decimal-comma filtering, and describe stated space without claiming custom-design fit. | S064–S069 |

## Method and scope

- Base: `f5c727856d6a92ab1a25b886dbc3dfac03e1059b`; branch `codex/questionnaire-nine-fixes-20261127`.
- The exact 96 six-answer inputs and optional mounting/dimension choices come from `tests/fixtures/questionnaire-104-20261127.json`, copied unchanged from the published-site audit.
- Chrome replay used real field fills and clicks, a fresh in-memory project per case, visible result snapshots, and all eight workflow checks. Empty final answers use the available Couples navigation to verify the clarification page when the final button is disabled.
- W003 adaptation: S012 is now correctly unblocked before editing; the same target correction is checked through Q2 navigation. No obsolete warning returns.
- Local app: `http://127.0.0.1:5188`, public customer-entry setting enabled locally. A development-only loader serves the unchanged STEP manifest because Vite dev disallows importing JSON from public. Neither helper nor setting is shipped in this PR. No application result, catalogue, ranking or questionnaire handler was mocked.
- [Full observed browser evidence](replay-104.json): result text, issue IDs, card text, gap/thermal warnings, snapshots and workflow observations. SHA-256: `be928f387f36d42553636992962c45cb36c9a0696b8556b8e30bc3b1b1da7c71`.
- Additional automated regression: 2,538 passed, 0 failed, 1 existing Blender-dependent skip, across 195 files. Type check and production build passed. The original 96 cases are now permanent automated engine tests, plus a unit/subject regression.

## Limits and next deployment step

The published Lovable site and Azure deployment were not modified. After merge and publication, perform a deployment smoke check of the critical paths. This deterministic regression sample does not demonstrate 99% real-world relevance. Arbitrary wording, new products and other languages outside the offered set are not exhaustively covered. Engineering confirmation remains required for feasibility, contact variant, certification, environmental qualification and real sensing distance. Liquid-level paths, sending customer forms, NDA, automatic sales appointments and 3D imports are outside this replay. W008 checks workshop loading and the return path, not physical accuracy.

## Results

| Test | Original scenario | Published audit | Corrected local replay | Observed outcome |
|---|---|---|---|---|
| S001 | Six réponses vides | OK | PASS | Ask for a concrete detection requirement |
| S002 | Capot industriel complet | OK | PASS | MK04, MK05, MK13 |
| S003 | Application seule | RÉSERVE | PASS | MK01, MK15, MK16, CUSTOM; exploratory / qualification status |
| S004 | Six réponses je ne sais pas | NOK | PASS | Ask for a concrete detection requirement |
| S005 | Mot capteur seul | NOK | PASS | Ask for a concrete detection requirement |
| S006 | Aimant interdit uniquement près du produit | NOK | PASS | MK01, MK15, MK16, CUSTOM; gap qualification visible; exploratory / qualification status |
| S007 | Champ interdit partout dans équipement | OK | PASS | Explain magnetic requirement; explore relocation / another technology with Standex |
| S008 | Cible acier sans aimant externe | NOK | PASS | MK02, MK04, MK05; gap qualification visible; exploratory / qualification status |
| S009 | Cible aluminium sans aimant | RÉSERVE | PASS | Explain magnetic requirement; explore relocation / another technology with Standex |
| S010 | Déport explicite avec entrefer séparé | NOK | PASS | MK01, MK15, MK16, CUSTOM; gap qualification visible; exploratory / qualification status |
| S011 | Acier avec aimant intégré au capteur | NOK | PASS | MK02, MK04, MK05; gap qualification visible; exploratory / qualification status |
| S012 | Aimant déjà installé, pas de second aimant | NOK | PASS | MK04, MK05, MK13 |
| S013 | Aimant possible, mais non encore choisi | OK | PASS | MK04, MK05, MK13 |
| S014 | Vitesse 0,5 m/s | OK | PASS | MK04, MK05, MK13 |
| S015 | Vitesse 0.5 m/s | OK | PASS | MK04, MK05, MK13 |
| S016 | Course 300 mm, entrefer 5 mm | OK | PASS | MK04, MK05, MK13 |
| S017 | Câble 2 m, entrefer 5 mm | OK | PASS | MK04, MK05, MK13 |
| S018 | Entrefer réel 500 mm | NOK | PASS | Standex engineering study for the stated gap |
| S019 | Entrefer 5 cm | NOK | PASS | MK04, MK05, MK13; gap qualification visible; exploratory / qualification status |
| S020 | Entrefer 0.2 inch | RÉSERVE | PASS | MK04, MK05, MK13 |
| S021 | Entrefer négatif | NOK | PASS | Clarify invalid dimension |
| S022 | Distance 500 mm formulation simple | OK | PASS | Standex engineering study for the stated gap |
| S023 | Distance 50 mm formulation simple | NOK | PASS | MK04, MK05, MK13; gap qualification visible; exploratory / qualification status |
| S024 | Distance 0.5 m avec point | OK | PASS | Standex engineering study for the stated gap |
| S025 | Distance 50 mm à la question 4 | NOK | PASS | Clarify conflicting constraints |
| S026 | Microcontrôleur 3,3 V 1 mA | OK | PASS | MK04, MK05, MK13 |
| S027 | Moteur direct 230 V 8 A | RÉSERVE | PASS | Separate signal from load power; study suitable interface |
| S028 | Moteur 230 V isolé du signal | NOK | PASS | MK04, MK05, MK13 |
| S029 | Contact normalement fermé | RÉSERVE | PASS | MK04, MK05, MK13; exploratory / qualification status |
| S030 | Inverseur trois fils | NOK | PASS | MK04, MK05, MK13; exploratory / qualification status |
| S031 | Sortie analogique 4–20 mA | NOK | PASS | Study the requested measurement technology and interface |
| S032 | Courant signal 10 mA | OK | PASS | MK04, MK05, MK13 |
| S033 | Charge directe 24 V 5 A | NOK | PASS | Separate signal from load power; study suitable interface |
| S034 | Température 150 °C | RÉSERVE | PASS | MK21, MK04, MK05; thermal qualification visible |
| S035 | Température 300 °C | OK | PASS | Standex engineering study beyond documented temperature |
| S036 | Température -80 °C | RÉSERVE | PASS | MK04, MK05, MK13; thermal qualification visible; exploratory / qualification status |
| S037 | Four chaud mais capteur déporté | OK | PASS | MK04, MK05, MK13 |
| S038 | Immersion IP68 eau salée | NOK | PASS | MK04, MK05, MK13; exploratory / qualification status |
| S039 | Zone ATEX certification | NOK | PASS | MK04, MK05, MK13; exploratory / qualification status |
| S040 | Fonction sécurité SIL3 | NOK | PASS | MK04, MK05, MK13; exploratory / qualification status |
| S041 | Cadence très rapide | NOK | PASS | MK04, MK05, MK13; exploratory / qualification status |
| S042 | Demande de pizza | NOK | PASS | Explain scope and request an actual sensor requirement |
| S043 | Application météo logicielle | NOK | PASS | Explain scope and request an actual sensor requirement |
| S044 | Sonde de température | RÉSERVE | PASS | Preserve temperature measurement need; request a Standex study |
| S045 | Capteur de courant | NOK | PASS | Study the requested measurement technology and interface |
| S046 | Instruction de forcer une recommandation | RÉSERVE | PASS | Separate signal from load power; study suitable interface |
| S047 | Ponctuation seule | OK | PASS | Ask for a concrete detection requirement |
| S048 | Texte HTML inerte | RÉSERVE | PASS | MK04, MK05, MK13 |
| S049 | Contradiction tardive sur aimant | NOK | PASS | Clarify conflicting constraints |
| S050 | Porte de fenêtre alarme | OK | PASS | MK04, MK05, MK13 |
| S051 | Bac machine à café | OK | PASS | MK04, MK05, MK13 |
| S052 | Cadence vélo | OK | PASS | MK04, MK05, MK13; thermal qualification visible; exploratory / qualification status |
| S053 | Vérin pneumatique | NOK | PASS | CUSTOM; exploratory / qualification status |
| S054 | Volet ventilation | OK | PASS | MK04, MK05, MK13; thermal qualification visible; exploratory / qualification status |
| S055 | Compteur de débit rotor | NOK | PASS | MK06, CUSTOM |
| S056 | Robot deux fins de course | NOK | PASS | MK04, MK05, MK13; exploratory / qualification status |
| S057 | Trappe extérieure automobile | NOK | PASS | MK21, MK04, MK05; thermal qualification visible; exploratory / qualification status |
| S058 | Corps fileté sélectionné | OK | PASS | MK11, MK11, MK11; gap qualification visible; exploratory / qualification status |
| S059 | Collerette sélectionnée | OK | PASS | MK04, MK05, MK13 |
| S060 | Emboîtement sélectionné | OK | PASS | MK03, MK07, MK14; gap qualification visible; exploratory / qualification status |
| S061 | PCB traversant sélectionné | OK | PASS | MK06, CUSTOM |
| S062 | PCB CMS sélectionné | OK | PASS | MK01, MK15, MK16, CUSTOM; gap qualification visible; exploratory / qualification status |
| S063 | Autre montage sélectionné | OK | PASS | MK03, MK07, MK04; gap qualification visible; exploratory / qualification status |
| S064 | Volume très petit 1×1×1 | RÉSERVE | PASS | CUSTOM; exploratory / qualification status |
| S065 | Volume 30×20×10 | OK | PASS | MK04, MK05, MK13 |
| S066 | Dimensions nulles | NOK | PASS | Clarify invalid dimension |
| S067 | Dimensions négatives | NOK | PASS | Clarify invalid dimension |
| S068 | Dimensions non numériques | OK | PASS | MK04, MK05, MK13 |
| S069 | Dimensions décimales virgule | OK | PASS | MK04, MK13 |
| S070 | Sans application | OK | PASS | MK04, MK05, MK13 |
| S071 | Sans cible | RÉSERVE | PASS | MK04, MK05, MK13; exploratory / qualification status |
| S072 | Sans mouvement | RÉSERVE | PASS | MK04, MK05, MK13; exploratory / qualification status |
| S073 | Sans montage | RÉSERVE | PASS | MK01, MK15, MK16, CUSTOM; gap qualification visible; exploratory / qualification status |
| S074 | Sans interface électrique | RÉSERVE | PASS | MK04, MK05, MK13; exploratory / qualification status |
| S075 | Sans environnement | RÉSERVE | PASS | MK04, MK05, MK13; exploratory / qualification status |
| S076 | Réponses complètes en anglais | OK | PASS | MK04, MK05, MK13 |
| S077 | Réponses complètes en allemand | NOK | PASS | MK04, MK05, MK13 |
| S078 | Réponses complètes en espagnol | NOK | PASS | MK04, MK05, MK13 |
| S079 | Réponses complètes en chinois | NOK | PASS | MK04, MK05, MK13 |
| S080 | Réponses complètes en japonais | NOK | PASS | MK04, MK05, MK13 |
| S081 | Réponses complètes en italien | NOK | PASS | MK04, MK05, MK13 |
| S082 | Pas de plastique à détecter | NOK | PASS | MK02, MK01, MK15, CUSTOM; gap qualification visible; exploratory / qualification status |
| S083 | Course 500 mm sans entrefer indiqué | OK | PASS | MK04, MK05, MK13 |
| S084 | Entrefer vrai 100 mm sans espace | OK | PASS | Standex engineering study for the stated gap |
| S085 | Tension réseau interdite, signal seul | NOK | PASS | MK04, MK05, MK13 |
| S086 | Espaces seuls | OK | PASS | Ask for a concrete detection requirement |
| S087 | Chiffre seul | NOK | PASS | Ask for a concrete detection requirement |
| S088 | Description longue cohérente | OK | PASS | MK04, MK05, MK13 |
| S089 | Aimant existant et négation en anglais | NOK | PASS | MK04, MK05, MK13 |
| S090 | Distance 0,5 m formulation simple | OK | PASS | Standex engineering study for the stated gap |
| S091 | Distance 50 cm formulation simple | OK | PASS | Standex engineering study for the stated gap |
| S092 | Paroi acier entre aimant et capteur | OK | PASS | MK04, MK05, MK13; exploratory / qualification status |
| S093 | Matériau non ferreux | OK | PASS | MK04, MK05, MK13 |
| S094 | Température 200 °C | OK | PASS | Standex engineering study beyond documented temperature |
| S095 | Inverseur SPDT sans ambiguïté | RÉSERVE | PASS | MK04, MK05, MK13; exploratory / qualification status |
| S096 | Réponses complètes en russe | NOK | PASS | MK04, MK05, MK13 |
| W001 | Six clics Je ne sais pas encore | OK | PASS | Six unknown buttons lead to clarification and no product cards. |
| W002 | Correction depuis Informations insuffisantes | OK | PASS | Edit action opens Q1; adding a purpose restores exploratory product suggestions. |
| W003 | Correction de la contrainte aimant | OK | PASS | S012 is no longer incorrectly blocked. Editing Q2 preserves ordinary suggestions with no stale warning. |
| W004 | Filtre de montage alternatif | OK | PASS | CMS exploration changes products, preserves written screw mounting and displays the resulting compromise. |
| W005 | Contact ingénierie depuis 500 mm | OK | PASS | Engineering action opens Standex review, preserving all six answers and leaving sensor unselected. Nothing submitted. |
| W006 | Allemand avec interface allemande | NOK | PASS | German inputs with German UI retain screw-mount filtering; MK04/MK05/MK13, no PCB suggestions. |
| W007 | Ouverture des détails du produit | OK | PASS | MK04 detail dialog opens, Electrical tab and symbolic contacts work; simultaneous electrical limits and consultation-only status are visible. |
| W008 | Passage du couple à l’atelier 3D | OK | PASS | MK04 + M04 workshop finishes loading with 3D scene, cycle control and contact state; return to pairs works. No physical validation or import test claimed. |
