# Langage de design Standex DETECT

Référence contraignante. Les règles opérationnelles condensées sont dans
`AGENTS.md` ; ce document en est la version complète et fait autorité en cas
d'écart.

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
`--warning: oklch(0.53 0.098 72)` afin de rester au-dessus de 4,5:1 sur la toile
claire. Les valeurs locales de `.immersive` ne sont pas remplacées.

| Couleur d'état sur sa teinte claire | Contraste |
| ----------------------------------- | --------- |
| Succès sur `--success-soft`         | 5,07 : 1  |
| Danger sur `--destructive-soft`     | 5,23 : 1  |
| Avertissement sur `--warning-soft`  | 4,81 : 1  |

Sur la toile claire `--background`, `--warning` atteint 5,02 : 1 ; sur blanc pur,
il atteint 5,38 : 1.

Traits : `--hairline` (0.10) et `--hairline-strong` (0.18) — teintés bleu, jamais
gris neutre.

### Alias de l'atelier 3D

L'atelier magnétique et le sélecteur de langue ont leur propre feuille CSS et ne
peuvent pas utiliser directement les classes Tailwind. Trois alias, définis en
tête de `src/components/standex/workshop/workshop.css`, y relaient les jetons du
socle. Ils ne portent aucune valeur littérale : ce sont des renvois.

| Alias            | Renvoie vers            | Usage                                        |
| ---------------- | ----------------------- | -------------------------------------------- |
| `--mw-surface`   | `--surface`             | panneaux et cartes de l'atelier               |
| `--mw-field`     | `--popover`             | champs, listes déroulantes, options natives   |
| `--mw-on-accent` | `--primary-foreground`  | texte posé sur une action pleine              |

En contexte `.immersive`, ces trois alias suivent automatiquement les jetons
sombres : aucun `background: white` ni `color: white` ne subsiste dans l'atelier.

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
| `--t-label`                    | sur-titres capitales espacées (14 px)                        |

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

## 10. Logo

Fichiers officiels dans `public/brand/`, référencés uniquement par
`src/components/standex/brand-logo.tsx` :

| Fichier | Usage |
| --- | --- |
| `logo-lockup.png` (600×141) | logo primaire sur fond clair |
| `logo-lockup-reversed.png` | logo primaire sur fond sombre |
| `logo-mark.png` (120×117) | bloc « S » seul, fond clair (chrome dense) |
| `logo-mark-reversed.png` | bloc « S » seul, fond sombre |
| `favicon-32.png` | favicon navigateur |
| `apple-touch-icon.png` | écran d'accueil iOS (180×180) |
| `icon-192.png`, `icon-512.png` | `site.webmanifest` |

- **Taille minimale** : le lockup ne descend jamais sous 185 px de large, soit
  44 px de haut (ratio 600/141 → 187 px). Le composant force ce plancher.
  Lorsque la place manque (en-tête sous 640 px), on bascule sur le bloc « S ».
- **Zone de protection** : `0,51 × H` à gauche et à droite, `0,34 × H` en haut
  et en bas — demi-largeur du bloc « S » sur les côtés, hauteur de son plus
  petit segment au-dessus et au-dessous.
- **Clair / inversé** : version claire sur fond clair, version inversée sur
  fond sombre ou photographique.
- **Interdits** : recolorer, remodeler ou étirer, ajouter une tagline, poser le
  logo sur un fond chargé.
- Les fichiers livrés sont des **PNG** alors que la charte recommande le SVG
  pour le web. Le jour où les SVG officiels arrivent, seul `brand-logo.tsx`
  change.

## 10 bis. Socle de l'espace de travail interne

Classes introduites pour `/standex` et réutilisables partout ailleurs. Toutes
leurs valeurs viennent des jetons.

- `.segmented`, `.segmented-item`, `.segmented-thumb` — navigation en contrôle
  segmenté. Le pouce glisse via `--seg` (index actif) et `--seg-count`. Sous
  640 px, la barre défile horizontalement et l'onglet actif est marqué par sa
  surface, sans pouce animé. Chaque onglet fait au moins 44 px de haut.
- `.skeleton` — attente : une forme qui annonce le contenu, balayée par
  `standex-sweep`. Le mot « Chargement… » reste présent pour les lecteurs
  d'écran, jamais seul à l'écran.
