# Feuille de route — refonte du montage guidé

Revue indépendante des commits 9ad1e2b puis 5dd93f6. État réel au dernier passage.

- [x] 1. `profiles.ts` : alias 4003004003 → M02 supprimé, identité exacte, tables up/to non qualifiées exclues.
- [x] 2. `simulate.ts` : tolérances physiques arbitraires supprimées ; seul un epsilon numérique documenté subsiste.
- [x] 3. `suggest.ts` / `bridge.ts` : la suggestion ne réécrit plus course, besoin, mouvement, environnement ni précision.
- [x] 4. `GuidedVerdict.onFixCoverage` : ne touche que la géométrie de la pose, jamais les contraintes déclarées.
- [x] 5. Pont ↔ `MachineAssembly` : repères réels, inversion/composition, pose appliquée au capteur ET à l'aimant,
      entrefer lu aux extrémités réelles du cycle (u = 0 et u = 1). Tests de roundtrip à u = 0,37, pièces fixes et
      mobiles, translations et rotations, course inchangée.
- [x] 6. Prévisualisation : état séparé, fantôme dans les deux scènes, appliquer/annuler explicites, invalidation.
- [x] 7. Scène, panneau et chronologie dérivent du même moteur ; hors couverture = inconnu.
      Rotation GLOBALE du couple sans effet sur la couverture, orientation PROPRE du capteur hors gabarit : testées.
- [~] 8. Parcours réel pour l'espace vide ET le modèle importé : les quatre étapes, la suggestion et le verdict sont
      les mêmes dans les deux cas, la longueur de câble est réellement modifiable et enregistrée, les entrées
      principales posent la question « Vérifier la détection dans mon montage ».
      RESTE : le catalogue et Studio V2 restent atteignables au même niveau qu'avant, ils n'ont pas encore été
      regroupés dans une section « outils avancés » unique.
- [x] 9. Propagation : le montage guidé est reconstruit sur la configuration, le besoin et le câble COURANTS à
      l'enregistrement, à l'import et dans le DTO client ; le rapport anglais porte verdict, couverture, limites,
      besoin et câble. Aucun verdict importé n'est cru.
- [x] 10. Libellés : codes traduits, couverture stricte, fenêtres exactes.
- [x] Vérifications : 546 tests / 59 971 assertions, types, build, scans AGENTS, inventaire i18n. Aucune migration,
      aucune donnée réelle, aucune publication.
- [ ] QA navigateur authentifiée : impossible dans ce bac à sable (aucune session disponible).
