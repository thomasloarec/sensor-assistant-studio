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

| Alias            | Renvoie vers           | Usage                                       |
| ---------------- | ---------------------- | ------------------------------------------- |
| `--mw-surface`   | `--surface`            | panneaux et cartes de l'atelier             |
| `--mw-field`     | `--popover`            | champs, listes déroulantes, options natives |
| `--mw-on-accent` | `--primary-foreground` | texte posé sur une action pleine            |

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

### Curseurs documentaires à crans

Un choix ordinal documenté peut prendre la forme d’un curseur à crans si plusieurs valeurs existent. Une valeur unique est affichée sans faux curseur. La valeur métier lisible précède toujours son code secondaire.

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

1. **Comprendre** — le héros et l'aimant pédagogique associent zones de commutation,
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

| Fichier                        | Usage                                      |
| ------------------------------ | ------------------------------------------ |
| `logo-lockup.png` (600×141)    | logo primaire sur fond clair               |
| `logo-lockup-reversed.png`     | logo primaire sur fond sombre              |
| `logo-mark.png` (120×117)      | bloc « S » seul, fond clair (chrome dense) |
| `logo-mark-reversed.png`       | bloc « S » seul, fond sombre               |
| `favicon-32.png`               | favicon navigateur                         |
| `apple-touch-icon.png`         | écran d'accueil iOS (180×180)              |
| `icon-192.png`, `icon-512.png` | `site.webmanifest`                         |

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

- Un circuit compact, placé sous « Affichage », relie alimentation, reed et
  lampe à l'état du contact calculé. La lampe, la position des lames et le
  libellé rendent cet état lisible sans dépendre de la couleur. L'état inconnu
  affiche un point d'interrogation, sans courant. Le menu passe devant ce
  schéma non interactif ; les gestes de la scène restent disponibles. Le
  mouvement suit les jetons existants et s'arrête en mouvement réduit. Sur
  téléphone, le circuit se place en bas à droite pour libérer le centre de la
  scène et la deuxième ligne de commandes.

- L'atelier utilise l'échelle typographique unique par des alias locaux
  `--mw-t-body`, `--mw-t-dense`, `--mw-t-label`, `--mw-t-title`, `--mw-t-title-m`,
  `--mw-t-title-l`, `--mw-t-display`, définis dans `.mw` comme de simples renvois
  vers `--t-*`. Aucune taille écrite à la main.
- Le plancher aveugle `font-size: max(0.875rem, 1em)` posé sur tous les éléments
  de l'atelier a été retiré : `1em` se résolvant contre `.mw` (16 px), il
  ramenait à 16 px tout ce qui devait rester en `--mw-t-dense` et élargissait la
  colonne de réglages. Les deux garde-fous réels du même bloc restent en place :
  `min-height: 44px` sur les contrôles et le `:focus-visible`.
- La fiche capteur en surimpression (`sensor-card.css`) suit le même socle : ses
  32 tailles écrites à la main sont remplacées par les renvois `--mw-t-*`
  choisis par rôle (titre de fiche, sous-titres, corps, légendes), les valeurs
  mesurées passent en `var(--font-mono)` tabulaire, et les renvois sont
  redéclarés sur `.sensor-card` parce qu'un `<dialog>` peut être monté hors du
  sous-arbre `.mw`. Le verrou de marque du bandeau de la fiche est rendu par
  `<BrandLogo tone="reversed">`, jamais recomposé en texte.
- Contraste du bandeau de la fiche (§8, mesuré) : le bandeau est toujours peint
  sur le dégradé sombre, il porte donc la classe `immersive`. Le sous-titre, la
  catégorie, la note de contacts et le libellé « Dimensions du corps »
  utilisaient `--hairline-strong` — un jeton de trait, 1,9:1 sur le dégradé. Ils
  passent à `--muted-foreground` (5,0 à 7,5:1). Un jeton de trait ne sert jamais
  de couleur de texte. En contexte sombre, `--success` est éclairci
  (`oklch(0.78 0.11 168)`, 7,8:1) : la valeur claire tombait à 2,6:1.
- Le sélecteur de langue n'a plus de plafond de largeur en pixels : un nom de
  langue tronqué est le pire défaut possible sur le contrôle que cherche
  justement qui ne comprend pas la langue affichée. La rangée du bandeau passe à
  la ligne. Vérifié en 390 px et 320 px dans les huit langues.
