# Architecture de l’atelier

- Répartir les réglages avancés entre produit, aimant et positionnement pour éviter les doublons et préserver l’accès direct au câble.
- Le modèle importé se règle dans `machine-guide.tsx` (une étape ouverte à la fois) ; `machine-controls.tsx` ne garde que les coordonnées libres, pour éviter les doublons.
- Toute modification de montage passe par `machineChange` : historique annulable, et une pose ou un support modifiés librement libèrent l'attache (`freePosePatch`) au lieu de garder une fausse contrainte.
