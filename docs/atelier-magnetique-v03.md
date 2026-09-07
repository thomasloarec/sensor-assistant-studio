# Atelier magnétique V0.3 — orientations et machine importée

Version du 7 septembre 2026. Cette version applique la demande de distances fictives pour la démonstration ; elle conserve séparément l'exemple Standex à valeurs typiques.

## Essayer la machine à café

1. Dans l'atelier, cliquer **Ouvrir la machine à café**. Un MK24 Form A J et un aimant fictif sont déjà placés pour un premier essai.
2. Télécharger **le fichier 3D**, puis utiliser **Importer mon fichier GLB** pour reproduire le parcours d'un utilisateur. Le fichier est autonome ; choisir **Mètres · standard GLB** et la pièce **Bac_mobile**.
3. Ouvrir le catalogue. Le MK24 de 5 mm tient dans le gabarit déclaré de 12 × 8 × 12 mm ; le MK03 de 25,5 mm le dépasse. Les dimensions du capteur ne sont jamais adaptées artificiellement à la machine.
4. Cliquer **Placer le capteur** ou **Placer l'aimant**, puis sur une surface. Le composant s'aligne sur la face et se rattache automatiquement au châssis fixe ou à la pièce mobile touchée. Les flèches de déplacement, les anneaux de rotation et les coordonnées permettent d'ajuster la pose. Les coordonnées sont validées en quittant le champ ou avec Entrée.
5. Régler le support de chaque composant et le mouvement : translation XYZ ou rotation autour d'un pivot XYZ. L'édition se fait pièce fermée.
6. Lancer le cycle ou déplacer le curseur. L'exemple commence contact fermé, s'ouvre pendant la sortie du bac et se referme au retour. Décocher **Boîtier opaque** et utiliser **Zoom sur le capteur** pour voir les contacts internes.
7. **Mesurer** permet de cliquer deux surfaces et d'afficher leur distance en mm et cm. Le gabarit compare le corps au volume disponible renseigné par l'utilisateur, dans les axes locaux du capteur.
8. **Joindre au dossier** conserve le réglage ; **Exporter** conserve un JSON. Pour une machine personnelle, conserver également son GLB : la géométrie reste locale au navigateur et doit être réimportée sur un autre poste.

Le fichier `public/models/machine-cafe-bac-mobile.glb` décrit une machine fictive de 232 × 330 × 261 mm, avec un châssis, un bac distinct et un support pour le capteur. Le bac coulisse de 130 mm sur Z. Modèle créé pour le projet, sans CAO commerciale ni image générée. Régénération : `node scripts/generate-coffee-machine.mjs`.

## Orientations et réponse pédagogique

