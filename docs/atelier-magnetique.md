# Atelier magnétique — version courante V0.4

Les langues, cartes produit, sources et vérifications sont dans [Atelier magnétique V0.4](atelier-magnetique-v04.md). Les changements du modèle et le mode d'emploi de la machine importée restent décrits dans [Atelier magnétique V0.3](atelier-magnetique-v03.md).

---

# Archive de la V0.2

Les limites et résultats ci-dessous décrivent la V0.2. La V0.3 les remplace notamment pour les distances fictives, le MK02, les mouvements 3D et les imports.

Version interne du 7 septembre 2026, revue après les retours de Thomas. Dans l'espace projet, ouvrir **Atelier magnétique**, puis les étapes Capteur → Aimant → Mouvement. Le dossier est désormais l'onglet affiché par défaut ; les outils de test restent disponibles.

## Ce qui fonctionne

- Scène 3D orientable, vue plane de repli, placement du montage dans un repère de machine.
- Exemple Standex MK03-1A66B/C/D/E-500W + M02 : approches D1 et D3, distances typiques publiées, fermeture et ouverture distinctes.
- Exploration avec reed et aimant génériques : rotation, aimantation axiale ou diamétrale, inversion des pôles, approche, passage latéral et pivot.
- Cycle aller-retour, lecture/pause et déplacement du curseur avec reconstruction de l'historique du contact.
- Fenêtre de fermeture souhaitée comparée au cycle : petit défi de réglage, sans score de conformité produit.
- Sauvegarde versionnée, reprise du dernier montage de la session, export/import JSON et résumé Markdown.
- Pièce jointe dans le dossier et son export, avec les hypothèses et la provenance.
- Aimant N rouge / S bleu dans les deux vues ; pour M02, les pôles sont symboliques.
- Contacts en transparence dans le boîtier, circuit agrandi et animé avec lampe allumée quand le contact est fermé. Le circuit est fictif et ne calcule aucune intensité réelle.
- Catalogue de 21 modèles et variantes Standex + un reed pédagogique, filtre, recherche, comparaison à la même échelle, liens vers 21 fiches officielles (dont celle des aimants).
- Corps modélisés en millimètres, cote de longueur, règle de 10 mm, grille de 5 mm, zoom capteur / montage.
- Interface dossier et conversation harmonisée : cartes, palette, hiérarchie, indicateur de complétude, scénario repliable et sélection de session sur mobile.

## Portée des résultats

**Exemple documenté.** La table Standex publie des valeurs typiques : elles ne sont pas des limites garanties. D1 représente l'approche face au centre du capteur avec axes parallèles ; D3 l'approche par l'extrémité, également avec axes parallèles. Les enveloppes sont cotées : MK03 cylindrique 25,5 × Ø 5,8 mm, M02 32,4 × 16,7 × 10 mm. Le paramètre de distance correspond à l'entrefer de la figure, pas à la distance entre centres. Le modèle ne localise pas les éléments actifs ou les pôles à l'intérieur des produits. M02 figure dans la liste des actionneurs auxquels la page associe les données.

| Classe MK03-1A66 | D1 fermeture / ouverture | D3 fermeture / ouverture |
| ---------------- | ------------------------ | ------------------------ |
| B                | 15 / 17,5 mm             | 9,3 / 11,4 mm            |
| C                | 13 / 16,5 mm             | 7,4 / 9,9 mm             |
| D                | 11 / 14,5 mm             | 5,7 / 8,5 mm             |
| E                | 10 / 13,5 mm             | 4,5 / 8 mm               |

Source consultée le 07/09/2026 : [Standex, Reed Sensor Activation Distances](https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/). D2 n'est pas reconstruit : une distance de lobe latéral ne définit pas une cartographie complète.

**Exploration pédagogique.** Le champ est celui d'un dipôle idéal dans l'air en unités arbitraires. La réponse est une moyenne de sept projections du champ le long du contact illustré, puis une hystérésis à seuils arbitraires 1 / 0,72. Ce n'est ni un modèle mécanique des lames, ni une résolution de leur aimantation. La géométrie est en millimètres ; aucune portée réelle du produit n'est prédite et le signal n'est pas exprimé en mT. Le MK02 est un détecteur de métal ferreux avec aimant intégré : sa forme est sélectionnable, son activation reste indéterminée.