- Exceptions assumées et documentées :
  - `--mw-flow-duration` (jeton local) — la boucle continue du courant du schéma
    n'a pas d'équivalent parmi les six durées du socle.
  - `--mw-legend-dot-radius` (jeton local, 2 px) — la puce de légende est un
    carré de 7 px ; le plus petit rayon du socle (8 px) la transformerait en
    rond et effacerait la distinction entre puce carrée et pastille ronde.
  - Les textes des schémas SVG sont dimensionnés en unités utilisateur du
    `viewBox` : ils suivent l'échelle du dessin, pas l'échelle typographique CSS.
  - Les matériaux Three.js, les dégradés de scène et les couleurs de rendu du
    catalogue capteur restent des données techniques, jamais des jetons.
  - Les filets de séparation encore présents dans l'atelier sont des séparateurs
    de scène interne, pas la bordure grise 1 px proscrite par la règle 2.

#### Parcours guidé du modèle importé (lot 1, 22 octobre 2026)

Sans modèle importé, l'atelier reste inchangé. Dès qu'un GLB (ou un exemple)
est ouvert, un bloc `.mw-guide` apparaît en tête de la colonne de réglages,
au-dessus de « Lancer le mouvement » et des réglages avancés : cinq étapes
Modèle → Pièces mobiles → Mouvement → Installation → Essai, **une seule
développée**, la scène restant visible à droite.

- Navigation des étapes : grille de boutons ≥ 44 px sur `--surface-sunken`,
  étape courante en `--surface-tint` + `--e-1`, `aria-current="step"`.
- Choix exclusifs (Coulisse/Pivote, Capteur/Aimant, Sur une surface/À travers
  une paroi) : contrôle segmenté `.mw-segmented`, `role="radio"`.
- Arborescence des pièces : liste indentée par `--depth`, noms du fichier en
  `translate="no"` (jamais traduits), pièce mobile en `--surface-tint`.
- Champs numériques remplis sans bordure (`--mw-field`), invalidité signalée
  par `aria-invalid` et un anneau `--destructive`, valeur précédente rétablie.
- Couleurs ajoutées seulement dans la scène Three.js (exception documentée) :
  surlignage des pièces mobiles, axe en tirets, points relevés.
- Toutes les couleurs suivent le contexte `.immersive` de l'atelier
  (`--foreground`, `--heading`, `--surface*`), jamais les jetons de marque bruts.
- La source du contact (illustratif, non prédit) est affichée dans l'étape
  Essai, à l'endroit où on lit le résultat.

Revue indépendante du lot 1 (22 octobre 2026) :

- Avec un modèle importé, le parcours passe **en premier** ; les gabarits
  D1/D3 et le bouton « Lancer le mouvement » général sont retirés de la
  colonne, la distance d'activation réelle reste juste sous le parcours.
- Boutons secondaires du parcours sous `.immersive` : `--surface-sunken` +
  `--heading` (contraste mesuré ≥ 10:1), jamais `--standex-blue` sur sombre.
- Saisie refusée : message `.mw-field-error` (`role="alert"`, `--destructive`)
  avec les bornes, en plus de `aria-invalid` ; jamais de retour silencieux.
- Pointage refusé (points confondus, supports non solidaires, traversant
  incompatible) : encart `.notice-warning` dans l'étape Installation.
- Démonstrations : raccourci `.mw-demo-shortcut` (pilule ≥ 44 px) à côté de
  « Importer mon modèle 3D », refermé après un choix ; le café annonce les
  produits qu'il impose.
- Mouvement réduit : « Lancer le cycle » est désactivé et expliqué, les pas
  ◀ ▶ et le curseur restent disponibles.
- Aucun débordement horizontal à 1265 px ni à 390 px (champs `min-width: 0`).

Lot 2 — animations du fichier et repères (22 octobre 2026) :

- Étape Modèle : liste `.mw-clip-list` des clips dans un encart `.notice-info`,
  nom exact `translate="no"` et durée en `.t-metric` ; un clip refusé dit
  pourquoi (morphing, squelette, échelle, non rigide, piste orpheline).
- Étape Mouvement : contrôle segmenté « Définir le mouvement » / « Animation du
  fichier », la seconde option n'existant que si un clip pris en charge existe.
- Étape Essai : temps du clip (`.t-metric`) au lieu de l'ouverture pour une
  animation générale ; boutons ⏮ ◀ ▶ ⏭ ≥ 44 px ; bloc `.mw-markers` sur
  `--surface-sunken` (sans bordure) pour la « distance entre les repères »,
  toujours distinguée de l'écart capteur–aimant et de l'entrefer.