- `.toast-region`, `.toast`, `.toast-leaving` — pastilles flottantes en bas à
  droite, pleine largeur sur mobile. **Règle d'emploi : le succès d'une écriture
  part en pastille ; une erreur ou un refus reste en place, à côté de l'action
  refusée.** Le chronomètre se suspend au survol et au focus.
- `.anim-nudge` — deux oscillations courtes pour attirer l'œil sur un bloc
  d'erreur déjà visible. Jamais utilisé pour signaler un succès.
- `.field-row`, `.field`, `.field-actions` — rangées de formulaire alignées :
  libellés, champs et textes d'aide se posent sur les mêmes lignes grâce à
  `grid-template-rows: subgrid`, avec repli en colonne quand `subgrid` manque.
  `.field-actions` colle le bouton à la ligne des champs.
- `.num` — valeurs numériques alignées à droite en chiffres tabulaires.

### Socle du tableau Projets

- `.workbar` — barre de travail compacte, collante sous l'en-tête grâce à
  `--standex-header-h`, publiée par l'en-tête de `/standex`. Matière
  translucide, une seule ligne : recherche, tiroir de filtres, tri, affichage.
- `.workbar-progress` — filet de rechargement. Une actualisation ne vide jamais
  un tableau déjà lisible : elle pose ce filet et `aria-busy` sur le résultat.
- `.chip` et `.filter-count` — un filtre actif est une pilule teintée, retirable
  là où elle se lit ; le compteur du tiroir dit combien de filtres agissent.
- `.stage-pill` — étape du projet, teintée par `data-tone`
  (`success`, `warning`, `muted`, défaut bleu). Le libellé anglais reste
  l'information ; la couleur n'est qu'un repère de balayage.
- `.stage-gauge` — quatre barres inclinées de la marque, décoratives
  (`aria-hidden`), qui situent l'étape dans le cycle.
- `.progress-mini` — avancement des tâches ; la valeur chiffrée reste affichée
  à côté, la barre ne porte jamais seule l'information.
- `.data-table` — lignes-objets : chaque ligne est une carte posée (`--e-1`),
  séparée par l'espace, repérée par un liseré `--row-accent`, sans bordure de
  grille. En-têtes collants en `.t-label`, colonnes de valeurs en `.num`.
- `.pipeline-rail` et `.pipeline-card` — pipeline en rail horizontal défilable
  avec accroche, jamais deux rangées de quatre colonnes.

Les primitives montées par ces écrans sont migrées dans le même commit :
`dropdown-menu.tsx` l'a été pour le menu de compte (rayons, tailles de texte et
cibles de 44 px conformes).

### Socle de la fiche projet et de l'écran Tâches

- `.kpi-row` / `.kpi` — bande de repères : quatre tuiles posées (`--e-1`),
  libellé en `.t-label` majuscule, valeur en `.t-title-s`, chiffres mesurés en
  `.t-metric`. Jamais un tableau de définitions serré. Une valeur absente reste
  écrite « inconnu » en clair, elle n'est jamais remplacée par un zéro.
- `.status-pill` — état d'une tâche : pilule teintée sans bordure, teinte par
  `data-status` (`in_progress` bleu de marque, `blocked` danger, `done` succès,
  le reste posé sur `--surface-sunken`). Le libellé traduit porte seul le sens ;
  montée comme déclencheur de sélection, elle garde ses 44 px de haut.
- `.task-row` — une tâche tient sur une ligne : état, contenu, rôle et personne,
  échéance et retard, bouton d'ouverture. Sous 48 rem, la ligne se replie sur
  trois colonnes sans rien masquer.
- `.task-more` — les champs rarement touchés (échéance, rôle, motif « sans
  objet ») se déplient sous la ligne via `grid-template-rows: 0fr → 1fr` ; ils
  ne s'empilent plus en permanence. Transition neutralisée sous
  `prefers-reduced-motion: reduce`.
- `TaskRow`, `StatusPill` et `sortByUrgency` vivent dans `crm-shared.tsx` : la
  fiche projet et l'écran Tâches partagent une seule définition, pour que les
  deux lectures ne divergent jamais. L'ordre d'urgence est le même des deux
  côtés : retard décroissant, puis bloquées, puis échéance la plus proche, puis
  sans échéance. Aucune tâche n'est masquée, seul l'ordre change.
- Les onglets de la fiche sont un contrôle segmenté (`.segmented`) avec
  `role="tablist"`, `aria-controls` et panneaux `role="tabpanel"`.
