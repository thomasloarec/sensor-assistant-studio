# Atelier MVP — recette du 29 octobre 2026

## Changements

- Écart minimal après orientation ; retrait de la démonstration supplémentaire et du pivot avant import. Migration des anciens préréglages pivot sans machine, sans toucher aux montages importés.
- Circuit et contacts transparents suivent la borne la plus sensible documentée : jaune et vert nominaux ferment ; positions invalides indisponibles. A conserve la seule borne prudente. La légende ne promet aucune commutation réelle.
- Repère du centre magnétique estimé dans la scène. Un recouvrement du boîtier avec le volume ne signifie pas que ce centre est dans le volume.
- Bride de l’aimant vers l’extérieur en approche D3 à +90° ; aucune modification des poses importées.
- Calibration, contours, collision et verdicts de placement inchangés.

## Recette

2 101 tests passent (138 fichiers), TypeScript et build réussis. Inventaire i18n vide : trois textes ajoutés dans les huit langues, 3 938 entrées. Scans de charte sans nouvel écart ; seules les occurrences préexistantes theme-color, matériaux Three et primitives ui demeurent.

Contrôle numérique des huit combinaisons disposition × orientation × mouvement, 257 positions chacune : circuit cohérent avec l’appartenance nominale jaune/verte. D3 à 3 mm : jaune, fermé. Passage perpendiculaire : deux fenêtres distinctes sur un trajet simple, pour les deux dispositions. Centre perpendiculaire : ouvert. Chevauchement : indisponible. Tests de migration et de pose importée préservée.

Vérification visuelle locale MK04/M04 B : D3 approche à 3 mm fermé ; rotation +90° centrale ouverte et bride extérieure ; passage latéral à 17 % fermé, centre à 25 % ouvert, seconde fenêtre à 33 % fermée. Colonne simplifiée et repère visibles.

## Réserve explicite — demande de trois activations parallèles

Le modèle actuel MK04/M04 B ne fournit qu’une fenêtre centrale sur le passage parallèle rectiligne sans chevauchement. À 0,25 mm de jeu (centre transversal 14,15 mm), le maximum extérieur vaut environ 1,032 mT contre 1,35 mT de seuil bas. À 8 mm de décalage, les lobes secondaires atteignent environ 1,47 mT, mais le trajet central traverse le corps. Ce constat porte sur le modèle et son enveloppe, pas sur une mesure physique. Il ne permet pas de promettre trois activations sans modifier le montage, sa géométrie ou le modèle. Aucune activation n’est forcée pour satisfaire cette attente ; la demande reste partiellement ouverte sur ce point.

Aucune publication et aucun appel de développement Lovable payant pour ce lot.