- Scène : repères et cote en couleur de rendu Three.js (exception documentée).

Revue lot 2 (22 octobre 2026) :

- Menu « Essayer un modèle de démonstration » : surface OPAQUE `--popover` /
  `--popover-foreground`, élévation `--e-4`, défilement interne ; il passe
  au-dessus du verdict et de la scène sans les laisser transparaître.
- Refus d'échelle à l'import : encart `.notice-warning` `.mw-units-retry` sous
  les actions principales, sélecteur d'unités et « Réessayer avec ces unités » ;
  aucune unité devinée, montage précédent intact jusqu'à validation.
- Étape Essai : bloc `.mw-switch-events` sur `--surface-sunken` — résumé
  « fermeture(s) / ouverture(s) » en `.t-metric`, liste repliable d'événements
  (boutons ≥ 44 px sur `--surface-tint`) qui placent la lecture ; pas
  d'échantillonnage et source de l'illustration (ligne nominale publiée, plage
  du guide ou repli 15 / 18 mm) en `.t-caption`.

## 11. Ce qui reste ouvert

### Atelier pédagogique interne — 27 octobre 2026
Extension catalogue autorisée15:41 : les zones d’activation estimées sont superposées aux vrais corps sélectionnés, sans capsule générique de remplacement. Bandeau constant « Simulation indicative · distances à confirmer avec Standex » et statut Modèle66 adapté / distances documentées / analogie ; paramètres/centres/axes estimés repliés. Coupe du même évaluateur avec enveloppe produit simplifiée, sans nouveau jeton. Le résultat/reprise conserve une trace indicative nonqualifiante, jamais un contact binaire promis.
Complément15:32 : un seul accordéon « Position et environnement » en produit simple rassemble D1/D3, trajectoire, orientation et environnement ; capteurs PCB sans commande de câble. Aucun nouveau libellé ni jeton.
En-tête mobile client (complément 15:28) : placement explicite en deux rangées, retour / marque+titre / fermer puis contexte+statut / langue. Le contexte est un frère de la zone titre, pas son enfant comprimé ; ses retours à la ligne utilisent toute la largeur réservée de la seconde rangée. Cibles ≥44px, typographies et jetons inchangés. Bureau et autres panneaux conservent leur disposition.
Complément client embedded (recette mobile 15:19) : `.mw-client-pedagogical` identifie ce seul contexte, sans changer le staff ni la scène normale. Sous 1024 px, la grille entière défile verticalement avec deux rangées `max-content` : scène/chronologie puis réglages, jamais une rangée résiduelle comprimée ; les deux blocs n'ont pas de défilement imbriqué. Sur bureau, chaque colonne peut défiler sans compresser la scène ou la chronologie. Les références du couple en tête reviennent à la ligne dans la largeur disponible. Aucun nouveau jeton.
Contre-revue client : contexte générique persistant adjacent au verdict, en `notice-info t-body`, indépendant du défilement de la colonne ; en-tête « Exemple générique », statut d’enregistrement réservé au produit. Action « Comprendre les zones de détection » ; détails Form66 repliés dans Sources et limites. Réglages mécaniques et environnement existants en divulgation progressive, sans circuit binaire ni nouveau jeton.
Intégration client autorisée : le même atelier de l’étape 2 conserve le corps produit opaque, les commandes et le montage du dossier. L’indisponibilité du repère produit est un bandeau textuel du socle ; les sources manquantes et distances documentaires se replient dans « Sources et limites ». L’exploration Form66 est déclenchée explicitement avec retour au couple, sans panneau parallèle ; aucune représentation électrique binaire dans ces états. La légende produit et la légende exploratoire sont distinctes. Le retour Résultat conserve l’indisponibilité produit, jamais un favorable exploratoire. Aucun nouveau jeton.
Le mode expérimental réutilise la colonne et les scènes de l’atelier. Lot causes/légendes (27 oct., contre-revue 4311e3ca) : le bandeau a trois étages dans `.mw-verdict-banner` (état `t-title-s` + « Estimation indicative » `t-caption` ; cause `t-body` ; constats nominaux et remède `t-caption`) ; pendant la lecture la cause est remplacée par « Mettre en pause pour analyser la cause », jamais une cause ancienne. Légende pédagogique : pastille pleine `--standex-blue` arrondie `--r-pill` = corps générique opaque ; carré `--standex-gray-25` = centres où l’aimant rencontre ce corps ; hachures `--standex-gray-75`/`--standex-gray-25` = chevauchement possible avec une pièce importée. Coupe : corps plein `.mw-cut-body` si le plan le traverse, sinon contour pointillé `.mw-cut-body-projection` ; les légendes longues de la coupe sont en HTML (`figcaption.mw-ped-cut-caption`, `t-caption`, retour à la ligne) sous la zone de dessin, jamais en texte SVG tronquable. Bornes : libellé en police courante, nombre + unité seuls en `.t-metric`. Jargon et chiffres de calcul repliés dans « Sources et limites ». Bulle 3D du corps `.mw-ped-body-label` : masquée à toutes les tailles (mode pédagogique seulement, recettes 12448 puis 1b3dcbb) car elle se repliait en 4 lignes et recouvrait reed et lobes, sur téléphone comme sur bureau ; la légende complète reste sous la scène dans `.mw-legend`, avec la légende de coupe et les repères N/S. Aucun nouveau jeton. Les volumes nominaux distinguent signal cyan et sensibilité intermédiaire ambre ; les collisions sont neutres dans la coupe. La coupe dimensionne son repère en pixels réels pour préserver les légendes 14 px sur téléphone. Les contrôles utilisent les surfaces, élévations, typographies et boutons du socle ; aucun nouveau jeton. L’état de placement reste textuel et ne représente pas un contact électrique. Le bandeau sépare état et cause par un espacement réel ; la légende reste dans le flux visible sous la chronologie, y compris sur téléphone. Les intervalles chronologiques sont proportionnels au temps, sans supprimer de transitions. Les commandes 3D/coupe restent accessibles dans un groupe, jamais masquées par un ancêtre image. La profondeur minimale rejoint course et décalage dans la colonne existante, avec valeur mm en t-metric, cible44px et focus du socle.

