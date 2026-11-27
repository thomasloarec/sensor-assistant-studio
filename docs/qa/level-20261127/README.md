# Liquid-level journey — corrective replay, 27 November 2026

**124 original audit criteria reviewed: 111 validated locally; 13 need deployment/integration confirmation.** The 80 original questionnaire scenarios all pass through the actual React questionnaire components. This is not 124 Chrome sessions, 124 live submissions, a 99% statistical success rate, or product qualification.

## Corrections

1. Empty, irrelevant, solid-medium and contradictory requests now receive explicit clarification. An explicit low-level free-text goal is preserved when the structured answer is unknown. Only an unrelated or entirely undefined request blocks submission; difficult sensor projects remain open to engineering.
2. Magnetic exclusions, no-moving-part requirements and closed tanks receive tailored explanations and possible remote/mechanical/external arrangements, without asserting feasibility.
3. Food/CIP, ATEX/SIL/OSSD, precision/output and direct power switching constraints remain visible in review and exports. No certification or electrical capability is invented.
4. Viscosity/density and freezing conditions receive specific warnings; frozen-water requests do not receive a validated float proposal.
5. Unreachable thresholds remain at the requested height. A 10 m tank with top access no longer silently moves its low-level target to 80%.
6. Level review now invokes the existing Claude identity service and propagates the generated project name and industry. This API reduces manual entry and improves classification; manual choices and confidentiality gates are preserved. Live Claude output remains an integration check.
7. A previously masked NDA stub receives the consented project title before submission, through the existing authorized RPC. A server refusal fails closed. The NDA form was already present; its presence, unsigned DOCX generation and transfer lock were retested.
8. Default booking no longer presents fictitious appointments. Demo requires an explicit setting; the existing real Outlook provider still requires Standex IT configuration (see [activation guide](../../outlook-booking.md)). This PR does not activate Outlook or prove invitation delivery.
9. Invalid custom cable length cannot bypass validation through the stepper. Numeric questionnaire errors also remain blocking across direct stage navigation.

Additional visual fix: readable two-row stepper at 320 px and corrected workspace header layout; title no longer overflows on narrow screens. All new UI messages have the seven translations in addition to French.

## Validation and limits

- Full regression: **2,638 passed, 0 failed, 1 pre-existing optional Blender skip**, 200 files. Standard sensor regression is included.
- After the final header layout adjustment: all 49 affected shell/workshop tests rerun successfully, followed by type checking and a successful production build.
- Type checking and production build pass. The design scans find only pre-existing theme-color/3D material literals and legacy UI primitives; no new literal-token violation was introduced.
- Chrome on the local full application: public navigation, level questionnaire, desktop WebGL scene, low-level signal, animation, cable, contact retention, NDA, PDF, 320/390/768 px layouts. The lightweight workshop harness cannot serve the full submission module, so the full application was used instead.
- The 80-case DOM replay disables GPU rendering only; it drives the actual four-question component and checks review outcomes. See [fixture](../../../tests/fixtures/level-80-20261127.json) and [runner](../../../tests/level-audit-80.test.tsx).
- Claude, submission RPC and Microsoft tests simulate remote responses. Their success is **not** proof of a working deployed service. 13 criteria remain explicitly open below.
- Local exports: unsigned DOCX verified structurally; draft PDF rendered and inspected (3 pages for this draft, versus 5 in the previous submitted example), embedded JSON and printed canonical hash checked. No NDA was signed, no production dossier was changed, no real meeting was booked.
- Language rules for free-text constraint detection are conservative French/English patterns; this is not exhaustive natural-language understanding across all site languages. Materials, pressure, electrical ratings, standards and final engineering feasibility still require Standex confirmation.

## Required after merge and publication

Recheck AUTO001–AUTO005, NDA004, SUB003–SUB006, RDV001, RDV003 and MAIL001 on the deployed site. Use a clearly marked TEST RECETTE dossier and the authorized test contact. Confirm real identity responses, NDA-stub permissions and readable title, commercial routing, send/list/restore, actual appointment/invitation and email receipt. Outlook requires the IT configuration documented above; absence of that configuration remains a release limitation.

## Traceability for all 124 criteria

`LOCAL_OK` means the described local check passed; `DEPLOYMENT_CHECK` means local logic may pass but the original external outcome has not been re-proven. The previous audit result is preserved, not carried forward as current evidence. Detailed observations are in [replay-124.json](replay-124.json).

