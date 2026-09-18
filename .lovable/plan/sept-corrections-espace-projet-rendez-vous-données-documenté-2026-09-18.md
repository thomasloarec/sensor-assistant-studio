# Sept corrections — espace projet, rendez-vous, données documentées, identité de projet

Tout reste en aperçu privé : aucune publication, aucun envoi réel, aucune donnée client réelle
créée. Le travail « annuaire de détection » et la règle de compatibilité de forme déjà livrés
sont préservés tels quels.

## 1. Vrai calendrier de rendez-vous (démonstration)

`src/components/leadmagnet/booking-dialog.tsx` : remplacer la rangée de boutons de jours par
une grille lundi→vendredi, avec en-tête de mois, navigation semaine précédente/suivante et
mois précédent/suivant. Les jours passés ou hors plage restent désactivés. L'affichage et la
sélection des créneaux horaires existants, le récapitulatif et la confirmation ne changent pas.
Le calendrier reste une démonstration : aucun agenda n'est lu ni écrit.

## 2. Retrait du long bandeau de démonstration

Supprimer exactement la phrase « Mode démonstration : les créneaux affichés sont des exemples,
pas les disponibilités réelles de votre responsable. Choisir un créneau n'écrit dans aucun
agenda. » La confirmation conserve une mention courte et vraie (aucune invitation envoyée),
sans jamais laisser croire à une réservation d'agenda réelle.

## 3. Bouton d'envoi qui ne débordait plus

`review-submit-control.tsx` : après un envoi confirmé, le bouton porte un libellé court
(« Projet envoyé »), avec largeur contrainte et texte tronqué proprement ; toute explication
longue passe dans le bloc d'état voisin, qui retourne à la ligne. Le libellé avant envoi et
« Envoyer mes modifications » restent inchangés.

## 4. Noms de projet automatiques plus courts

`suggestedProjectTitle` : titre court et lisible (première intention utile, ~6 mots / 48
caractères, sans coupure en milieu de mot). Les titres déjà enregistrés ne sont pas réécrits :
l'affichage passe en retour à la ligne (ou troncature + infobulle) pour rester lisible sur
mobile comme sur ordinateur, avec une taille de titre responsive.

## 5. Plages documentées : diagnostic et correction

Cause réelle mesurée dans les données :

- La brochure d'activation 10/2025 ne publie **que** MK03, MK04, MK05, MK06-4…8, MK07, MK12,
  MK13, MK15, MK16, MK17, MK21. **MK01 (Form C) n'y figure pas** : aucune plage n'existe, ni
  pour la famille, ni pour une variante. Le message « distance non caractérisée » n'était donc
  pas faux — il était **imprécis** : il ne disait pas *pourquoi*. Aucune valeur Form C ne sera
  inventée, et aucune plage MK15/MK17 ne sera transférée sur MK01.
- Second défaut, celui-là réel : la plage n'est lue que si `workshop.guideReference` est déjà
  renseigné. Un couple ouvert sans passer par une carte de couple (pose d'atelier par défaut,
  changement de capteur ou d'aimant à la main) restait sans référence, donc « illustratif »
  alors que la brochure publie bien une plage. C'est ce qui distinguait TEST1 de TEST2.

Corrections :

1. Initialisation de la pose documentée par défaut : dès qu'un couple capteur/aimant
   compatible est documenté, la sélection par défaut (variante + approche, D1 sinon D3 sinon
   première imprimée) est renseignée automatiquement, y compris à l'ouverture de l'atelier et
   au changement de capteur ou d'aimant. Une sélection déjà explicite n'est jamais réécrite.
2. Message honnête et nommé quand rien n'est publié : « la brochure d'activation
   (édition 10/2025) ne publie pas de plage pour cette famille » avec le nom de la source,
   au lieu du message générique. Une pose réellement déplacée par l'utilisateur continue
   d'afficher la mention illustrative habituelle.
3. Les colonnes « up » / « to » restent documentaires : jamais converties en seuils
   d'enclenchement ou de relâchement, jamais triées, jamais moyennées.
4. Report cohérent de cette sélection dans l'essai enregistré, le résultat, le rapport et le
   PDF, à la réouverture comme après réinitialisation.

## 6. Six questions reformulées

Nouvelles paires catégorie + question, dans cet ordre : Application ; Élément à détecter ;
Mouvement et détection ; Montage ; Électrique ; Environnement. Les clés de dossier restent
identiques (`detection_goal`, `states_motion`, `mounting`, `envelope`, `electrical`,
`environment`) : les réponses déjà enregistrées ne sont ni perdues ni déplacées. Aucune
question de volume, de durée de série ou de calendrier parmi les six — elles restent dans
« Avec Standex ». Les dimensions ne sont demandées qu'une fois : une saisie structurée
L/l/H en mm, facultative, sous Montage ; le texte de Montage ne parle que de position et de
fixation. Exemples, extraction, libellés de rapport et tests suivent.

## 7. Nom du projet et identité stable dans le PDF

- Le nom du projet est écrit **en tête** du PDF téléchargeable.
- Identité : le projet possède déjà un identifiant unique persistant côté client, conservé tel
  quel dans le contenu enregistré en base à la soumission. On en dérive une **référence courte
  lisible et stable** (même projet = même référence, avant comme après envoi, à chaque export
  et à chaque nouvelle version). Elle apparaît dans l'en-tête du PDF, dans le nom du fichier
  téléchargé, et dans la liste/recherche des projets côté administration.
- Aucun nouvel identifiant n'est fabriqué par export ni par renvoi. Un brouillon téléchargé
  avant envoi se retrouve sous la même référence après envoi.
- Aucune migration n'est nécessaire : l'identité existante suffit. Rien n'est présenté comme
  « enregistré en base » avant qu'un envoi réel l'ait été.

## Vérifications

`bun test tests/` (suite complète actuelle, ~1 047 tests), `bunx tsgo --noEmit`, `bun run build`,
plus des tests ciblés nouveaux : calendrier (navigation semaines/mois, créneaux futurs),
libellé d'envoi court, titres courts, résolution de plage documentée sur tous les couples
compatibles du guide (défaut, lecture, pose déplacée, réinitialisation, réouverture, résultat),
absence de plage MK01 correctement nommée, mapping des six questions sur réponses anciennes,
référence de projet stable entre brouillon, export FR/EN et envoi.

## Limites annoncées

- Le calendrier reste une démonstration : aucun agenda réel, aucune invitation.
- MK01 · Form C, MK02, MK11, MK14, MK20, MK22, MK24, MK30, MK31, MK36–38 ne sont pas publiés
  dans la brochure : ces couples resteront sans plage documentée, par fidélité à la source.
- Aucune migration SQL appliquée dans ce lot.