Les approches D1 (face au centre) et D3 (par l'extrémité) disposent désormais des mêmes réglages : rotation du boîtier, inclinaison hors du plan, aimantation dans la longueur X, la largeur Z ou l'épaisseur Y, inversion N/S et décalage latéral. Le changement d'orientation quitte la table de référence et passe à la démonstration fictive. Le nom D1/D3 indique alors le côté d'approche ; les axes ne sont plus nécessairement parallèles.

Standex montre que la position, l'orientation et le mouvement modifient les domaines d'activation et peuvent produire une ou plusieurs commutations. Les distances varient avec le reed et l'aimant. Les configurations consultées n'apportent pas de cartographie universelle pour les nouvelles orientations. Sources : [Magnet Interaction](https://standexdetect.com/resources/reed-technology-academy/magnet-interaction/) et [Reed Sensor Activation Guide](https://standexdetect.com/wp-content/uploads/sites/2/2025/10/brochure-reed-sensor-activation-guide.pdf), consultées le 07/09/2026.

Le modèle illustratif utilise un dipôle adouci, une moyenne signée de sept projections longitudinales dans le reed, puis la valeur absolue avec hystérésis 1 / 0,72. Il conserve les annulations directionnelles et les lobes décalés. Pour le reed Form A non polarisé représenté, inverser simplement N/S conserve le résultat ; tourner l'axe de 90° peut le modifier. Un axe perpendiculaire exactement centré peut laisser le contact ouvert : le bouton **Explorer un lobe décalé** fournit un exemple d'activation hors axe. Ces zones sont illustratives, pas une reconstruction mesurée du capteur.

En unités géométriques mm : r = point − centre aimant, d² = r·r + 16, B = R³ / d³ × (3(m·r)r / d² − m). R est le réglage **Échelle du champ fictif**, entre 5 et 100 mm, et ne représente pas une distance d'enclenchement garantie. L'adoucissement de 4 mm évite une singularité au centre. Si l'état initial est inconnu, la démonstration part d'une convention ouverte puis applique le champ et l'hystérésis. Elle n'est plus bloquée par la proximité, le chevauchement, l'acier déclaré ou la température ; ces effets ne sont pas calculés. Le MK02 est explicitement montré avec un contact Form A fictif, distinct de son mécanisme réel à cible ferreuse et aimant intégré.

Les huit cas MK03 + M02 documentés gardent leurs distances typiques et leur gestion d'état inconnu. Le bouton **Animer avec des distances fictives** permet d'explorer un cas indéterminé sans attribuer les distances inventées à Standex.

## Import, géométrie et persistance

- GLB 2 autonome, 30 Mo maximum, sans Draco, Meshopt ou KTX2 obligatoire. Ressources externes refusées ; images intégrées permises. Limite de 1,5 million de sommets et d'une enveloppe maximale de 20 m.
- Convention glTF : mètres, Y vertical ; choix manuel mm/cm/m pour les exports non conformes. Les transformations des nœuds sont appliquées avant de convertir la scène en mm. [Spécification glTF](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).
- La pièce mobile est un nœud ou groupe du fichier. Un assemblage fusionné en un seul maillage doit être réexporté avec sa partie mobile séparée. Les animations intégrées, squelettes, articulations multiples et déformations ne sont pas rejoués.
- Le gabarit n'est pas une détection automatique de collision avec la CAO. Câbles, fixations, jeux d'assemblage, interférences mécaniques et effets des matériaux doivent être vérifiés séparément. Les enveloppes du catalogue sont simplifiées d'après les plans ; les contacts sont symboliques.
- Les GLB personnels sont conservés dans IndexedDB, identifiés par SHA-256. Les notes existantes du dossier stockent le nom, l'identifiant et les réglages, sans envoyer le fichier à un service externe. L'exemple intégré reste accessible depuis tout navigateur.
- Configuration V3 et marqueur `STANDEX_MAGNETIC_WORKSHOP_V3`. Les notes et JSON V1/V2 migrent vers V3 et sont recalculés avec le nouveau modèle pédagogique. Leurs résultats fictifs peuvent donc changer. Les exigences du dossier et la confiance produit restent inchangées.

## Rafraîchissement 3D et recette

Le composant Canvas est conservé lors d'un changement de capteur ou de géométrie ; la caméra est recentrée explicitement. Le gestionnaire de perte de contexte est retiré au démontage : la fermeture normale de l'ancienne scène ne signale plus une panne de la nouvelle. En cas de véritable interruption, le montage simple annonce son repli en vue plane et permet une nouvelle tentative 3D. La machine affiche une erreur de rendu explicite et le même bouton de relance.

56 tests / 305 assertions réussis : huit cas documentés, hystérésis, N/S, axes 3D, annulations et lobes D1/D3, états fictifs de tout le catalogue, rotations conformes au rendu, supports fixes/mobiles, cycle du bac, lecture réelle du GLB, validation des imports, migrations V1/V2/V3 et dossier.

Recette navigateur locale : import du GLB par le sélecteur de fichiers, rechargement et reprise, changement MK24 → MK03 avec dépassement du gabarit, placement sur surface, coordonnées négatives, mesure de deux faces, transparence, états ouvert/fermé, D1/D3, vue plane → 3D, affichage téléphone 390 px. Construction complète, TypeScript et lint ciblé contrôlés avant synchronisation.

## Pour une version calibrée

Les informations restantes ne bloquent pas cette démonstration : références exactes du reed et de l'aimant, classe de sensibilité, localisation des parties actives, nuance et aimantation, jeux et tolérances, matériaux proches et mesures aller/retour sur plusieurs pièces. L'interprétation automatique de la machine par le chat et la résolution magnétique industrielle restent des chantiers ultérieurs.
