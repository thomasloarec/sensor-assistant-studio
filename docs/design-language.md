# Langage de design Standex DETECT

Référence unique du produit pour toute évolution visuelle. Ce document décrit la
**forme** : couleurs, typographie, formes, élévations, mouvement, règles de
composants. Il ne décrit aucun comportement métier.

## 1. Principes

1. **La lumière remplace les bordures.** Une séparation grise de 1 px est un
   dernier recours ; on hiérarchise par élévation (`--e-1` → `--e-4`), par
   surface (`--surface`, `--surface-sunken`, `--surface-tint`) et par espace.
2. **Sobriété technique, pas austérité.** Bleu Detect pour la structure et
   l'action, gris Electronics pour l'encre, couleur d'état seulement quand elle
   informe.
3. **Lisibilité non négociable.** Corps 18 px, champs et libellés ≥ 16 px,
   cibles tactiles ≥ 44 px, focus visible partout, contraste AA minimum.
4. **Le mouvement explique, il ne décore pas.** Toute animation est annulée
   sous `prefers-reduced-motion: reduce`.
5. **Aucune dépendance ajoutée.** Tout le mouvement est en CSS natif.

## 2. Couleurs

Valeurs de charte, jamais altérées :

| Jeton                        | Valeur                        | Usage                        |
| ---------------------------- | ----------------------------- | ---------------------------- |
| `--standex-blue`             | `oklch(0.3665 0.0662 254.28)` | actions, titres, structure   |
| `--standex-blue-75/50/25/10` | déclinaisons OKLCH            | états, teintes, pilules      |
| `--standex-gray`             | `oklch(0.4539 0.0061 228.93)` | encre courante               |
| `--standex-gray-75/50/25/10` | déclinaisons OKLCH            | textes secondaires, fonds    |
| `--standex-abyss`            | `oklch(0.2261 0.0353 251.2)`  | fond des sections immersives |
| `--standex-deep`             | `oklch(0.2717 0.0444 252.09)` | popovers immersifs           |

Surfaces et encre : `--background`, `--surface`, `--surface-sunken`,
`--surface-tint`, `--foreground`, `--heading`, `--ink`, `--muted-foreground`.

États : `--success` / `--success-soft`, `--warning` / `--warning-soft`,
`--destructive` / `--destructive-soft`, `--signal` (bleu-cyan de détection) et
`--signal-glow` pour les halos de champ magnétique.

Les deux valeurs de texte les plus sensibles sont figées à
`--muted-foreground: oklch(0.54 0.0102 252)` et
`--warning: oklch(0.55 0.098 72)` afin de rester au-dessus de 4,5:1 sur la toile
claire. Les valeurs locales de `.immersive` ne sont pas remplacées.

Traits : `--hairline` (0.10) et `--hairline-strong` (0.18) — teintés bleu, jamais
gris neutre.

### Contexte immersif

`.immersive` est une **classe de section**, pas un thème global. Elle bascule les
mêmes jetons vers une palette sombre (fond abyss, surfaces translucides,
primaire blanc sur bleu). `.dark` reste présent pour shadcn mais n'est pas
utilisé par l'espace client.

## 3. Typographie

Familles : **Source Sans 3** variable (texte), **Lato** (repli historique),
**IBM Plex Mono** (valeurs, mesures).

Échelle, en jetons composés `font` :

| Jeton                          | Rôle                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `--t-display-xl` / `-l` / `-m` | titres d'accueil, graisse 300 (Light), fluides via `clamp()` |
| `--t-title-l` / `-m` / `-s`    | titres de section, cartes, panneaux (600)                    |
| `--t-body-l`                   | corps par défaut (18 px)                                     |
| `--t-body`                     | corps dense (16 px)                                          |
| `--t-caption`                  | légendes (14 px)                                             |
| `--t-label`                    | sur-titres capitales espacées (12 px)                        |