### Atelier intégré — lisibilité et placement (23 octobre 2026)

Le même `.mw-stage` utilise la hauteur réellement disponible dans le panneau
client ou l'écran autonome. Sur grand écran, la colonne de commandes mesure
360 à 400 px ; elle est l'unique zone de défilement des réglages. Le parcours
et l'arbre n'ont plus de défilement imbriqué ni de panneau décoratif interne.
La scène absorbe la hauteur restante, la chronologie reste en dehors du
défilement. Sur téléphone, scène et chronologie précèdent les commandes qui
défilent dans l'espace restant. Aucun texte n'est réduit pour gagner de la place.
Sources, résumé et outils secondaires rejoignent le même défilement de commandes.
Sur téléphone, les étapes et le cadrage sont des sélecteurs natifs de 44 px ;
les actions d'import/résultat se replient dans « Modèle et résultat ».

Axes X/Y/Z et course sont accessibles directement ; course nulle et mouvement
non prêt donnent une prochaine action explicite. L'installation réaffiche les
pièces fixes sans changer la sélection. L'arbre simplifié masque uniquement les
parents sans maillage ayant un seul enfant ; les noms, chemins et sélections
restent ceux du fichier, avec accès à l'arbre complet.

Les commandes Vue d'ensemble / pièce mobile / capteur / aimant utilisent les
boutons du socle et les surfaces opaques `--popover` / `--popover-foreground`.
Le cadrage suit la pose courante sans remettre le zoom manuel à zéro ; il ne
modifie aucune pose du montage. Le support courant reste nommé et remplaçable
dans Installation. Les couleurs, rayons, typographies et mouvements gardent
les jetons existants et la neutralisation en mouvement réduit.
L'en-tête autonome conserve le composant partagé avec le bloc S inversé pour
réserver la hauteur au travail ; le verrou complet n'est jamais rétréci.

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

### Fond des visuels produit

`--surface-product` reste clair dans les sections immersives, pour détacher les boîtiers sombres. Les vignettes 3D utilisent une caméra commune pour comparer les tailles.

### Catalogue et navigation — retour utilisateur V2

Le sélecteur de langue et le menu restent groupés à droite dans les en-têtes de projet et de panneau. Les filtres actifs associent un anneau primaire, une graisse renforcée et un compteur textuel. Le repère de 50 mm est un texte HTML de légende, indépendant du redimensionnement du dessin SVG. La vue 3D est proposée par défaut ; la même échelle et le cadrage individuel restent contrôlables. Les petites références peuvent ainsi être agrandies sans changer leurs dimensions. Les vignettes conservent la limite de quatre contextes WebGL et le respect du mouvement réduit.

