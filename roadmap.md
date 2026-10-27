# Feuille de route — lot des 7 correctifs (base 12be3e3d)

## Géométries MK14 / MK18 — 26 octobre 2026
- [x] MK14 cylindrique noir, deux fils bleus sans gaine ; MK18 un seul méplat circulaire partagé.
- [x] Cohérence des rendus et STEP ciblé, 1 850 tests verts et préversion seule ; aucune publication (rapport QA_MK14_MK18_2026-10-26.md).

## Atelier 3D — UX intégrée (23 octobre 2026)
- [x] Un seul défilement de commandes, scène/timeline dimensionnées dans les deux modes.
- [x] Mouvement explicite, isolation et arbre simplifié sans changer les identités.
- [x] Cadrage courant et support de placement visibles, huit langues.
- [x] Tests comportementaux, recette intégrée et autonome, documentation et contrôles.

## Atelier 3D — lot 1 du parcours modèle importé (22 octobre 2026)
- [x] Sélection multi-pièces scène + arborescence, isoler/restaurer, monobloc expliqué.
- [x] Mouvement Coulisse/Pivote sur axe quelconque (face ou deux points), validation explicite, aucun mouvement supposé à l'import.
- [x] Montage « Sur une surface » / « À travers une paroi », attaches persistantes, pose libre qui libère l'attache, annuler/rétablir.
- [x] Essai : ouverture mm/° et sens séparés de l'écart, pas manuel, source du contact affichée.
- [x] Trois modèles de démonstration autonomes, café conservé ; tests, traductions, documentation.
- [x] Revue indépendante du lot 1 (13 points) : import transactionnel, supports/unités, commandes unifiées, traversant réconcilié, contact indéterminé sans mouvement, contraste/débordement, démos directes, trou à deux points, axe brut, saisies refusées, mouvement réduit, référence arrière, repères qui suivent.
- [x] Lot 2 : relecture des animations rigides d'un GLB (clips, refus expliqués), attaches sur pièces animées, mesure entre deux repères, démo bras animé, étude STEP (docs/ETUDE_IMPORT_STEP_2026-10-22.md).
- [x] Revue lot 2 : unités réessayables à l'import, restauration du même fichier, curseur et durée réelle des clips, commutations liées à la classe publiée, bloc « Commutations illustratives », menu d'exemples opaque.

## Racines ON et état électrique Reed — base 79a282b
- [x] Raccords ON de largeur finie dans les deux orientations, contours partagés et couloirs OFF conservés.
- [x] État fermé ambré et courant jaune pâle distinct, uniquement dans Reed.
- [x] 33 tests ciblés / 1 732 tests complets, contrôles de charte et revue visuelle 320/378/desktop ; rapport QA_REED_ROOTS_2026-10-13.md sans publication. Recette connectée réservée au propriétaire.

## Formes PIC et invitation Reed — base 86cdc3f
- [x] Géométries SVG originales partagées dessin/hit-testing, hystérésis et gestes conservés.
- [x] Invitation discrète terminée pour la visite après interaction, suspendue hors écran/onglet et statique en mouvement réduit.
- [x] 1 728 tests verts, huit langues sans manque, compilation plateforme OK, revue visuelle 320/378/desktop ; note docs/QA_REED_PIC_2026-10-13.md. Aucun transfert ni publication ; contrôle accueil connecté réservé au propriétaire.

## Retours Reed — 13 octobre 2026, base 44b443c
- [x] Finition locale du courant : flux clair/fin, couleur et dashoffset réels, suppression ouvert et immobilité reduced-motion ; 31 tests ciblés verts et note QA actualisée.
- [x] Couloirs OFF réels, lobes sans anneau central, dessin simplifié et courant conditionné au contact.
- [x] Huit langues, 1 729 tests verts, captures 320/378/desktop, compilation plateforme OK ; aperçu uniquement. Recette home intégrée réservée au propriétaire (accès sandbox restreint).