Interlettrage : `--tracking-display` (-0.022em), `--tracking-title` (-0.011em),
`--tracking-body` (0), `--tracking-label` (0.08em).

Utilitaires prêts : `.t-display-xl`, `.t-display-l`, `.t-display-m`,
`.t-title-l/m/s`, `.t-body-l`, `.t-body`, `.t-caption`, `.t-label`, `.t-metric`
(monospace tabulaire pour les mesures).

Les chiffres sont tabulaires (`font-variant-numeric: tabular-nums`) pour que les
tableaux de valeurs ne dansent pas.

## 4. Forme

`--r-xs` 0.5rem · `--r-sm` 0.75rem · `--r-md` 1rem (= `--radius`) ·
`--r-lg` 1.25rem · `--r-xl` 1.75rem · `--r-2xl` 2rem · `--r-pill` 999px.

Règle : contrôles = `--r-sm`, cartes et panneaux = `--r-lg`, surfaces
héroïques = `--r-xl`/`--r-2xl`, grandes actions d'appel = `--r-pill`.

Géométrie de marque : la barre Standex inclinée à `-15deg`
(`--standex-slant`, `--standex-skew`), disponible en `.standex-bar` et
`.standex-rule`.

## 5. Élévation

`--e-0` néant · `--e-1` posé (carte au repos) · `--e-2` détaché (bouton primaire,
carte survolée) · `--e-3` flottant (menus, popovers, contenu de select) ·
`--e-4` modal (dialogues, feuilles). `--e-inset` ajoute un liseré de lumière
haut. Chaque niveau inclut un anneau `0 0 0 1px` très faible qui remplace la
bordure.

Matières : `--material-thin`, `--material-regular` et `--material-blur`
(`saturate(180%) blur(24px)`) pour les barres et surfaces translucides.

## 6. Mouvement

Courbes : `--ease-out` (sortie naturelle), `--ease-in-out`, `--ease-spring`
(apparition avec léger rebond), `--ease-glide` (superpositions).

