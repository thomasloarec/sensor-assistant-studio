# Atelier magnétique V0.1

Première version interne, 7 septembre 2026. Dans le banc, utiliser **Ouvrir l'atelier magnétique**, puis les étapes Capteur → Aimant → Mouvement.

## Ce qui fonctionne

- Scène 3D orientable, vue plane de repli, placement du montage dans un repère de machine.
- Exemple Standex MK03-1A66B/C/D/E-500W + M02 : approches D1 et D3, distances typiques publiées, fermeture et ouverture distinctes.
- Exploration avec reed et aimant génériques : rotation, aimantation axiale ou diamétrale, inversion des pôles, approche, passage latéral et pivot.
- Cycle aller-retour, lecture/pause et déplacement du curseur avec reconstruction de l'historique du contact.
- Fenêtre de fermeture souhaitée comparée au cycle : petit défi de réglage, sans score de conformité produit.
- Sauvegarde versionnée, reprise du dernier montage de la session, export/import JSON et résumé Markdown.
- Pièce jointe dans le dossier et son export, avec les hypothèses et la provenance.

## Portée des résultats

**Exemple documenté.** La table Standex publie des valeurs typiques : elles ne sont pas des limites garanties. D1 représente l'approche face au centre du capteur avec axes parallèles ; D3 l'approche par l'extrémité, également avec axes parallèles. Les boîtiers sont des schémas de taille illustrative. Le paramètre de distance correspond à l'entrefer de la figure, pas à la distance entre centres. Le modèle ne localise pas les éléments actifs ou les pôles à l'intérieur des produits. M02 figure dans la liste des actionneurs auxquels la page associe les données.

| Classe MK03-1A66 | D1 fermeture / ouverture | D3 fermeture / ouverture |
| --- | --- | --- |
| B | 15 / 17,5 mm | 9,3 / 11,4 mm |
| C | 13 / 16,5 mm | 7,4 / 9,9 mm |
| D | 11 / 14,5 mm | 5,7 / 8,5 mm |
| E | 10 / 13,5 mm | 4,5 / 8 mm |

Source consultée le 07/09/2026 : [Standex, Reed Sensor Activation Distances](https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/). D2 n'est pas reconstruit : une distance de lobe latéral ne définit pas une cartographie complète.

**Exploration pédagogique.** Le champ est celui d'un dipôle idéal dans l'air en unités arbitraires. La réponse est une moyenne de sept projections du champ sur l'axe du reed générique, puis une hystérésis à seuils arbitraires 1 / 0,72. Ce n'est ni un modèle mécanique des lames, ni une résolution de leur aimantation. Les unités de scène ne sont pas des millimètres de portée et le signal n'est pas exprimé en mT.

Les points verts représentent des positions du centre de l'aimant où le proxy permet la fermeture ; l'enveloppe ocre approxime le seuil de relâchement. Ils sont échantillonnés dans un volume borné autour du reed, pour l'orientation actuelle de l'aimant. Les lignes de champ suivent l'aimant. Inverser N/S ne change pas l'état du reed normalement ouvert non polarisé de cet exemple ; cela ne décrit pas les composants polarisés ou bistables.

Le calcul devient indéterminé près de la singularité du dipôle, en présence de matière ferromagnétique déclarée, à une autre température, ou lorsque la référence est utilisée hors de sa configuration documentée. La lecture est quasi statique : pas de calcul des rebonds, du temps de réponse, de la cadence, des chocs ou des tolérances de fabrication.

Autres sources : [interaction aimant/reed](https://standexdetect.com/resources/reed-technology-academy/magnet-interaction/), [paramètres électriques et hystérésis](https://standexdetect.com/resources/reed-technology-academy/reed-switch-characteristics/basic-electrical-parameters-of-reed-switch-products/).

## Intégration

- Moteur pur : `src/lib/standex/magnetic-workshop.ts`.
- Interface et scène : `src/components/standex/workshop/`.
- Entrée depuis le banc : `src/routes/index.tsx`, chargement différé de l'atelier puis de la 3D.
- Persistance : note `internal` dans `sensor_test_messages`, marqueur `STANDEX_MAGNETIC_WORKSHOP_V1`, configuration version 1. Aucune nouvelle table ni modification des accès.
- Le dernier montage valide de la session est repris. À l'import, seules les clés de configuration sont acceptées ; les résultats sont recalculés. Aucun champ importé ne peut attribuer un statut « calibré » ou une validation.
- Dossier : résumé attaché, sans remplacer les exigences du prospect, réduire les questions manquantes ou augmenter la confiance produit.
- Le mode IA existant n'exploite pas encore le montage dans une conversation libre. L'étape suivante consistera à lui transmettre une configuration structurée et ses limites, après correction des limites du banc relevées dans l'audit.

## Vérifier et développer

```sh
bun install --frozen-lockfile
bun run test:workshop
bunx tsc --noEmit
bun run build
bun run dev:workshop
```

La démonstration locale est à `http://127.0.0.1:5174/workshop-preview.html`. Elle ne demande pas d'identifiants et conserve ses sauvegardes uniquement dans son navigateur. Elle utilise le même composant, mais ne teste pas la persistance distante. Le serveur local écoute sur l'adresse de bouclage uniquement ; sa page ne fait pas partie des routes de production.

35 tests couvrent les huit configurations Standex, l'hystérésis, les conditions inconnues, les transformations et polarités, la validation des imports et la conservation des dossiers existants. Le compilateur TypeScript et la construction complète du site passent. Le paquet 3D est chargé à l'ouverture de l'atelier ; un avertissement de taille reste présent (environ 249 ko compressés pour la scène).

## Pour passer à une validation de montage réel

Obtenir le couple exact et sa classe de sensibilité, les cotes et positions des éléments actifs, le matériau et l'aimantation, les conditions mécaniques et thermiques, puis des mesures d'enclenchement/relâchement sur plusieurs pièces et plusieurs trajectoires. Faire relire le protocole et le modèle par le bureau d'études Standex avant toute promesse de portée ou de conformité.