### Corrections du parcours du 16 septembre 2026

L'atelier présente deux actions en tête : import secondaire et validation primaire.
Les boutons d'approche peuvent revenir à la ligne ; ils conservent leur cible de
44 px et une marge intérieure. Câble et réglages avancés sont des dépliants dans
la colonne de contrôles, sans positionnement flottant. Les liens STEP/datasheet
utilisent une surface claire, le texte courant et l'élévation existante.
Le formulaire de contexte reste visible. Le NDA utilise la fenêtre modale du
socle, avec fermeture accessible de 44 px. Aucun nouveau jeton de marque.
Les demi-couleurs des aimants 3D sont des matériaux de scène : repères visuels
seulement, sans attribution d'un axe magnétique caractérisé.
La progression conserve ses quatre libellés, son pouce et sa structure segmentée
à toutes les largeurs ; les sous-textes explicatifs ne font plus partie de ce
rail afin de laisser la priorité au questionnaire.

### Corrections du 17 septembre 2026

Les panneaux plein écran sont rendus à la racine du document pour rester indépendants des transformations des cartes. Leur en-tête reste fixe, le contenu défile dans son propre espace. Dans l'atelier, les réglages et la scène ont des défilements indépendants ; la scène réserve la place des actions, du verdict et de la chronologie. Sur mobile les deux colonnes s'empilent.

Le menu Affichage utilise une surface opaque sombre et le texte clair du contexte immersif. Le catalogue complet est regroupé par familles et les compromis utilisent l'encart d'avertissement du socle. Les choix « Non défini » montrent un état sélectionné. Les exemples proposent uniquement Précédent et Suivant, sans rotation automatique ni commande de pause. Les portraits de responsables sont circulaires, avec nom et territoire en texte. Aucun nouveau jeton de marque.

Les noms du capteur et de l'aimant se masquent indépendamment. Les vignettes montrent les câbles ou gaines prévus par le modèle ; les références pour carte gardent leurs pattes. Le calendrier de démonstration utilise les boutons du socle, des cibles de 44 px et une fenêtre limitée à 90 % de la hauteur disponible avec défilement. La confirmation d'envoi remercie l'utilisateur, annonce le suivi Standex et accompagne la réussite d'une coche avec `anim-scale-in`, neutralisée en mouvement réduit. Le NDA précède la soumission ; les actions de suivi sont regroupées après l'envoi.

### Questionnaire client — composition validée

Le rappel du résultat attendu précède la carte. La carte associe l'avancement et
la catégorie, puis une question en `t-title-l`. Sur grand écran, la réponse
occupe trois parts et les exemples deux parts ; sur mobile, les exemples passent
avant le champ sans masquer de contenu. Le champ conserve un libellé visible.
À la question de montage, les choix structurés facultatifs sont visibles sans
dépliant, regroupés sur une surface teintée avec un choix « Je ne sais pas encore »
qui laisse le montage inconnu. La précision libre précède toujours la navigation
finale. Les exemples utilisent des puces de pagination manuelle, avec une cible
de 44 px, `aria-label` explicite et `aria-pressed` ; aucune rotation automatique
n'est autorisée.

## Carte de question — champ et exemple (9 octobre 2026)

- Champ de réponse (`.answer-field`, aussi sur les trois dimensions de la question 4) : fond `--surface`, bordure 1,5 px `--standex-gray-75`, `--standex-gray` au survol, `--standex-blue` au focus avec l'anneau unique `--ring`. Dérogation assumée à « la lumière remplace le trait » : c'est l'affordance d'un champ, pas un séparateur. Gray 75 plutôt que Gray 50 car Gray 50 n'atteint pas 3:1 sur blanc.
- Libellé « Votre réponse » et « Question X sur 6 » en casse normale, SemiBold ; seule la pastille de catégorie garde les capitales.
- Exemple (`.questionnaire-examples`) : note sans fond ni coins, filet gauche 2 px `--standex-blue-25`, retrait 14 px, icône ampoule + « Exemple » en Detect Blue, texte italique Electronics Gray entre guillemets, aligné sur le haut du champ ; sous 768 px il passe sous le champ.
- Navigation : flèches précédent/suivant (44 px, aria-label), points décoratifs rapprochés (6 px), actif Detect Blue, autres Gray 25. Aucun défilement automatique ; fondu neutralisé sous `prefers-reduced-motion`.
- Progression remplie de 1/6 dès la question 1 ; « Question précédente » masquée à la question 1 ; focus automatique dans le champ sur desktop (≥ 768 px, pointeur fin).