## Correctif responsive et langue — 18 septembre 2026
- [x] En-tête projet lisible avec titre et statut complets aux largeurs contraintes.
- [x] Titre des panneaux contextuels complet sans déplacer les contrôles hors écran.
- [x] Cadre Standex abonné au changement de langue sans rechargement.
- [x] Recette ciblée, types, compilation et contrôle navigateur aux 24 combinaisons.

## Fait
- [x] 1. M02 réservé à MK02 : preuve documentaire séparée de la politique de recommandation.
- [x] 2. Aimants standard du guide d'activation (forme, matériau, page source) comme repli.
- [x] 3. Vignettes de duo : légendes Capteur/Aimant, icône aimant, aimant sans fil ni connecteur.
- [x] 4. Ordonnanceur WebGL borné (4 contextes), repli 2D expliqué, mouvement réduit respecté.
- [x] 6. Montage nommé en texte libre = contrainte dure (vis OU collage), exclut les CMS seuls.

## En cours
- [ ] 7. Mode illustratif de l'atelier (15 mm / 18 mm), mention permanente, résumé et exports.
- [ ] 5. « Ajuster les critères » : réponses préremplies éditables, régénération, anti-écrasement.
- [ ] 2 bis. Choix du matériau dans l'atelier : vraie référence, cotes et plages du guide.

## Précisions QA du 15 septembre (contrôle indépendant du PDF)
- [ ] Reprendre les plages lues page 35 (ferrite HF32/25 14.95×10×5) et page 34 (NdFeB 10×5×1.9)
      pour MK15/MK16/MK17, et page 23 MK06-4-B ferrite D1 14,7–18,3.
- [ ] Ne jamais transformer « - » ou « <0 » en 0 ; « up/to » reste une PLAGE, pas un seuil ON/OFF.
- [ ] Dédupliquer l'extraction PDF (tableau de page paire répété en page impaire) et attribuer
      chaque ligne au bon en-tête ; MK12 absent de certaines tables AlNiCo → aucune donnée inventée.
