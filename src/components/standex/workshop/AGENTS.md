# Architecture de l’atelier

- Répartir les réglages avancés entre produit, aimant et positionnement pour éviter les doublons et préserver l’accès direct au câble.
- Le modèle importé se règle dans `machine-guide.tsx` (une étape ouverte à la fois) ; `machine-controls.tsx` ne garde que les coordonnées libres et le gabarit, pour éviter les doublons et toute commande sans effet.
- Un import de GLB est transactionnel (chargement et validation avant de remplacer montage/historique, dernier import gagnant) et ne touche jamais capteur, aimant ni mode, pour qu'un fichier refusé ne casse rien.
- Toute modification de montage passe par `machineChange` : historique annulable, support d'attache resynchronisé sur la sélection mobile (`syncAttachSupports`), unités rééchelonnées (`rescaleMachine`), et une pose libre libère l'attache (`freePosePatch`) au lieu de garder une fausse contrainte.
