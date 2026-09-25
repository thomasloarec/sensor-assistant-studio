# Feuille de route — lot des 7 correctifs (base 12be3e3d)

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
- [ ] Ralentir le cycle atelier à environ 6 s, corriger la chronologie et retirer le badge flottant.
- [ ] Séparer clairement capteur et aimant dans toutes les cartes, avec faits essentiels et limites documentaires.
- [ ] Vérifier tests, types, compilation et rendu desktop/mobile, puis fournir le commit.
