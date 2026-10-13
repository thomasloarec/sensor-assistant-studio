<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Système de design — lecture obligatoire avant toute modification du front

Lire **`docs/design-language.md`**, charte Standex STA001 V3.1, avant toute
modification de `src/routes/`, `src/components/` ou `src/styles.css`.

Les règles ci-dessous sont non négociables. Elles s'appliquent même à une
correction d'une ligne. En cas de doute, la règle gagne contre l'habitude.

1. **Aucune valeur littérale.** Couleurs, rayons, ombres, durées et courbes
   viennent des jetons de `src/styles.css` (`--standex-*`, `--surface*`,
   `--r-*`, `--e-*`, `--d-*`, `--ease-*`). Interdits : un hex en dur dans un
   composant, une couleur Tailwind brute (`amber-500`, `slate-200`, `gray-400`),
   une durée ou une courbe écrite à la main. Seules exceptions : les matériaux
   Three.js de l'atelier et les dégradés de scène volontaires.

   Deux exceptions documentées, et seulement celles-là :

   - `src/routes/__root.tsx` — la balise `<meta name="theme-color">` ne peut pas
     lire une variable CSS : la valeur `#254061` y est écrite en dur. C'est la
     valeur exacte de `--standex-blue` ; si le jeton change, cette balise change
     dans le même commit.
   - `src/styles.css` — les commentaires des jetons de marque rappellent l'hex
     d'origine (`/* #254061 Detect Blue */`). Ce sont des repères de lecture, pas
     des valeurs utilisées.
2. **La lumière remplace le trait.** On hiérarchise par élévation (`--e-1` à
   `--e-4`) et par surface (`--surface`, `--surface-sunken`, `--surface-tint`).
   La bordure grise 1 px n'est pas un moyen de séparation : c'est le défaut
   visuel que cette refonte a supprimé.
3. **Typographie : une seule échelle.** Utilise les classes `.t-display-*`,
   `.t-title-*`, `.t-body*`, `.t-caption`, `.t-label`, `.t-metric`. Titres en
   Detect Blue, texte courant en Electronics Gray. Jamais de `text-xs`, jamais
   de taille écrite à la main. Les valeurs mesurées (mm, volumes, dates)
   prennent `.t-metric` pour que les chiffres s'alignent.
4. **Composants.** Champs remplis et non encadrés. Onglets = contrôle segmenté
   avec pouce glissant. Badges = pilules teintées sans bordure. Blocs métier =
   `.panel-block` / `.panel-block-lg`. Encarts d'état = `.notice-info`,
   `.notice-warning`, `.notice-danger`, `.notice-success`. Contenu technique
   monospace = `.code-block`.
5. **Mouvement.** Quatre courbes et six durées, toutes dans les jetons. Ce qui
   apparaît vient de l'endroit d'où il vient. Toute animation est neutralisée
   sous `prefers-reduced-motion: reduce`, sans exception.
6. **Contexte sombre.** `.immersive` est une classe posée sur une **section**,
   jamais un thème global. `.dark` existe pour shadcn mais n'est pas utilisé par
   l'espace client.
7. **Logo.** Passe toujours par `<BrandLogo>` (`src/components/standex/brand-logo.tsx`).
   Ne référence jamais `public/brand/*` ailleurs. Ne recolore pas, ne remodèle
   pas, n'étire pas, n'ajoute pas de tagline. Le verrou complet ne descend
   jamais sous 185 px de large (44 px de haut) : sous cette taille, bascule sur
   le bloc « S ». Version inversée obligatoire sur fond sombre.
8. **Accessibilité, non négociable.** Corps 18 px, champs et libellés ≥ 16 px,
   texte d'interface ≥ 14 px, cibles cliquables ≥ 44 px, contraste ≥ 4,5:1 pour
   le texte normal et ≥ 3:1 pour les gros textes et éléments d'interface, focus
   visible partout. Si une consigne visuelle entre en conflit avec l'une de ces
   règles, l'accessibilité gagne et tu le signales.

9. **Primitives shadcn non migrées.** Les composants de `src/components/ui/`
   absents des écrans montés gardent `border`, `shadow-lg`, `text-sm` (état
   accepté). Un écran qui en adopte un le migre dans le même commit, avant
   montage.

### Vérifier avant de livrer

```bash
bun test tests/        # toute la suite doit rester verte
bunx tsgo --noEmit
bun run build

# Contrôles de charte (tous doivent être vides)
rg -n "\b(?:bg|text|border|ring|fill|stroke|from|via|to|shadow|outline|decoration|accent|caret|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b" src/
rg -n "#[0-9a-fA-F]{6}\b" src/routes/ src/components/leadmagnet/ --glob '*.tsx'
rg -n "\b(?:duration|delay)-\d+\b|cubic-bezier\(" src/ --glob '!src/styles.css'
rg -n "\brounded-md border\b|\bborder border-input\b|\btext-xs\b" src/ --glob '!src/components/ui/**' --glob '!src/styles.css'
```

### Faire évoluer le système

Toute évolution met à jour `docs/design-language.md` dans le même commit ; aucun
jeton sans documentation ni contournement ponctuel.

Subdirectories have their own `AGENTS.md`; read them before changing files there.

- Home Reed discovery uses a standalone dimensionless model shared by contours and state; never reuse it for product qualification or persist its exploration.