| ID | Criterion | Before | Current | Evidence / scope |
|---|---|---|---|---|
| L001 | Cuve eau complète, niveau bas en accès haut | OK | LOCAL_OK | React DOM questionnaire replay |
| L002 | Toutes réponses inconnues | NOK | LOCAL_OK | React DOM questionnaire replay |
| L003 | Application seule | NOK | LOCAL_OK | React DOM questionnaire replay |
| L004 | Réponse vague je ne sais pas | NOK | LOCAL_OK | React DOM questionnaire replay |
| L005 | Demande sans rapport : météo | NOK | LOCAL_OK | React DOM questionnaire replay |
| L006 | Demande sans rapport : pizza | NOK | LOCAL_OK | React DOM questionnaire replay |
| L007 | Niveau de poudre sèche | NOK | LOCAL_OK | React DOM questionnaire replay |
| L008 | Champ magnétique interdit partout | NOK | LOCAL_OK | React DOM questionnaire replay |
| L009 | Champ interdit localement, déport possible | NOK | LOCAL_OK | React DOM questionnaire replay |
| L010 | Cible sans flotteur ni pièce mobile | NOK | LOCAL_OK | React DOM questionnaire replay |
| L011 | Température maximale 70 °C | OK | LOCAL_OK | React DOM questionnaire replay |
| L012 | Température maximale 71 °C | OK | LOCAL_OK | React DOM questionnaire replay |
| L013 | Température maximale 80 °C | OK | LOCAL_OK | React DOM questionnaire replay |
| L014 | Température maximale 81 °C | OK | LOCAL_OK | React DOM questionnaire replay |
| L015 | Température maximale 160 °C | OK | LOCAL_OK | React DOM questionnaire replay |
| L016 | Température maximale 161 °C | OK | LOCAL_OK | React DOM questionnaire replay |
| L017 | Température maximale 200 °C | OK | LOCAL_OK | React DOM questionnaire replay |
| L018 | Température maximale 201 °C | OK | LOCAL_OK | React DOM questionnaire replay |
| L019 | Température minimale -20 °C | OK | LOCAL_OK | React DOM questionnaire replay |
| L020 | Température minimale -21 °C | OK | LOCAL_OK | React DOM questionnaire replay |
| L021 | Température minimale -40 °C | OK | LOCAL_OK | React DOM questionnaire replay |
| L022 | Température minimale -41 °C | OK | LOCAL_OK | React DOM questionnaire replay |
| L023 | Températures inversées | OK | LOCAL_OK | React DOM questionnaire replay |
| L024 | Température sous le zéro absolu | OK | LOCAL_OK | React DOM questionnaire replay |
| L025 | Température maximale inconnue | OK | LOCAL_OK | React DOM questionnaire replay |
| L026 | Température minimale inconnue | OK | LOCAL_OK | React DOM questionnaire replay |
| L027 | Huile hydraulique | OK | LOCAL_OK | React DOM questionnaire replay |
| L028 | Liquide eau glycol automobile | OK | LOCAL_OK | React DOM questionnaire replay |
| L029 | Acide sulfurique concentré | OK | LOCAL_OK | React DOM questionnaire replay |
| L030 | Fluide alimentaire lait | NOK | LOCAL_OK | React DOM questionnaire replay |
| L031 | Essence en atmosphère explosive | NOK | LOCAL_OK | React DOM questionnaire replay |
| L032 | Fluide très visqueux | NOK | LOCAL_OK | React DOM questionnaire replay |
| L033 | Autre liquide sans référence | OK | LOCAL_OK | React DOM questionnaire replay |
| L034 | Liquide non défini | OK | LOCAL_OK | React DOM questionnaire replay |
| L035 | Cuve sous pression | OK | LOCAL_OK | React DOM questionnaire replay |
| L036 | Immersion permanente du corps | OK | LOCAL_OK | React DOM questionnaire replay |
| L037 | Sortie de câble immergée | OK | LOCAL_OK | React DOM questionnaire replay |
| L038 | Pression et immersion du câble cumulées | OK | LOCAL_OK | React DOM questionnaire replay |
| L039 | Hauteur de cuve 0 cm | OK | LOCAL_OK | React DOM questionnaire replay |
| L040 | Hauteur de cuve -5 cm | OK | LOCAL_OK | React DOM questionnaire replay |
| L041 | Hauteur de cuve 5,9 cm | OK | LOCAL_OK | React DOM questionnaire replay |
| L042 | Hauteur de cuve 6 cm | OK | LOCAL_OK | React DOM questionnaire replay |
| L043 | Hauteur de cuve 10 cm | OK | LOCAL_OK | React DOM questionnaire replay |
| L044 | Hauteur de cuve 20,5 cm | OK | LOCAL_OK | React DOM questionnaire replay |
| L045 | Hauteur de cuve 100 cm | OK | LOCAL_OK | React DOM questionnaire replay |
| L046 | Hauteur de cuve 200 cm | OK | LOCAL_OK | React DOM questionnaire replay |
| L047 | Hauteur de cuve 1000 cm | NOK | LOCAL_OK | React DOM questionnaire replay |
| L048 | Hauteur de cuve 1000,1 cm | OK | LOCAL_OK | React DOM questionnaire replay |
| L049 | Hauteur de cuve abc cm | OK | LOCAL_OK | React DOM questionnaire replay |
| L050 | Position de fixation libre — Un niveau haut | OK | LOCAL_OK | React DOM questionnaire replay |
| L051 | Position de fixation libre — Un niveau bas | OK | LOCAL_OK | React DOM questionnaire replay |
| L052 | Ouverture imposée en haut — Un niveau haut | OK | LOCAL_OK | React DOM questionnaire replay |
| L053 | Ouverture imposée en haut — Un niveau bas | OK | LOCAL_OK | React DOM questionnaire replay |
| L054 | Accès par une paroi latérale — Un niveau haut | OK | LOCAL_OK | React DOM questionnaire replay |
| L055 | Accès par une paroi latérale — Un niveau bas | OK | LOCAL_OK | React DOM questionnaire replay |
| L056 | Insertion par le fond — Un niveau haut | OK | LOCAL_OK | React DOM questionnaire replay |
| L057 | Insertion par le fond — Un niveau bas | OK | LOCAL_OK | React DOM questionnaire replay |
| L058 | Cuve peu profonde avec vaguelettes | OK | LOCAL_OK | React DOM questionnaire replay |
| L059 | Suivi continu vertical | OK | LOCAL_OK | React DOM questionnaire replay |
| L060 | Suivi continu et accès latéral | OK | LOCAL_OK | React DOM questionnaire replay |
| L061 | Deux niveaux explicites | OK | LOCAL_OK | React DOM questionnaire replay |
| L062 | Quatre niveaux explicites | OK | LOCAL_OK | React DOM questionnaire replay |
| L063 | Douze niveaux | OK | LOCAL_OK | React DOM questionnaire replay |
| L064 | Niveaux multiples en accès latéral | OK | LOCAL_OK | React DOM questionnaire replay |
| L065 | Niveaux inversés | OK | LOCAL_OK | React DOM questionnaire replay |
| L066 | Niveaux en doublon | OK | LOCAL_OK | React DOM questionnaire replay |
| L067 | Niveau hors cuve | OK | LOCAL_OK | React DOM questionnaire replay |
| L068 | Niveaux en pourcentage | OK | LOCAL_OK | React DOM questionnaire replay |
| L069 | Pourcentage au-delà de 100 | OK | LOCAL_OK | React DOM questionnaire replay |
| L070 | Pourcentage négatif | OK | LOCAL_OK | React DOM questionnaire replay |
| L071 | Niveaux partiellement renseignés | OK | LOCAL_OK | React DOM questionnaire replay |
| L072 | Injonction de contourner les réserves | OK | LOCAL_OK | React DOM questionnaire replay |
| L073 | Commande directe moteur 230 V 10 A | NOK | LOCAL_OK | React DOM questionnaire replay |
| L074 | Besoin de sécurité SIL3 OSSD | NOK | LOCAL_OK | React DOM questionnaire replay |
| L075 | Aucun perçage de cuve possible | NOK | LOCAL_OK | React DOM questionnaire replay |
| L076 | Exigence précision continue garantie 0,01 mm | NOK | LOCAL_OK | React DOM questionnaire replay |
| L077 | Autonomie sans alimentation externe | OK | LOCAL_OK | React DOM questionnaire replay |
| L078 | Liquide gelé dans la plage demandée | NOK | LOCAL_OK | React DOM questionnaire replay |
| L079 | Contradiction accès texte et liste | NOK | LOCAL_OK | React DOM questionnaire replay |
| L080 | Contradiction niveau haut et demande libre | NOK | LOCAL_OK | React DOM questionnaire replay |
| NAV001 | Accès par le menu au parcours niveau | OK | LOCAL_OK | Chrome local |
| NDA001 | Présence du formulaire NDA dans Avec Standex | OK | LOCAL_OK | Chrome + component |
| AUTO001 | Secteur automatique pour une application automobile | NOK | DEPLOYMENT_CHECK | Component; Claude response simulated |
| AUTO002 | Nom automatique du projet niveau | NOK | DEPLOYMENT_CHECK | Component; Claude response simulated |
| SUB001 | Validation du formulaire incomplet | OK | LOCAL_OK | Component |
| NDA002 | Blocage sans NDA en vigueur | OK | LOCAL_OK | Chrome + contract |
| NDA003 | Génération du NDA non signé | OK | LOCAL_OK | Chrome + downloaded file |
| NDA004 | Préparation de la fiche NDA | OK | DEPLOYMENT_CHECK | Contract; live check pending |
| SUB002 | Consentement obligatoire avec dossier complet | OK | LOCAL_OK | Submission contract |
| SUB003 | Affectation commerciale France/Paris/Automobile | OK | DEPLOYMENT_CHECK | Routing contract; live data pending |
| SUB004 | Soumission réelle du dossier niveau non confidentiel | OK | DEPLOYMENT_CHECK | Submission contract; live send pending |
| RDV001 | Proposition de rendez-vous après envoi | RÉSERVE | DEPLOYMENT_CHECK | Component; live routing pending |
| RDV002 | Navigation et sélection de créneau | OK | LOCAL_OK | Component; explicit demo provider |
| RDV003 | Réservation et invitation réelles | NOK | DEPLOYMENT_CHECK | Microsoft contract; live invitation pending |
| SUB005 | Projet visible dans Mon espace après envoi | OK | DEPLOYMENT_CHECK | Live check pending |
| SUB006 | Reprise de la version envoyée | OK | DEPLOYMENT_CHECK | Serialization contract; live restore pending |
| AUTO003 | Secteur automatique application médicale | NOK | DEPLOYMENT_CHECK | Component; Claude response simulated |
| AUTO004 | Nom automatique sur le parcours direct | NOK | DEPLOYMENT_CHECK | Component; Claude response simulated |
| AUTO005 | Titre du dossier après retrait du NDA et envoi | NOK | DEPLOYMENT_CHECK | Submission contract; RPCs simulated |
| CFG001 | Renommage manuel et navigation | OK | LOCAL_OK | Component |
| CFG002 | Conversion pourcentage vers cm | OK | LOCAL_OK | Component |
| CFG003 | Seuil de configuration hors plage | OK | LOCAL_OK | Component |
| CFG004 | Détection niveau bas aux deux extrêmes | OK | LOCAL_OK | Chrome local + component |
| CFG005 | Animation lancer/pause | OK | LOCAL_OK | Chrome local |
| CFG006 | Câble standard et terminaison | OK | LOCAL_OK | Chrome local + component |
| CFG007 | Longueur de câble négative | OK | LOCAL_OK | Chrome local + component |
| CFG008 | Contournement par navigation de la longueur invalide | NOK | LOCAL_OK | Chrome local + component |
| CFG009 | Retour câble à Je ne sais pas | OK | LOCAL_OK | Component |
| CFG010 | Correction température et maintien du seuil | OK | LOCAL_OK | Chrome local + component |
| CFG011 | Coordonnées conservées après modification technique | OK | LOCAL_OK | Chrome local + component |
| I18N001 | Revue en anglais | OK | LOCAL_OK | Component + catalogue |
| I18N002 | Revue en allemand et retour français | OK | LOCAL_OK | Component + catalogue |
| VIS001 | Revue mobile 390 × 844 | OK | LOCAL_OK | Chrome local |
| VIS002 | Revue et configurateur 320 × 740 | RÉSERVE | LOCAL_OK | Chrome local |
| VIS003 | Configurateur tablette 768 × 1024 | OK | LOCAL_OK | Chrome local |
| CFG012 | Demande de forme spécifique | OK | LOCAL_OK | Chrome local + component |
| I18N003 | Revue en Español | OK | LOCAL_OK | Component + catalogue |
| I18N004 | Revue en Italiano | OK | LOCAL_OK | Component + catalogue |
| I18N005 | Revue en Русский | OK | LOCAL_OK | Component + catalogue |
| I18N006 | Revue en 简体中文 | OK | LOCAL_OK | Component + catalogue |
| I18N007 | Revue en 日本語 | OK | LOCAL_OK | Component + catalogue |
| DOC001 | PDF niveau téléchargé : lecture des cinq pages | OK | LOCAL_OK | Chrome download + Poppler visual review |
| DOC002 | Données jointes au PDF et empreinte | OK | LOCAL_OK | PDF attachment + hash |
| MAIL001 | Réception de notification côté client | RÉSERVE | DEPLOYMENT_CHECK | Live check pending |
