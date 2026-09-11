# Feuille de route — refonte du montage guidé

Revue indépendante du commit 9ad1e2b. Aucun plan supplémentaire demandé.

- [ ] 1. `profiles.ts` : supprimer l'alias 4003004003 → M02, identité exacte, ouvrir aux autres aimants du registre, aucune table up/to non qualifiée.
- [ ] 2. `simulate.ts` : supprimer les tolérances 0,5 mm / 0,5° ; seul un epsilon numérique d'égalité exacte, documenté comme non qualifié.
- [ ] 3. `suggest.ts` / `bridge.ts` : ne plus réécrire course, besoin, mouvement, environnement ni la précision ; exploration de référence en action séparée.
- [ ] 4. `GuidedVerdict.onFixCoverage` : ne modifier que la géométrie de la pose, jamais les contraintes déclarées.
- [ ] 5. Pont ↔ `MachineAssembly` : vrais repères (componentPose, inversion, composition), pose réellement appliquée, tests de roundtrip sur un montage réel.
- [ ] 6. Prévisualisation : état séparé, fantôme + axe + cote dans les deux scènes, appliquer/annuler explicites, proposition invalidée si les entrées changent.
- [ ] 7. Unifier scène, indicateur, chronologie et résumé sur le moteur de couverture ; couvrir education, slide/pivot, aimantation, polarité, état initial, angle propre.
- [ ] 8. Parcours réel couple + contraintes → montage guidé → simuler → câble, pour espace vide ET machine ; catalogue et pédagogie secondaires.
- [ ] 9. Propagation : recalcul dans `toClientDto`, cohérence au parsing, besoin et câble réels, résultat/limites/sources dans revue et exports.
- [ ] 10. Libellés : traduire tous les codes réellement émis, titres qualifiés « modèle de référence », couverture stricte, fenêtre vide non satisfaite par défaut.
- [ ] Vérifications : `bun test tests/`, types, build, scans AGENTS, inventaire i18n, QA navigateur. Aucune migration, aucune publication.