Durées : `--d-instant` 90ms (pression), `--d-fast` 160ms (survol, champs),
`--d-base` 260ms (panneaux, onglets), `--d-slow` 420ms (apparition de contenu),
`--d-page` 620ms (changement d'étape), `--d-hero` 900ms, `--stagger` 55ms.

Animations : `standex-rise`, `standex-fade`, `standex-scale-in`,
`standex-sweep`, `standex-drift`, `standex-pulse`.
Utilitaires : `.anim-rise`, `.anim-fade`, `.anim-scale-in`, `.anim-stagger`
(cascade jusqu'à 6 enfants puis plateau), `.step-enter`, `.press`.
La classe `.reveal` est pilotée par `useReveal` et devient visible immédiatement
si `IntersectionObserver` n'existe pas ou si le mouvement réduit est demandé.

`@media (prefers-reduced-motion: reduce)` réduit toutes les durées à 1 ms et
neutralise les translations de survol et de pression. Aucune exception.

## 7. Règles de composants

- **Bouton** — coins `--r-sm`, hauteur ≥ 44 px sur toutes les tailles, pression
  `scale(0.975)`. `default` : bleu, `--e-2`, léger dégradé de lumière en haut,
  survol `--primary-hover` + `--e-3` + `translateY(-1px)`. `outline` n'est plus
  une bordure grise mais un liseré teinté en `inset box-shadow`. `lg` et `pill`
  sont des pilules.
- **Carte** — pas de bordure : `--surface`, `--r-lg`, `--e-1`. Titre en
  `t-title-m`, description en `t-caption`.
- **Champs (input, textarea, select trigger)** — remplis, pas encadrés :
  `--surface-sunken`, sans bordure, `--r-sm`, hauteur 2.75rem, padding
  0.75rem 1rem. Focus : fond `--surface` + anneau `0 0 0 2px var(--ring)`, sans
  outline en double. Textarea `resize-y`, min 6rem.
- **Onglets** — contrôle segmenté : piste `--surface-sunken`, `--r-sm`,
  padding 4 px ; onglet actif en `--surface` + `--e-1`, sans bordure ni
  soulignement.
- **Badges** — pilules teintées sans bordure ; variantes `default`, `secondary`,
  `outline`, `destructive`, `success`, `warning`.
- **Superpositions** (dialogue, feuille, popover, menu, infobulle) — coins
  `--r-lg` (infobulle `--r-xs`), `--e-3`/`--e-4`, pas de bordure, voile
  `oklch(0.2261 0.0353 251.2 / 0.32)` avec flou 3 px, entrée en `--ease-glide`
  sur 260 ms.
- **Curseur (slider)** — piste 6 px, poignée blanche 24 px avec `--e-2` qui
  grossit à 1.08 au survol et à la saisie.
- **Progression** — 6 px, coins pleins, remplissage `--primary`.

### Classes de composition

- `.surface`, `.surface-raised`, `.surface-interactive` : niveaux de matière
  sans bordure structurelle ; `.material` ajoute transparence et flou aux
  barres collantes.
- `.panel-block` et `.panel-block-lg` : groupes métier et grands ensembles,
  avec espace, rayon et élévation homogènes.
- `.notice-info`, `.notice-warning`, `.notice-danger`, `.notice-success` : états
  sémantiques lisibles ; la couleur ne porte jamais seule l'information.
- `.code-block` : JSON, traces et résumés techniques en monospace, avec
  défilement horizontal plutôt que rupture de données.
- `.t-display-*`, `.t-title-*`, `.t-body-*`, `.t-caption`, `.t-label` et
  `.t-metric` : seule échelle typographique applicative.
- `.anim-*`, `.step-enter`, `.press` et `.reveal` : vocabulaire de mouvement
  natif, intégralement neutralisé en mouvement réduit.
- `.immersive` : contexte sombre borné aux démonstrations et à l'atelier ; il ne
  constitue pas un thème global.

## 8. Trois moments signature

1. **Comprendre** — le héros et l'aimant pédagogique associent champ, halo,
   déplacement direct et retour d'état dans une seule carte immersive.
2. **Concevoir** — l'espace projet utilise un rail segmenté, une question calme
   à la fois et des panneaux contextuels qui préservent toujours le contexte.
3. **Vérifier** — l'atelier magnétique passe en matière immersive, tandis que le
   banc et la console R&D restent denses, lumineux et strictement hérités du
   même socle.

## 9. Garde-fous conservés

Le bloc `[data-readable]` de `src/styles.css` reste la protection de lisibilité
des espaces client et internes : tailles minimales réelles, cibles 44 px, focus
renforcé, tableaux lisibles et défilables. Il n'impose plus de rayon ni de
couleur de composant — c'est le rôle du système ci-dessus.

Les tables applicatives sont placées dans un conteneur défilable. Les contrôles
ont une cible minimale de 44 px, un focus visible, et le texte d'interface est
maintenu à 14 px minimum au rendu, y compris dans l'atelier dense.

## 10. Ce qui reste ouvert

- Le logo Standex officiel n'est pas encore disponible en SVG. Son emplacement
  réservé est le bloc de marque des en-têtes dans `src/routes/index.tsx`,
  `src/routes/internal.tsx` et l'en-tête de l'atelier ; ne pas redessiner ni
  vectoriser un logo approximatif.
- La console `/standex` ne peut être validée de bout en bout sans session staff
  et rôle attribué par le backend. Son écran d'authentification et son état
  protégé restent néanmoins couverts visuellement.
- Les couleurs des matériaux Three.js et du catalogue capteur restent des
  données de rendu technique. Elles ne doivent pas être remplacées par des
  jetons CSS au risque de modifier la lecture des modèles.
- Les primitives shadcn non montées dans les parcours actuels conservent leur
  structure amont. Elles seront migrées lorsqu'un écran produit les adoptera,
  plutôt que modifiées sans recette réelle.
