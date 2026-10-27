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
- Distances documentaires désormais branchées pour D1/D3/D4 canoniques uniquement, depuis les valeurs figées du CSV passe3. D4 corrigée avant floor 0,5 mm. Aucun maximum oblique/importé ; D5 non proposé dans les préréglages actuels.
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

Le lot initial reste ouvert pour collision montage vérifiable, chronologie/clip importés et convergence volumique ; les corrections de la revue ci-dessous sont intégrées. La recette staff finale est prise en charge par Thomas, pas bloquée sur la session sandbox.


## Revue indépendante cb43c203 intégrée — preuves nouvelles
Les 16 tests historiques restent **16/151 assertions**, ils ne couvrent pas à eux seuls cette revue. Nouveau fichier `tests/pedagogical-review-2026-10-27.test.tsx` : **11 tests / 312 assertions** ciblées.

1. **Disponibilité** : profils/données périmés, intégration inconnue, matériau voisin donnent zéro cellule/coupe/nœud. G idem. Rendu masque immédiatement résultats même avant effet React ; cache et worker vérifient clé et périmètre. Chronologie keyed est masquée dès changement ; montage importé masque volumes, coupe et ancienne timeline.
2. **Suggestions effectives** : D1 approche/tilt nul uniquement, candidat vérifié via `pedagogicalFrame(candidate,progress)` et `evaluatePlacement`, bornes latérales déclarées respectées. Slide/D3/pivot/import refusés explicitement (aucune proposition sans effet). Tous changements pédagogiques orientation/décalage/course gardent le temps via `keepTime:true`. Proposition/apply/undo ne remettent pas le curseur à zéro.
3. **Recontrôle staff** : intention d'ouverture conservée pendant loading, rendu démonté jusqu'au nouveau grant serveur. Brouillon config/settings/progress dans parent en mémoire, remonté seulement au remontage autorisé. Erreur/refus effacent brouillon et intention ; changement compte remonte Bench et gate avec clé `user.id`. Aucun rôle local, session fictive ou maintien d'autorisation pendant attente. Test différé confirme masquage puis réouverture après grant et fermeture après refus.
4. **Collision/mouvement** : collision réelle du cylindre pilote N45 à [0,5,0] testée, paramètre montage transmis au point/chronologie pure ; collision inconnue vaut indisponible. Sans clip chargé/supporté ou mouvement confirmé, pas de verdict statique de repli. Les solides GLB restent non vérifiables : cause explicite et résultats masqués, **pas une implémentation de collision GLB certifiée**. Aucune dimension catalogue utilisée pour le pilote.
5. **Chronologie** : tous points conservés, largeur = delta t, aucun filter(i%4). Mention toujours visible « résolution des traversées non certifiée » même lorsque les événements trouvés sont précis. Trois échantillons égaux ne sont plus présentés comme preuve d'absence de passage rapide.
6. **Histoire synthétique** : response null/non finie invalide l'état historique ; reste unknown entre Toff/Ton jusqu'à réponse ≥Ton ou ≤Toff. Test indépendant concret.
7. **Présentation** : pas de badge distances fictives, pas d'aria Contact ouvert/fermé dans le mode. Groupe accessible avec commandes 3D/coupe, état et cause séparés. Capacité estimée/réouverture non caractérisée. Aimant initial visible ; légende dans le flux sous timeline à 1920×960 et 390×844, aucun débordement horizontal, zéro pageerror (captures isolées revues).
8. **Distances UI** : `conservativeDistance` réellement appelé via `documentaryDistances`, données figées dérivées du CSV source et testées ligne par ligne. Libellé/périmètre/source exacts repliables, seuil A unique, données absentes ne donnent pas zéro. Les maxima D4 ne sont jamais portée du point courant, volumes restent non corrigés.
9. **Reprise mémoire** : validation kind/version/profil/paramètres/progress, anciens profils marqués périmés et sans calcul. Message honnête mémoire/GLB à réimporter ; aucun enregistrement automatique dans projet. Le JSON ne récupère aucune autorisation ni ne transmet le GLB/clip.
10. **Surfaces** : indices topologiques i/j/k remplacent largeur locale pour voisins ; test aux ruptures .25/1 enlève les deux faces internes. Cellules non nulles aux frontières détectées ; avertissement lobes tronqués ±24 mm, aucune fermeture silencieuse revendiquée. Domaine inchangé, pas de recalibration.
11. **R08 renforcé réel** : parsing `demo-bras-anime.glb`, clip Cycle_complet supported, attache Levier, pose monde différente à25% ; export/reprise stricts conservent attache, échelle1000, clip et pose exactement au même .25, puis non-disponibilité montage vérifiée. Ce n'est plus le simple wall JSON. Réimport UI local reste à vérifier par propriétaire.

