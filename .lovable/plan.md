# Refonte de l'Atelier 3D — « Est-ce que la détection va se faire dans mon montage ? »

L'atelier cesse d'être un catalogue-jeu et devient une étape de sélection en
4 temps, avec un verdict honnête et traçable. Rien n'est retiré : catalogue,
pédagogie, import GLB, machine, gel de conception et câble restent, mais
deviennent secondaires ou sont réemployés dans le parcours.

## Le parcours en 4 étapes

1. **Couple & sensibilité** — choisir capteur + aimant + classe à partir des
   contraintes saisies (entrefer souhaité fermé/ouvert, encombrement,
   environnement), ou démarrer en espace vide. Comparaison des sensibilités
   côte à côte avec les 8 références publiées MK03/M02 (D1 : B 15/17.5,
   C 13/16.5, D 11/14.5, E 10/13.5 ; D3 : B 9.3/11.4, C 7.4/9.9, D 5.7/8.5,
   E 4.5/8). Aucune donnée A. Le tableau montre que B porte le plus loin, D/E
   le moins. Si aucune combinaison documentée ne satisfait les contraintes,
   l'écran le dit explicitement au lieu de proposer un compromis muet.
2. **Positionner** — placer le couple dans le montage, ou importer son modèle
   (GLB, chemin existant conservé). Guidage : fantôme de l'aimant à la pose
   suggérée, axe et plan de référence, cote d'entrefer, décalages et
   orientation lisibles ; *Prévisualiser* → *Appliquer* → *Annuler*. Le capteur
   garde son ancrage, seul l'aimant se déplace vers la suggestion. Un mode
   « déplacer le couple » translate/pivote l'ensemble sans changer la pose
   relative, y compris sur modèle personnalisé (conversion local ↔ monde).
   Collision et encombrement sont détectés : une suggestion qui traverse la
   matière est refusée et expliquée, jamais appliquée.
3. **Simuler** — aller-retour avec vraie hystérésis (enclenchement ≠
   relâchement), état initial « inconnu » quand il l'est, chronologie lisible
   et curseur déterministe (même t → même état). L'entrefer est mesuré comme
   distance de surfaces, jamais distance de centres. Les segments hors domaine
   sont marqués « non couverts » : aucune détection n'y est affirmée, et le
   capteur ne reste pas vert par héritage en quittant le domaine.
4. **Câble** — réutilise le configurateur de câblage et la sauvegarde
   existants, alimentés par le couple et la pose retenus.

## Le verdict, en trois axes séparés

Jamais un seul feu vert. L'écran affiche toujours :

- **Couverture de la pose** : la pose simulée reste-t-elle dans le gabarit
  documenté (approche, orientation, plan) ? Couverte / partielle / hors
  gabarit, avec les segments concernés.
- **Source et niveau de preuve** : « typique publié » (8 références MK03/M02),
  « schématique » (gabarit géométrique explicite), « non caractérisé ».
- **Verdict** : détection prévue / non prévue / indéterminée.

Hors domaine ou source insuffisante : contact **inconnu** et message principal
exact « Le comportement du capteur nécessite des tests en environnement réel »,
avec la raison et une action utile (revenir au gabarit, documenter la mesure
manquante). L'explication se lit sans quitter son montage.

Ce qui reste interdit et le reste : aucune calibration physique inventée,
aucune tolérance angulaire, aucun centre magnétique, aucune température ni
enveloppe volumique fabriquée, aucune coupe généralisée en sphère. Un résultat
typique peut montrer un franchissement ON/OFF dans son modèle de référence,
il n'est jamais annoncé « fiable » ou « validé terrain ». Le gabarit
géométrique est étiqueté schématique tant que les datums ne sont pas
caractérisés — ce n'est pas une validation du montage importé.

## Détails techniques

**Nouveau module `src/lib/standex/mounting/`** (métier pur, testé) :

- `contract.ts` — `GuidedMounting` versionné (`version: 1`) : profil de montage
  (id, source, révision), couple capteur/aimant/classe, pose relative
  (position + rotation en repère capteur) et attaches (parent, repère local),
  course, environnement, besoins, câble, plus `computed` (couverture, preuve,
  verdict, limites) et une empreinte `inputsHash` des entrées.
- `profiles.ts` — profils de gabarit dérivés des approches documentées
  (MK03/M02 D1 et D3, identifiant appairé `4003004003` et alias contrôlés),
  chacun marqué `evidence: "published_typical"` + `geometry: "schematic"`.
  L'interface accepte de futurs profils réellement caractérisés sans changement
  de code appelant.
- `suggest.ts` — pose suggérée, prévisualisation, application, annulation,
  détection de collision/encombrement (réutilise `bodiesOverlap`), et
  transformation commune du couple (invariance de la pose relative prouvée par
  test).
- `evaluate.ts` — couverture par pose et par segment, niveau de preuve,
  verdict, raisons machine + libellés `t()`.
- `simulate.ts` — reprise de la simulation existante avec hystérésis réelle,
  entrefer de surfaces, échantillonnage déterministe et marquage des segments
  non couverts.

**Invalidation** : tout changement de capteur, aimant, sensibilité, pose,
course, environnement ou profil recalcule `computed`. Un `computed` importé
dont l'empreinte ne correspond pas est jeté et recalculé — un verdict importé
n'est jamais cru.

**Persistance** : réutilise le JSON dossier existant, champ additif
`dossier.mounting` (absent = ancien dossier, lu sans erreur). Aucune migration
SQL appliquée. Si une colonne dédiée s'avère nécessaire, la migration est
écrite et testée en brouillon sous `supabase/schema/` et je signale exactement
ce qu'il faut activer — sans y toucher.

**Propagation** : résumé fidèle (couple, pose, couverture, preuve, verdict,
limites, câble) dans l'enregistrement, les exports et la revue interne.

**UI** : refonte de `workshop.tsx` en coquille à 4 étapes réutilisant les
scènes, le catalogue et Studio V2 comme panneaux secondaires ; textes, CTA et
parcours amont/aval dans `design-space.tsx` adaptés. Jetons uniquement,
`t()` + sept traductions pour chaque libellé neuf.

**Tests ajoutés** (`tests/mounting-*.test.ts`) : source manquante ; hors
plan/orientation ; rotation et translation communes ; transformations parent
sur pièce mobile ; hystérésis aller/retour + scrub ; invariants
prévisualiser/appliquer/annuler ; absence de faux vert sur import personnalisé ;
verdict périmé et relecture d'un dossier ancien ; sensibilités distinctes ;
câble. Puis `bun test tests/`, `bunx tsgo --noEmit`, `bun run build` et les
quatre scans AGENTS.

## Hors périmètre

Backend Supabase inchangé, pas de Lovable Cloud, aucun email, aucune
publication, aucune donnée client réelle écrite.
