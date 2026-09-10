# Registres Studio V2 — livraison du lot 0

Le validateur est prêt à tester. Le lot 0 complet reste ouvert : les données physiques en attente ne sont pas acceptées.

Les six fichiers `*_MODELE.csv` sont des gabarits. Les lignes commençant par `#` sont des exemples commentés, ignorés par le validateur. Ces exemples sont synthétiques. Ne les utilisez pas comme source produit.

1. Copier le gabarit vers un nouveau fichier `R<n>_<nom>_V1.csv`.
2. Remplir uniquement ce que la source dit, conserver le verbatim et la provenance. Les cellules inconnues restent vides ; une donnée obligatoire manquante empêche l'import.
3. Conserver UTF-8 sans BOM, séparateur point-virgule, LF, point décimal. Excel peut ajouter un BOM ou changer les fins de ligne : le validateur le signale et ne modifie jamais silencieusement le fichier.
4. Depuis le dépôt, lancer `bun tools/registry-validate.ts --check <fichier>` pour contrôler sans écrire, puis la même commande sans `--check` pour accepter.
5. Conserver la version acceptée. Une correction utilise une nouvelle version ; les cas R3 déjà acceptés restent inchangés et les corrections ajoutent une ligne avec `supersedes_case_id`.

Un fichier R2 charge les dernières versions numériques R1, R2b et R2c du même dossier. R3b charge R3. Un dossier ou un motif `*.csv` sélectionne la dernière version de chaque registre public. Les anciens fichiers, les modèles et la table privée sont exclus. Le mode `--strict` transforme les avertissements de confiance basse, de source inférée et d'approche ambiguë en erreurs.

La validation est tout ou rien pour l'ensemble sélectionné. Sur erreur, aucun JSON ni journal n'est modifié. Sur réussite, les JSON typés sont écrits dans `src/data/registries/R*.json`, une copie immuable est conservée dans `history/`, et `INDEX.md` reçoit la version et l'empreinte SHA-256 du CSV. Les données d'un registre accepté antérieurement restent vérifiées lorsqu'une dépendance change. Une nouvelle version vide de R1 ne peut donc pas laisser R2 avec des références orphelines.

`registres/en-attente/` contient les transcriptions documentaires incomplètes. Leur contrôle strict doit échouer. Ne déplacez ces fichiers dans le dossier d'acceptation qu'après avoir renseigné les sources manquantes. Aucun moteur ne doit les importer.

`R3_cas_application_V1.csv` et `R3b_cas_produits_V1.csv` sont volontairement vides. Aucun cas réel n'a été saisi. La table privée et son modèle existant restent uniquement dans le dossier original de Thomas ; ils sont exclus de cette livraison.

La validation d'un registre ne constitue pas une calibration. `br_mt_20c` vide reste `null`, avec `MAGNET_BR_UNKNOWN`. Le lot 1 devra distinguer seuils relatifs à M02 et seuils absolus en mT, après clarification du cahier des charges. Aucune rémanence n'est calculée à partir du moment magnétique publié.

Les libellés `outcome_reason` suivent l'énumération du tableau §1.7.1. Le texte libre reste dans `pitfall_fr` et `application_short_fr`, sans correction. La phrase du §1.7.1 qui décrit aussi `outcome_reason` comme texte libre est une contradiction à arbitrer.

Limite : la procédure restaure les fichiers si une opération d'écriture échoue ; elle ne prétend pas fournir une transaction résistante à une coupure machine entre plusieurs renommages. Exécuter un seul import à la fois.