- [ ] Montage libre explicite compris même quand la case de montage vaut « autre » ou « à décider ».
- [ ] Explorer d'autres critères reste possible, sans annoncer ces couples compatibles du besoin.
- [ ] `PairThumbnail` doit propager le capteur de contexte au rendu 2D/3D et au cache des vignettes
      (M11S ne doit pas être dessiné en M8 à côté d'un MK11-M5).
- [ ] Aucun tarif connu : le choix économique reste indicatif et remplaçable, jamais « le moins cher ».

## Recette finale
- [ ] tests / tsgo / build / quatre scans / inventaire i18n.
- [ ] Navigateur 1440×900 et 390×844, parcours frigo et cas illustratif.

## Revue e5bd3955 — état après ce tour
- [x] 1. M02 hors des recommandations de tout autre capteur ; défaut bloc ferrite pour MK15/16/17/MK06-4 ; registre intact.
- [x] 2. Négations de montage (« No PCB mounting. Screw mounting only. », « sans PCB »).
- [x] 3. Proximité lue sur la séparation RÉELLE des enveloppes (`separationMm`), décalage latéral et modèle importé compris ; illustration autorisée hors gabarit/ferreux/température/démonstration, jamais de qualification (couverture, seuils, verdict inchangés) ; ouvert au-delà de 20 mm.
- [~] 4. Résumé « Critères utilisés » : la fixation nommée est lue dans TOUTES les réponses écrites (cause du résumé vide). RESTE : quota WebGL — 6 vignettes visibles nécessitent instantanés/cache ou rendu partagé.
- [ ] 5. Matériaux et plages du guide d'activation à afficher dans l'atelier ; propagation du capteur de contexte à contrôler pour M11S / MK11-M5.

## Ajustements atelier et cartes — 2026-09-25
- [x] Ralentir le cycle atelier à environ 6 s, corriger la chronologie et retirer le badge flottant.
- [x] Séparer clairement capteur et aimant dans toutes les cartes, avec faits essentiels et limites documentaires.
- [x] Vérifier tests, types, compilation et rendu responsive public ; l'accès authentifié reste couvert par la recette automatisée.

## Audit complet des traductions — 1 octobre 2026
- [x] Traduire les champs, erreurs et statuts NDA au rendu, y compris dans une fenêtre déjà ouverte.
- [x] Corriger les libellés dynamiques et erreurs visibles des parcours client et Standex.
- [x] Renforcer l'inventaire et les tests sur les tableaux de libellés, interpolations et huit langues.
- [x] Vérifier tests, types, compilation, inventaire et aperçu desktop/mobile sans publication.
- [x] Verrouiller les huit libellés NDA par leurs traductions exactes, sans repli sur les modèles génériques.
- [ ] Vérifier derrière la connexion le changement de langue et les erreurs du dialogue NDA, sans envoi — bloqué : aucune session autorisée ni identifiants de recette sécurisés ne sont injectés dans l'aperçu.
- [x] Garder les erreurs ouvertes réactives à la langue et préserver sans traduction les retours humains.
- [x] Ajouter les deux libellés exacts des sélecteurs rendez-vous et retour publié.

## Entrée et questionnaire — 2 octobre 2026
- [x] Remplacer l'accroche d'entrée par la promesse validée, sans écran intermédiaire.
- [x] Ajouter le repère stable Q1–Q6 et le bouton final « Voir les capteurs proposés ».
- [x] Compter uniquement les questions franchies dans la barre de progression.
- [x] Traduire les nouvelles chaînes dans les huit langues et couvrir Q1, Q5 et Q6.
- [x] Finaliser la typographie, l’apostrophe validée et la promesse « capteurs » avant révélation.
- [x] Monter réellement Q1, Q5 et Q6 en test isolé à 390/320 px, avec retour, inconnue et bascule FR/EN/JA.

## Refonte de présentation du questionnaire — 2 octobre 2026
- [x] Recomposer les six questions selon la maquette approuvée, sans modifier leurs données ni leurs actions.
- [x] Remplacer la navigation des exemples par une pagination numérique accessible et documenter la composition.
- [x] Prouver la parité des sorties avec la base 0e4e373e86eac992da0a887de53764e92ed367e2.
- [x] Exécuter la recette complète, les types, la compilation, l’inventaire i18n et les contrôles de charte.

## Réorganisation de l’atelier — 3 octobre 2026
- [x] Limiter les positions principales à D1 « Face à face » et D3 « Dans l’alignement », sans convertir les poses F1 enregistrées.
- [x] Garder position, activation et lecture visibles, puis répartir les autres commandes entre produit, aimant et positionnement.
- [x] Retirer les tableaux de distances publiées de l’atelier sans modifier les données ni les calculs.
- [x] Terminer la suite complète et la compilation ; contrôle visuel authentifié non réalisable sans session autorisée.

## Nettoyage ciblé pré-démo — 12 octobre 2026
- [x] Présentation compacte des connecteurs aux deux points d’entrée, données conservées.
- [x] Erreurs de contexte projet limitées aux champs autorisés et traduites.
- [x] Tests complets, inventaire, contrôle automatique et rapport ; aucun déploiement.

## Restauration ciblée des aperçus connecteurs — 12 octobre 2026
- [x] Quatre aperçus visibles avant sélection, contrôles séparés et sources repliées.
- [x] Régressions, suite complète, inventaire et rapport sans publication ni connexion utilisateur.

## Remédiation round 2 (2026-10-12)
- [x] D01–D06 corrigés, P2 faible risque traités ; rapport docs/QA_ROUND2_P1_REMEDIATION_2026-10-12.md
- [ ] Recette navigateur authentifiée (WebGL, soumission) — attend le propriétaire

## Lot 1 retours manuels (2026-10-13)
- [x] A01 A02 A05 B01–B06 C03, puces 8 langues — voir docs/QA_MANUAL_FEEDBACK_REMEDIATION_LOT1_2026-10-13.md
- [ ] 3D MK20 (lot précision séparé)

## Découverte Reed sur l'accueil — 13 octobre 2026
- [x] Modèle pédagogique partagé, hystérésis et découverte 2D accessible, sans modification de l'atelier métier.
- [x] Huit langues, tests moteur/composant et vérification navigateur isolée 320/390 px et desktop ; accueil connecté non vérifié, session indisponible.
- [x] Suite complète, inventaire, contrôles de charte et rapport des limites sans publication.

## Revue indépendante découverte Reed
- [x] Réponse axiale dipolaire et contours communs, progression par orientation.
- [x] Cibles intactes à 320 px, compacité, 1 724 tests verts et rapport sans publication ; recette intégrée réservée au propriétaire connecté.

## Finition visuelle Reed — 13 octobre 2026
- [x] Libellé compact traduit « À 90° », nom accessible explicite et scène pleine largeur ; moteur inchangé.
- [x] Quatre bords/focus/N/S vérifiés à 320/378 px et desktop ; 1 724 tests verts, inventaire zéro, compilation plateforme OK ; rapport QA_REED_VISUAL_FINISH_2026-10-13.md. Recette iframe finale laissée au propriétaire.

- [x] Atelier 3D : centrer dans un trou (rayon/plan), aligner l aimant avec le capteur, position précise étape 4 (26/10/2026)
- [x] Recette 288835bc : alignement à l'instant affiché conservé (Aligner, Annuler, Rétablir) ; textes « Position précise » cohérents (26/10/2026)
- [x] Échap annule le centrage sans fermer le panneau ; bloc Aligner placé avant écart/rotation/retournement (26/10/2026)
- [x] Laboratoire de détection reed interne staff (tableau pilote, six coupes, rapport) — revue propriétaire avant toute intégration atelier

## Laboratoire de détection — lot 2 : expérience de calibration (27 octobre 2026)
- [x] Module pur paramétrable (L, repère axial D3/D5 explicite, θ = k·AT sourcé MK04) + script `detection-lab-pass2-report.ts` régénérant `docs/detection-lab-pass2/` ; profil 1.1 et client préservés.
- [x] Quatre variantes (L16/d7, L16/d4, L8/d7, L ajusté D1/d7), tableaux A..G avec disponibilité réelle, D1 B/D isolé.
- [x] Score primaire sur les 23 bornes publiées C/E D3/D4/D5, secondaire sans C-N45-D3to 17,7 (anomalie suspectée), critère explicite médiane ≤10 % et ≤3/23 >20 % et zéro indisponible.
- [x] Coupes perpendiculaires raffinées (revue 41669806 : bande fine toute hauteur, maillage continu, capsule testée dessinée, nominal/hypothèses distingués) (0,25 mm dans |x|≤5, y≤5 ; 1 mm ailleurs, sans recouvrement), CSV+SVG, nœuds communs et largeur de zone centrale ; trois états de lecture distingués.
- [x] Vérification collision N45 reproduite ; enveloppe capsule surdimensionnée axialement signalée distinctement.
- [x] Tests (repère indépendant de L, θ/AT constant, ajustement sans contrôles, grille fine disjointe) + suite/types/build/scans ; rapport FR avec sources pattes Standex.

## Laboratoire de détection — passe 3 : repère recalé et correction scalaire D4 (27 octobre 2026, base 5e06d4c)
- [x] Module pur `pass3.ts` : repère axial ajusté sur l'unique ancre C-SmCo-D3-up, retrait scalaire D4 sur l'unique ancre C-SmCo-D4-up, diagnostic B′ strict, critère révisé par borne max(1 mm, 15 %) ≥ 90 % + biais ≤ 1 mm.
- [x] Script `detection-lab-pass3-report.ts` → `docs/detection-lab-pass3/` (FR, 6 CSV de 112 lignes, JSON, SVG écarts signés) ; profil 1.1 et lot 2 intacts.
- [x] Reproduction de l'audit : L16 axial 40/46 échec, B′ 37/46 échec, correction 43/45 atteint (médiane 0,423 mm, max 3,228) ; Lfit idem (0,419 / 3,272) ; A/F 20/30 + 1 indisponible ; deux échecs N45 D3 conservés.
- [x] Tests (ancres exclues 46 puis 45, invariance physique/repère, B′ ≥ B et égalité D1, isolation des ancres, non-régression lot 1/2, aucune fuite vers le moteur) + suite complète/types/build/scans ; aucune publication.