### Connecteurs — divulgation progressive (12 octobre 2026)
Chaque tuile documentée montre son aperçu géométrique avant sélection dans une grille à deux colonnes. Le bouton du socle, avec état sélectionné explicite et dimensions en `t-metric`, est un frère de l’aperçu : la rotation ne sélectionne pas le connecteur. Le nom choisi et la confirmation Standex restent visibles ; seules les sources et limites sont regroupées dans un dépliant natif fermé par défaut, sans aperçu supplémentaire. Aucun lien, dépliant ni canevas interactif n’est imbriqué dans le bouton de sélection. Les couleurs du repli SVG utilisent les jetons existants, sans nouveau jeton.

### Découverte Reed — 13 octobre 2026
Retouche parallèle : les deux lobes principaux ont des flancs continus se resserrant vers une racine sous le boîtier, un capuchon arrondi et une proportion verticale allongée. Les racines ON sont explicitement contraintes et élargies sous le boîtier dans les deux orientations, sans bouchon HOLD/OFF ; réduction progressive loin des attaches, petites racines latérales émoussées, croix OFF et séparations diagonales conservées.
Finition du courant : les tirets partagés câble/contacts utilisent `--reed-current` et un trait de 1,5 unité SVG, distinct des lames fermées `--reed-closed` à 2,5 unités ; la lumière du flux reste perceptible sur le trait plein sans changer l'état ni la boucle.
La carte d'accueil présente un capteur générique complet en boîtier avec câble, opaque par défaut. L'intérieur optionnel montre les lames, jamais une LED fictive. Le contact extérieur associe symbole et texte. Les zones ON translucides utilisent `--signal`, HOLD des hachures `--muted-foreground`, OFF la surface sombre ; elles représentent la commutation, pas des lignes de champ. Les deux orientations utilisent un pouce glissant, les autres commandes des boutons du socle. La poignée seule neutralise le défilement tactile ; cible 56 px, déplacement 2D et focus visible. Les contours et hachures restent immobiles. Fermé, le boîtier, les lames et le statut prennent `--reed-closed` ; des tirets parcourent le câble et, en vue intérieure seulement, les contacts. La boucle utilise `calc(var(--d-hero) * 2)` et `--ease-in-out`, disparaît ouvert et reste statique sous mouvement réduit. Les couleurs, rayons et transitions renvoient aux jetons existants, avec neutralisation sous mouvement réduit. Dérogation couleur demandée par le propriétaire : `--reed-closed: oklch(0.82 0.16 85)` (jaune ambré électrique), `--reed-current: oklch(0.98 0.06 100)` (jaune pâle très lumineux), définis uniquement sur `.reed-discovery` dans le socle CSS. Le cyan des lobes et le thème global restent inchangés. Aucune nouvelle dépendance.

Révision PIC intentionnelle : les silhouettes originales sont des régions géométriques pédagogiques, pas un dipôle ni une calibration. À 90°, quatre volumes arrondis aux bords intérieurs plats bordent une croix OFF régulière. En parallèle, les grands lobes allongés sont verticaux, les petites gouttes latérales. Les mêmes polygones échantillonnés sont dessinés et testés ; ON intérieur, HOLD entre contours, OFF extérieur/couloirs, sans disque de masquage. L'invitation initiale est une main fantôme non interactive, sans texte : déplacement faible, cycle `calc(var(--d-hero) * 6)` avec pause et `--ease-in-out`. Elle disparaît à la prise ou première flèche et reste terminée en mémoire de l'onglet ; mouvement suspendu hors écran/onglet masqué, main statique sous mouvement réduit. Les zones sont visibles par défaut ; « Champ magnétique » garde une légende de commutation indicative. La légende revient naturellement à la ligne au lieu d'imposer trois rangées. Finition visuelle : la scène occupe toute la largeur intérieure, sans retrait supplémentaire ; son débordement visible et les marges de la carte protègent la poignée de 56 px et son focus. Le libellé visible « À 90° » conserve « Perpendiculaire » comme nom accessible et infobulle, sans césure ni réduction typographique. Seuls les deux jetons électriques locaux ci-dessus sont ajoutés ; changement de modèle pédagogique explicitement demandé.
