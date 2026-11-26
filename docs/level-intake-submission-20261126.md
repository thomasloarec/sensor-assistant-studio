# Niveaux initiaux, câbles et envoi — 26 novembre 2026

## Demande et comportement

Le cas du purgeur automobile (liquide de refroidissement, 5–40 °C, accès haut,
cuve de 25 cm, niveau bas, vaguelettes) pouvait produire une course impossible à
1,25 cm du fond. Q4 ne demande plus de hauteur pour un unique niveau haut/bas.
La proposition est contrainte par les dégagements et reste modifiable dans le
configurateur. Ce cas propose un LS04, seuil à 5 cm (20 %), tige de 22,3 cm,
course illustrative de 3,4 cm. Les anciens champs simples ne pilotent plus la
proposition ; le questionnaire multi-niveaux conserve les hauteurs demandées.
Un repli vers le compact à course longue traite aussi les petites cuves de 6 cm.

La question d’immersion du corps reste inchangée : elle documente l’exposition
prolongée des matériaux, tandis que l’immersion de la sortie du câble est le
critère qui demande une construction spécifique. Elle n’a pas été supprimée
sans demande explicite.

## Longueurs documentées

Les cinq fiches série v02 du 05 mars 2019, page 1, indiquent les longueurs
500 / 1000 / 5000 mm, affichées comme 50 / 100 / 500 cm. Les longueurs ne
constituent pas une validation de référence commandable.

- [LS01](https://standexdetect.com/wp-content/uploads/sites/2/2025/09/datasheet-fluid-level-sensor-series-ls01.pdf)
- [LS02](https://standexdetect.com/wp-content/uploads/sites/2/2025/09/datasheet-fluid-level-sensor-series-ls02.pdf)
- [LS03](https://standexdetect.com/wp-content/uploads/sites/2/2025/09/datasheet-fluid-level-sensor-series-ls03.pdf)
- [LS04](https://standexdetect.com/wp-content/uploads/sites/2/2025/09/datasheet-fluid-level-sensor-series-ls04.pdf)
- [LS05](https://standexdetect.com/wp-content/uploads/sites/2/2025/09/datasheet-fluid-level-sensor-series-ls05.pdf)

Le catalogue partagé conserve les longueurs MK existantes. Les choix standard,
sur mesure et indécis sont distincts ; une valeur masquée n’est pas envoyée.

## Revue commune

La page niveau réutilise la revue DesignSpace en mode reviewOnly. Elle garde
les mêmes composants NDA, coordonnées, détails projet, consentements et envoi.
La revue reste montée lors des retours de navigation pour préserver les champs,
la révision et le contexte serveur. Les modifications techniques changent
l’empreinte du contenu et rendent les anciens consentements inapplicables.

Le nouveau bloc versionné levelStudy transporte les choix bruts, jamais une
qualification ou autorité NDA. Le parseur serveur les conserve. Le PDF complet,
sa pièce jointe JSON, le résumé d’envoi et sa version anglaise reprennent le liquide, les conditions,
la géométrie, les seuils cm/% et le câble. Aucune migration ni modification des
règles d’accès serveur. Aucun projet ni e-mail de test réellement envoyé.

## Vérifications

- Tests de démarrage : haut/bas, accès libre/haut/fond/latéral, liquide stable ou
  vaguelettes, hauteurs 6/10/25/200/1000 cm, anciens objectifs impossibles.
- Tests de parcours : absence des champs simples en Q4, maintien des champs
  multi-niveaux, ajustements cm/%, longueurs standard, boutons d’envoi et PDF,
  coordonnées conservées au retour, câbles masqués exclus.
- Tests de dossier : aller-retour serveur, champs inconnus ignorés, absence de
  qualification importée, validation de l’instantané avec consentement, refus
  après changement de câble et refus sans NDA requis en vigueur.
- Contrôle visuel local du cas purgeur : questionnaire, configuration LS04,
  choix standard 100 cm, revue commune. Écran bureau et 1366 × 768 sans
  débordement horizontal. L’aperçu local isole les fonctions serveur ; la
  compilation de production utilise les fonctions réelles.
- Version anglaise : les champs libres du parcours niveau entrent dans les
  segments traduits ; le rapport conserve les valeurs du câble et des niveaux
  sans les estimations de trajet du parcours magnétique.
- PDF téléchargé depuis l’interface, rendu et relu sur ses trois pages A4.
  Le texte et les valeurs restent lisibles, sans ligne isolée sur page vide.

Les validations automatisées finales sont consignées dans la PR.
