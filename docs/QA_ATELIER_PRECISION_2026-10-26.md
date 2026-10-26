# Atelier 3D — installation de précision (26/10/2026)

Base : 4a700f4f. Aucun backend, aucune authentification, aucune publication.

## Parcours
1. **Centrer dans un trou** (capteur cylindrique, « À travers une paroi ») : clic 1 sur la matière de la face d'entrée près du trou — verrouille la pièce support réelle (fixe, mobile ou animée), le plan et sa normale, sans modifier le montage. Clic 2 au centre du trou : le rayon de la caméra est coupé par CE plan (aucun raycast des pièces), même si le rayon passe dans le vide et touche un objet derrière. Disque translucide du plan et repère de centre survolé (le repère ne capte pas le pointeur). Une seule action annulable ; refus (vue rasante, plan derrière la caméra, point hors limites) sans mutation. Échap, « Annuler », changement d'étape, de cible ou de fichier effacent la sélection temporaire. Profondeur, référence, inversion et rotation conservées. Les deux points d'axe restent dans « Options avancées de l'axe ».
2. **Aligner avec le capteur** (aimant posé sur une surface) : à l'instant affiché (lecture mise en pause, temps inchangé), le centre de l'aimant est déplacé dans le plan de sa face de pose jusqu'à la projection du centre du capteur. Pièce, normale, écart, rotation, retournement et support conservés ; le point d'attache est recalculé en pose statique, donc le suivi (coulisse, pivot quelconque, clip rigide) est intact. Fonctionne pour MK24 et tout autre capteur.
3. **Position précise** (étape 4, dépliant fermé par défaut, capteur et aimant) : surface — XYZ du point de pose, deux directions tangentes nommées avec boutons ±0,1/±1 mm, XYZ saisissables projetés sur la face conservée ; traversant — point d'entrée XYZ et normale ; pose libre — centre XYZ avec support indiqué. Repère : coordonnées du fichier en pose statique, mm.

## Limites
- Aucun trou, diamètre ni centre de perçage n'est détecté : le centre est celui désigné sur le plan.
- L'alignement est géométrique : pas de garantie de détection, pas d'axe magnétique caractérisé, pas de coaxialité si le capteur traversant est oblique (signalé). La présence de matière sous le nouveau point de l'aimant n'est pas contrôlée (limite affichée).

## Vérifications
- `tests/machine-alignment-2026-10-26.test.ts` : 16 tests (trou sans matière + objet derrière, même support, plan incliné, rayon parallèle/derrière, annulation, support mobile à mi-course ; alignement plan principal / incliné avec écart-rotation-retournement, pivot arbitraire à mi-course et suivi à d'autres temps, capteur traversant oblique, clip rigide à deux supports, refus, relecture JSON ; tangentes et projection).
- Annuler/rétablir : l'alignement et le centrage passent par `machineChange` (historique existant) ; vérifié comme patch unique, l'interaction annuler/rétablir du composant n'a pas de test dédié.
- Recette navigateur non effectuée pour ce lot.