- Les formulaires de la fiche utilisent `.field-row` / `.field` /
  `.field-actions` : libellé, champ et aide alignés sur la même grille, actions
  d'enregistrement en fin de bloc, indicateur d'attente dans le bouton.
- `.person-row` — ligne-personne des réglages : initiales, identité, fonction,
  état de compte, puis menu d'actions. Une personne désactivée est atténuée,
  jamais masquée. Un seul formulaire d'une ligne est déplié à la fois.
- `.account-pill` — état de rattachement d'un compte : neutre, en attente ou
  rattaché. Teinte de fond seulement, aucune bordure.
- `.timeline`, `.timeline-entry` — journal des actions groupé par jour, lu du
  plus récent au plus ancien, paginé côté écran par tranches de 20.
- Les capitales viennent du CSS (`text-transform`), jamais de la chaîne. Aucune
  capitale d'insistance au milieu d'une phrase.

### Bandeau de tête unique

- `<AppHeader>` (`src/components/standex/app-header.tsx`) est le seul bandeau du
  produit : espace client, banc interne `/internal`, espace `/standex` et atelier
  magnétique. Même matière, même élévation, même ordre de lecture — retour, logo,
  contexte, centre, puis zone de droite dont le **premier** élément est toujours
  `LanguagePicker`. Un écran n'écrit plus son propre en-tête.
- Il publie sa hauteur réelle dans `--standex-header-h` (via `ResizeObserver`) sur
  `document.documentElement` et sur un éventuel conteneur `[data-readable]` : tout
  élément collant (`.workbar`) se cale dessous sans valeur écrite à la main. Le
  hook `usePublishedHeaderHeight()` sert aux écrans qui gardent une mise en page
  propre, comme l'accueil immersif.
- `tone="reversed"` bascule le verrou de marque en version inversée sur fond
  sombre. Les anciennes règles `.mw-header`, `.mw-brand`, `.mw-back`,
  `.studio-header`, `.studio-brand` et leurs variantes responsives ont été
  supprimées avec l'adoption ; il ne reste aucun chrome de tête dupliqué.

### Atelier magnétique

- L'atelier utilise l'échelle typographique unique par des alias locaux
  `--mw-t-body`, `--mw-t-dense`, `--mw-t-label`, `--mw-t-title`, `--mw-t-title-m`,
  `--mw-t-title-l`, `--mw-t-display`, définis dans `.mw` comme de simples renvois
  vers `--t-*`. Aucune taille écrite à la main.
- Exceptions assumées et documentées :
  - `--mw-flow-duration` (jeton local) — la boucle continue du courant du schéma
    n'a pas d'équivalent parmi les six durées du socle.
  - Les textes des schémas SVG sont dimensionnés en unités utilisateur du
    `viewBox` : ils suivent l'échelle du dessin, pas l'échelle typographique CSS.
  - Les matériaux Three.js, les dégradés de scène et les couleurs de rendu du
    catalogue capteur restent des données techniques, jamais des jetons.
  - Les filets de séparation encore présents dans l'atelier sont des séparateurs
    de scène interne, pas la bordure grise 1 px proscrite par la règle 2.



## 11. Ce qui reste ouvert

- La console `/standex` ne peut être validée de bout en bout sans session staff
  et rôle attribué par le backend. Son écran d'authentification et son état
  protégé restent néanmoins couverts visuellement.
- Les couleurs des matériaux Three.js et du catalogue capteur restent des
  données de rendu technique. Elles ne doivent pas être remplacées par des
  jetons CSS au risque de modifier la lecture des modèles.
- Les primitives shadcn non montées dans les parcours actuels conservent leur
  structure amont. Elles seront migrées lorsqu'un écran produit les adoptera,
  plutôt que modifiées sans recette réelle.
- Primitives shadcn encore en dette de migration, nominativement :
  `accordion.tsx`, `calendar.tsx`, `chart.tsx`, `context-menu.tsx`, `drawer.tsx`, `hover-card.tsx`,
  `menubar.tsx`, `navigation-menu.tsx`, `sidebar.tsx`, `sonner.tsx`, `switch.tsx`,
  `toggle.tsx`. Elles utilisent encore `border`, `bg-background`,
  `shadow-lg`, `duration-200` ou `text-sm`. Chacune doit être migrée sur le socle
  dans le commit qui la monte sur un écran, jamais après.