### Preuves navigateur du propriétaire (rapportées, non réexécutées ici)
Thomas confirme staff authentifié ; N45 t33.3%, y16.008 : x0 défavorable/orientation, x8 favorable. Volume189679 positions, SmCo3.64s/N451.49s ; coupe fonctionnelle. Vrai demo-bras-anime.glb avec clips ; JSON progress.25 et Cycle_complet conservés. Pas de reprise UI vérifiée (restriction fichiers locaux de l'extension). Aucun besoin de contourner auth ou de modifier backend.

### Vérifications finales de cette revue
- Suite COMPLETE : **1963 pass / 0 fail**, 126 fichiers, **143706 assertions**, 108,50s, après dernières éditions code.
- Types/compilation automatique plateforme : **build OK 2026-10-27T11:38:25Z** (inclut typecheck). Commandes build/typecheck manuelles non exécutées selon règle plateforme.
- Inventaire huit langues : **TOTAL0**, 11 nouvelles clés×7 traductions, aucune exemption UI ; complétude suite verte.
- Scans : zéro couleur brute/texte interdit nouveau ; six hex préexistants (matériaux connecteur/theme-color) et six durées primitives non migrées préexistantes, non retouchés.
- Rendu isolé du vrai composant, 1920×960 et390×844 : 189679 positions en **2,37s SmCo** ; case matériau voisin ⇒ **0 rect SVG**, état indisponible ; décochage retrouve le résultat valide courant. Légende visible, zéro pageerror/débordement. Captures revues sous `/tmp/browser/pedagogical/`. Ces preuves ne remplacent pas votre recette staff authentifiée.
- Pas de recalibration, sources/profils1.1/pass2/pass3/catalogue inchangés ; aucun changement DB/auth/publication ni aux contrôles de consommation. Enregistrement du checkpoint géré par plateforme, pas de commande Git stateful.


## Complément profondeur minimale — 11:41 UTC
Le curseur **Profondeur minimale** règle `end` de1 à24mm par.25mm, conserve la course en décalant `start` et passe par le même `update(...,{keepTime:true})`. Il ne modifie aucun seuil/physique. Les réglages centré/décalé sont désormais accessibles à profondeur6mm SmCo et16mm N45.

Deux tests supplémentaires montent les vrais **PedagogicalControls**, actionnent profondeur puis décalage, vérifient profondeur effective via adaptateur, neuf hypothèses, état affiché et temps. SmCo ày6 : x0 défavorable/orientation, x6 etx8 favorables. N45 ày16 : x0 défavorable/orientation, x8 favorable. Le temps reste.5 ; pas de pose test inatteignable. Sélecteur d'aimant nommé explicitement pour accessibilité.

Navigateur isolé du vrai MagneticWorkshop : curseur cycle50%, profondeur6 SmCo puis16 N45, x0→x8, états défavorable→favorable dans les deux cas ; **curseur reste50**. Captures revues `depth_SMCO5-5X4.png`, `depth_N45-4X19.png` sous `/tmp/browser/pedagogical/`. Zéro pageerror/débordement. La capture N45 est prise pendant recalcul des volumes, pas revendiquée comme mesh final. Aucun accès staff contourné ; la recette authentifiée demeure celle du propriétaire.

Vérification finale après toutes éditions code : **1965 tests pass /0fail**,126fichiers,143749assertions,122.90s. Tests revue+complément :13pass/332assertions. Inventaire8langues TOTAL0 ; une clé traduite×7langues. Types/compilation plateforme **build OK11:45:57UTC**. Scans couleurs/classes interdits vides ; exceptions hex/durées préexistantes inchangées. Aucun backend, publication, recalibration ni changement des contrôles de consommation.

## Montage importé (base 3c45a4f8)

- Un montage importé n'est plus masqué : point, volume, coupe et chronologie sont calculés par `evaluatePose` à partir des boîtes englobantes (OBB) de CHAQUE pièce du fichier réellement chargé (même `assetKey`/échelle), posées par `pointAt`/`cycleU`/`partDelta` au même instant que la scène, clips rigides compris.
- Le corps COMPLET du pilote (N45 Ø4×19, SmCo Ø5×4) est testé ; la capsule Form66 est signalée si elle est dans une enveloppe. Dégagé → verdict physique ; recouvrement → « chevauchement possible, à vérifier » (indisponible, cause `overlap`), jamais une collision certaine. Une boîte ne représente ni surface ni trou.
- Sans fichier chargé, clip absent ou mouvement non confirmé : indisponible (`asset`/`clip`/`motion`). Le JSON reste mémoire ; à la reprise, la géométrie est recalculée depuis le GLB, aucun résultat ancien n'est réutilisé.
- Chronologie importée : 513 instants préparés dans l'onglet, transitions jamais certifiées, pas d'hystérésis inventée. Volume ±24 mm : ~3–3,6 s en worker annulable.
- Attaches/alignement en mode pédagogique utilisent les corps pilotes (non sérialisés), jamais les dimensions catalogue.
- Preuves : `tests/pedagogical-imported-2026-10-27.test.tsx` (bras animé réel avec attache mobile à 25 %, reprise + rechargement GLB identiques ; paroi réelle ; unités 1000/1 ; N45 long traversant une boîte ; trou = chevauchement possible ; coupe/volume/point identiques ; polarité ; rotation rigide globale ; états absents/périmés). Suite complète 1 974 tests, types, build, i18n et charte OK.
- Non vérifié : recette staff authentifiée dans le navigateur (réservée à Thomas), solides exacts (au-delà des boîtes), matériaux ferromagnétiques du fichier (réglage manuel seulement).

## Revue 86e82ae5 (corrections)

1. Reed : la capsule réelle (16,2 × Ø2,2 mm, pas la longueur magnétique) est testée contre les boîtes à chaque instant ; recouvrement → indisponible, cause « chevauchement possible du reed, logement à vérifier » (point, volume sans aucun lobe, coupe, chronologie). Hypothèses ±1 mm : le reed déplacé est aussi contrôlé (cause `scenario_overlap`) ; le libellé sépare robustesse magnétique et dégagement.
2. Six cas par pilote : SmCo profondeur 6 mm, N45 16 mm ; centré/décalé (x0/x8) à même profondeur et même instant ; parallèle/oblique/classe E sans collision ; traversée (SmCo décalage 6, course 20 ; N45 16, course 24) passe favorable → défavorable central → favorable. Temps conservé. En glissement, Profondeur/Course pilotent offset/travel et le décalage latéral sans effet est retiré. Cas masqués pour un montage importé.
3. Repère : profondeur = centre aimant → repère reed, différent de face → repère brochure (note affichée). Distances repliées, « borne prudente » / « borne haute indicative », « maximum du lobe documenté, pas une portée dans la position affichée » ; up/to brut seulement dans Provenance ; correction D4 et arrondi inchangés.
4. Chronologie : clé = réglages + configuration + identité + empreinte du contenu des boîtes + génération de chargement du clip ; un rechargement du même identifiant masque immédiatement l'ancien résultat.
Recette staff navigateur : non effectuée de mon côté (Thomas).

## Complément de recette 86e8 (12:34)

- Réouverture : le recentrage automatique des composants n'a lieu que pour un NOUVEL import non positionné (fichier différent). Réouverture, remontage après revalidation staff, rechargement du GLB et reprise d'un brouillon (clip ou non) gardent les positions explicites, le temps, le profil et les réglages. Test React réel (`tests/pedagogical-reopen-pick-2026-10-27.test.tsx`) : bras animé (clip, mouvement non confirmé, aucune pièce mobile), reed [0,200,0] / aimant [6,206,0] à 25 %, deux cycles montage → chargement du GLB → démontage → réouverture. Contre-épreuve : ce test échoue sans la correction.
- Pointage : `handlePick` et `handleHoleRay` reçoivent les corps pilotes. Test du vrai guide (axe d'un trou, deux points) : la pose finale égale la chaîne pilote et diffère de la chaîne catalogue. Remarque honnête : la normalisation centrale (`machineChange` → `applyAttachments` avec les corps pilotes) corrigeait déjà la pose finale, si bien que ce test passe aussi sans la correction ; il garantit le résultat, la correction supprime l'incohérence intermédiaire.
- Authentification inchangée ; recette staff navigateur non effectuée de mon côté.
