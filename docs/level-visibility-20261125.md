# Configurateur niveau — lisibilité et grandes cuves

Corrections du 25 novembre 2026, à la suite des neuf observations utilisateur.
Le parcours reste accessible par le menu d’aperçu. La navigation commune est
également ajustée dans le parcours de proximité.

## Comportements livrés

| Observation | Comportement corrigé |
| --- | --- |
| Navigation trop étalée | Fond opaque sur toute la largeur ; les quatre étapes restent centrées dans 76rem maximum dans les deux parcours. Sur téléphone, « Configurer » évite une coupure du mot. |
| Repères superposés | Colonne latérale réservée, hors du produit ; repères de 44px avec un espacement minimum de 48px entre centres. Défilement si la place manque. Leurs traits conservent le lien avec la hauteur réelle. |
| Deux points affichés comme trois niveaux | Deux points donnent deux lignes : niveau haut et niveau bas. La situation intermédiaire est décrite comme « Entre les deux niveaux », sans créer de troisième point. |
| Grande cuve avec points éloignés | Proposition d’un capteur horizontal par point si l’accès latéral est possible et si les conditions renseignées le permettent. La scène dessine chaque capteur ; le moniteur présente ses états. |
| Proportions du LS05 | Gabarit inox représentatif : tige Ø12mm, flotteur Ø32mm × 19mm, à échelle uniforme. La largeur de cuve est indicative et proportionnelle à sa hauteur ; elle ne reste plus plafonnée à 240mm lorsque la hauteur augmente. |
| Erreur au redimensionnement en continu | Hauteur de fixation et longueur de tige suivent le même arrondi et la profondeur disponible. Un aller-retour entre petites et grandes cuves ne laisse plus de dépassement artificiel sous le fond. |
| Unité du questionnaire | Hauteur saisie en cm, avec conversion en mm dans les données et exports. Exemple : 190cm devient 1900mm. Les seuils du configurateur restent en mm. |
| Question sur la course | « Le liquide peut-il faire des vaguelettes ? », avec réponses sur un niveau stable ou de petits mouvements à ignorer et un exemple de réservoir qui bouge/pompe qui démarre. |
| Capteur illisible dans une grande cuve | Vue d’ensemble, vue du capteur, zoom et déplacement. Cliquer un repère cadre sa zone. Un capteur compact dans une cuve haute s’ouvre en vue rapprochée. Les dimensions du produit ne changent pas avec le zoom. |

## Modèle et limites documentaires

- La hauteur maximale de l’aperçu est portée à 10m, indépendamment de la limite
  de tige présentée de 2m. Cette limite d’interface n’est pas une limite de cuve
  homologuée. Le continu sur toute une hauteur supérieure à 2m renvoie à une étude
  spécifique, sans afficher une lecture complète fictive.
- Pour des points multiples, le premier point illustre une détection basse ; les
  suivants une détection haute à leur hauteur respective. Les états intermédiaires
  ne sont pas comptés comme des points supplémentaires.
- Les capteurs horizontaux ont des sorties distinctes ; un ensemble de capteurs
  horizontaux n’est pas présenté comme une sortie à résistances déjà définie.
  La quantité et les intentions par point sont reprises dans le dossier exporté
  `sensor-studio.level-preview.v3`. Le choix câble/connecteur s’applique à chaque
  capteur de l’ensemble illustré.
- Le gabarit LS05 se situe dans les plages de la fiche locale
  `datasheet-fluid-level-sensor-series-ls05.pdf`, page 1 : tige Ø7–16mm,
  flotteur Ø23,5–38,3mm et hauteur 11,7–26,3mm. Il ne représente pas une référence
  détaillée validée. L’ancien Ø8mm était dans la plage, mais l’étroitesse fixe de la
  cuve et l’absence de zoom accentuaient l’impression d’échelle incorrecte.
- Les dégagements des capteurs horizontaux servent à empêcher les collisions de
  l’enveloppe illustrée ; ils ne remplacent pas une spécification de montage du BE.
  La compatibilité chimique, les cotes de commutation et le codage restent à confirmer.
- Une correction proposée doit effectivement résoudre la géométrie : pas de boucle
  d’agrandissement au-delà des possibilités de la tige ni d’action « adapter la tige »
  proposée pour des points qui restent trop éloignés.

## Vérification

Contrôles sur l’état final : 2396 tests réussis, 1 test Blender ignoré, aucun échec
(2397 tests dans 189 fichiers, 389343 assertions). Vérification TypeScript et
construction de production réussies. Les contrôles de charte ne relèvent aucune
nouvelle dérogation ; seuls subsistent les matériaux Three.js, la balise de thème
et les primitives non migrées déjà admises par la charte.

Les tests dédiés couvrent les conversions cm/mm, les redimensionnements successifs
dans les différents montages, les alternatives horizontales et leur espacement,
le nombre exact de seuils du moniteur, la séparation des repères à toutes les
tailles d’écran testées et les proportions du gabarit. Les traductions des nouveaux
libellés couvrent les sept langues du site en plus du français.

Vérifications visuelles effectuées sur l’aperçu local :

- Cuve de 190cm et cadrage d’un capteur compact en partie haute.
- Continu dans une cuve de 490mm : tige et flotteur inox, moniteur à mi-hauteur.
- Deux points rapprochés à 29 et 34mm : deux repères séparés et deux seuils affichés.
- Cuve de 3m, capteurs horizontaux à 50 et 2950mm : vue générale, vue rapprochée
  du capteur haut et état de détection après remplissage.
- Navigation et absence de débordement horizontal sur une largeur de 390px.

Le parcours de proximité est couvert par la suite d’intégration ; les observations
visuelles ci-dessus concernent l’aperçu local du parcours niveau. Le lien du banc
local vers le parcours principal ne sert pas de validation de l’application authentifiée.

La simulation reste une illustration du besoin, sans qualification physique du produit.

## Réception dans Lovable et publication

Les contrôles locaux ci-dessus ne prouvent pas la mise à jour de l’aperçu Lovable
ni celle du site publié. Au diagnostic du 25 novembre 2026, GitHub `main` contient
les corrections dans `cbdacb703cc505fb6608dfb6156f90b8a745cbf6`, tandis que Lovable
signale encore `a8ac8d4bdb6dd1bbe7835f665f2107c37f1c67c5` et un commit de retard.
Lovable confirme également l’absence de modifications locales hors commit.

Cette mise à jour documentaire est livrée dans une pull request distincte pour
permettre au propriétaire de déclencher un nouvel envoi par sa fusion. Elle ne
constitue pas une confirmation de rétablissement de la synchronisation.

Après fusion, vérifier successivement :

1. Le dépôt connecté reste `thomasloarec/sensor-assistant-studio`, branche `main`,
   et le statut Git n’indique plus de commits GitHub en attente de récupération.
2. Le code reçu par Lovable inclut le commit de corrections ci-dessus et ce fichier.
   Un statut actualisé seul ne remplace pas la vérification du code reçu.
3. L’aperçu est reconstruit avec ce code ; compilation, tests pertinents et
   scénarios visuels de la section précédente sont vérifiés dans cet environnement.
4. Le propriétaire teste l’aperçu, puis décide de publier. Contrôler ensuite
   séparément `https://sensor-pal-tester.lovable.app`.

Si la réception reste bloquée, conserver les identifiants de commits et le statut
Git pour le support Lovable. Ne pas recréer les corrections, réécrire l’historique
ou déconnecter le dépôt pour contourner ce retard.
