# Atelier pédagogique — livraison partielle interne, 27 octobre 2026

Base vérifiée : `91c0dd0b9b591db9afa0ed9dc3104e5b8ef285e8`. Aucune publication, migration, modification DB/auth ou donnée réelle. **Ce lot n'est pas intégralement terminé.**

## Accès et fonctionnel
`/internal` → **Atelier pédagogique**, entrée sous `StaffLabEntry` et contrôle serveur existant, recontrôlé à chaque session. Aucun bypass public. Le vrai `MagneticWorkshop`, `Scene`, `MachineScene`, import mémoire GLB et guide Modèle/Pièces mobiles/Mouvement/Installation/Essai sont conservés.

Volumes nominaux voxelisés pour les centres d'aimant, coupe au z courant, point courant, rotation et déplacements libres, deux aimants pilotes sans alias catalogue. Profil figé lu depuis `src/data/detection-lab/workshop-profile.json`, extrait du résultat passe3 : L=15.63399603080886, k=0.13560548808516593, datum documentaire=3.3340917480896373, retrait documentaire D4=1.4912902832031252. `evaluatePose` est l'unique physique. A n'a qu'une surface ; G indisponible. Hypothèses autour du nouveau nominal, pas de seuil refitté. Anomalies N45 B-up17.3/C-to17.7 conservées avec égalité D1 et statut suspecté.

Export JSON expérimental séparé : paramètres, profil, pose/mécanique, temps courant, limites et besoin de réimport GLB. Aucun actif/clip distant, aucune écriture automatique client. Propositions libres explicites et annulables ; import fixé : suggestions refusées. Chronologie de placement libre adaptative ; pas d'hystérésis électrique inventée.

## Limites non terminées
- Collision du cylindre complet contre capsule : moteur historique inchangé. **Collision des solides GLB non caractérisée : verdict de montage importé forcé indisponible**, pour éviter un faux favorable. Le montage Form66 et l'aimant restent visibles et manipulables via le guide.
- Chronologie importée/clip, résolution géométrique des événements et application de suggestions respectant une liberté de face attachée : non terminées. Aucun détachement automatique.
- Ton/Toff documentés : relecture déterministe pure testée avec pièce synthétique ; aucun sélecteur de pièce documentée branché.
- Lecture de distances documentaires D1/D3/D4/D5 : fonction correction avant arrondi testée, **comparaison de maxima non branchée dans l'interface**. Aucun maximum oblique inventé.
- Raffinement 0,25 mm en x dans |x|≤5, y/z 1 mm : coupe/volume communs, pas interpolation de réponse nulle. Convergence volumique 0,25/0,125 et raffinement des autres directions non terminés ; aspect voxel indicatif.
- Orientation libre pendant lecture : volumes invalidés et en attente, afin de ne pas afficher les lobes d'une ancienne orientation. Deux surfaces nominales ne représentent pas l'accord de toutes les hypothèses.

## Preuves R01–R12
| Recette | Code/tests | Navigateur | Limite |
|---|---|---|---|
| R01 | N45 centré [0,16,0] défavorable ; [8,16,0] favorable, nominal valide | Centré défavorable visible en rendu isolé | Session staff non vérifiée |
| R02 | Rotation continue et égalité réponses coupe/volume/point sur nœuds .25 | 3D et coupe visibles desktop/mobile | Convergence des maillages non complète |
| R03 | Translation globale conserve pose relative | Non fait | Rotation globale/attaches du nouveau mode non couvertes spécifiquement |
| R04 | 9 hypothèses autour Lfit, mêmes seuils, pas de contact prédit | Notice chronologie visible | Pas de tolérance fabricant |
| R05 | A partiel, G, identité M04/M13, matériau, collision/domaine, anomalies | Verrou signé-out vérifié | F limites présentées, pas qualification complète |
| R06 | Pièce SYNTHETIC-TEST-ONLY, Ton2/Toff1, tri temporel déterministe | Non fait | Helper pur uniquement |
| R07 | Traversée multiple et événements non résolus au pas insuffisant | Non fait | Clip/import non branchés |
| R08 | JSON mécanique relu à 25%, échelle et poses | GLB réel chargé via champ fichier en rendu isolé ; curseur disabled car aucune pièce mobile définie | Recette 25%/clip/export/reprise navigateur non terminée |
| R09 | Deux aimants : inversion réponse et état invariants | Non fait | — |
| R10 | Version source/profil change clé et invalide verdict ; worker terminé | Non fait | Cache meshing non instrumenté |
| R11 | Alignement centré peut rester défavorable ; suggestions verrouillées refusées | Non fait | Application attachée non terminée |
| R12 | Base+offset reproduit sinon null ; D4 empirical refusé comme offset boîtier | Non fait | Aucun dérivé catalogue ajouté |

## Navigateur et performance
Recette **authentifiée staff impossible ici** : statut `no_supabase`, mint session refusé (aucun backend géré dans cet environnement). `/internal` signé-out montre Accès réservé, aucune entrée pédagogique, aucune erreur. Aucun rôle/session simulé ni interception réseau.

Rendu isolé par import du vrai composant dans le navigateur (pas recette staff, pas route ajoutée) : 1280×1800 et 390×844, 3D éclairée non vide, coupe lisible, aucun débordement horizontal ni pageerror. Captures sous `/tmp/browser/pedagogical/` : `isolated_desktop_3d.png`, `isolated_desktop_cut.png`, `isolated_mobile_cut.png`, `internal_signed_out.png`. GLB réel `/public/models/demo-paroi-alesage.glb` importé par input ; arrêt de recette sur curseur désactivé légitime sans sélection mobile, pas contourné.

Performance observée : 189679 nœuds, SmCo perpendiculaire, volume complet ~3,01 s dans worker Chromium local ; mesure Bun ~3,03 s. **Pas de promesse <200ms**. Meshing sur fil principal non mesuré ; budget GPU/triangles non certifié.

## Vérifications finales
- Suite COMPLETE `bun test tests/` : **1952 pass, 0 fail**, 125 fichiers, **143141 assertions** (128,16 s), dont 16 tests nouveaux.
- Signal automatique plateforme types/compilation : dernier `build OK` 2026-10-27 11:25:15 UTC. Pas de commande build/typecheck manuelle.
- Inventaire i18n : TOTAL 0 ; 60 clés nouvelles × 7 traductions, suite de complétude et paramètres verte. Aucune exemption UI.
- Scans couleurs brutes et classes interdites : 0. Hex : 6 exceptions préexistantes (theme-color et matériaux connecteur). Durées : 6 exceptions primitives UI préexistantes. Aucun nouvel écart.
- Profil 1.1, pass2, pass3 et sources brutes inchangés. Aucun commit créé manuellement ; enregistrement Git géré par la plateforme.

Le lot reste ouvert pour collision montage, chronologie/clip importés, distances documentaires branchées, raffinement/convergence et recette staff authentifiée complète.