Le nuage de points de V0.1 a été retiré. Le parcours affiche maintenant l'état du contact pour le sens courant (aller ou retour), en respectant l'hystérésis : vert fermé, gris ouvert, ocre indéterminé. Les six lignes de champ idéales sont facultatives. Inverser N/S ne change pas l'état du reed normalement ouvert non polarisé de cet exemple ; cela ne décrit pas les composants polarisés ou bistables.

Le calcul devient indéterminé près de la singularité du dipôle, en cas de chevauchement des enveloppes orientées X/Z, en présence de matière ferromagnétique déclarée, à une autre température, ou lorsque la référence est utilisée hors de sa configuration documentée. La vérification d'enveloppes ne couvre pas câbles, écrous ou détails de fixation. La lecture est quasi statique : pas de calcul des rebonds, du temps de réponse, de la cadence, des chocs ou des tolérances de fabrication.

Autres sources : [interaction aimant/reed](https://standexdetect.com/resources/reed-technology-academy/magnet-interaction/), [paramètres électriques et hystérésis](https://standexdetect.com/resources/reed-technology-academy/reed-switch-characteristics/basic-electrical-parameters-of-reed-switch-products/).

## Intégration

- Moteur pur : `src/lib/standex/magnetic-workshop.ts`.
- Interface et scène : `src/components/standex/workshop/`.
- Entrée depuis le banc : `src/routes/index.tsx`, chargement différé de l'atelier puis de la 3D.
- Persistance : note `internal` dans `sensor_test_messages`, marqueur `STANDEX_MAGNETIC_WORKSHOP_V2`, configuration version 2 incluant `sensorId`. Les notes et fichiers V1 sont migrés à la lecture vers MK03 (référence) ou GENERIC (pédagogie). Le moteur V0.2 recalcule les résultats ; les illustrations pédagogiques V1 peuvent donc changer. Aucune nouvelle table ni modification des accès.
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

43 tests et 190 assertions couvrent les huit configurations Standex, l'hystérésis, les conditions inconnues, les transformations et polarités, les enveloppes et collisions, le cas MK02, les sources, la migration V1/V2 et la conservation des dossiers existants. Le compilateur TypeScript et la construction complète du site passent. Le paquet 3D est chargé à l'ouverture de l'atelier ; un avertissement de taille reste présent (environ 250 ko compressés pour la scène).

## Catalogue et fidélité des formes

Le registre est dans `src/lib/standex/sensor-catalog.ts`, les fiches fournies sont copiées sans transformation dans `public/datasheets/`. Les sources originales du dossier Lead Magnet restent inchangées. Les corps sont cotés ; filets, chanfreins, épaulements, sorties de câble, position des fixations et contacts sont simplifiés. Ce n'est pas une CAO pour fabriquer ou valider une implantation. Les contacts et leur déplacement sont exagérés pour la lecture.

Périmètre : MK24 Form A J, MK03, MK02, MK04, MK05, MK13, MK14, MK18, MK20/1, MK20/2, MK21, MK21PR, MK26, MK27, MK11 inox M5/M8, MK11 plastique M8, MK11 laiton M6, MK36/MK37/MK38 sans adaptateur. Le catalogue n'inclut pas encore toutes les combinaisons de terminaisons, de contact et de longueur du catalogue commercial.

MK24 : corps de 5 × 2,2 × 1,6 mm ; connexions J comprises, longueur 5,5 mm. MK02 : 32,4 × 16,8 × 10 mm. La taille réelle d'un corps et la présence d'une fiche ne fournissent pas ses seuils d'activation : seuls MK03 + M02 dans D1/D3 utilisent ici la table documentée.

## Pour passer à une validation de montage réel

Obtenir le couple exact et sa classe de sensibilité, les cotes et positions des éléments actifs, le matériau et l'aimantation, les conditions mécaniques et thermiques, puis des mesures d'enclenchement/relâchement sur plusieurs pièces et plusieurs trajectoires. Faire relire le protocole et le modèle par le bureau d'études Standex avant toute promesse de portée ou de conformité.
