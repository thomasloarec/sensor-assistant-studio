# Recette des corrections atelier — 28 octobre 2026

Périmètre : atelier du workflow client, contrôlé dans l’aperçu local du même composant. Aucun appel de développement payant à Lovable, aucune publication. Les fichiers de calibration des passes précédentes et les données de brochure restent inchangés.

## Huit demandes

| Demande | Correction et contrôle |
| --- | --- |
| Circuit permanent | Suppression du choix « Circuit de principe » dans Affichage. Circuit toujours présent en 3D et en coupe. |
| Contacts visibles | « Voir les contacts » rétablit le boîtier transparent et les lames. Recréation du matériau lors du changement opaque/transparent, nécessaire pour éviter le maintien du programme WebGL opaque. Vérification visuelle ouvert/fermé. |
| Caméra | Le cadrage ne se réapplique plus lors d’un simple redimensionnement de la scène ou d’un changement de bandeau. Vue de dessus choisie manuellement conservée pendant la lecture. Les commandes explicites de recadrage restent actives. |
| Largeur D1 | Morphologie qualitative versionnée, partagée par point, volume, coupe, chronologie et lampe. Largeur utile contrôlée entre 12 et 17 mm pour MK04/M04 B à la coupe testée ; aucune mesure de largeur Standex n’est revendiquée. |
| Pivot | Présélection courte de 30°, avec recherche de dégagement mécanique sur le cycle complet. Préparation visible, progression, annulation et démarrage automatique. Lecture et commutations contrôlées à l’écran. |
| Sensibilité | Sélecteur visible en haut des commandes, hors sections repliées. Changement B/C contrôlé. Les classes proposées restent celles du couple. |
| Approche trop courte | Écart final de démonstration 0,5 mm, réglage simple de 0,25 à 15 mm. MK04/M04 B ferme et rouvre en face-à-face et dans l’alignement, sans collision sur 129 positions de chaque cycle. |
| Circuit binaire | Contact illustratif d’un exemplaire au milieu de la classe AT, ouvert ou fermé jusque dans la bande jaune. Explication de la dispersion ajoutée. Une position non calculable désactive l’illustration avec un libellé explicite ; elle ne fabrique pas un état électrique. |

## Ce que la forme représente

`central-lobe-1` est une hypothèse de morphologie inspirée des schémas fournis par l’utilisateur. Ce n’est ni une mesure, ni un nouveau calcul exact de champ. Elle élargit la coordonnée longitudinale de la région centrale pour les pôles parallèles, de manière monotone et continue. Elle est identique au modèle brut sur l’axe D1, l’axe D3 et pour les pôles perpendiculaires D4/D5. Le changement N/S conserve la forme. Le contrôle mécanique utilise le corps de l’aimant à sa véritable position avant toute transformation.

La réponse brute B, le seuil commun k×AT, les moments magnétiques, les données de brochure, les repères et la correction documentaire D4 ne sont pas réajustés. Les tests vérifient la conservation des réponses sur les axes documentés et la zone morte centrée perpendiculaire. La largeur n’est donc pas une tolérance de détection certifiée. Cette distinction est également indiquée dans « Sources et limites ».

Le circuit utilise le seuil médian de classe ; A conserve seulement sa borne prudente caractérisée. La bande jaune n’est pas utilisée pour inventer une hystérésis. Les pièces réelles peuvent commuter à un autre endroit dans cette bande. La chronologie conserve les états de placement, explicitement distingués de l’état électrique illustratif.

## Limites conservées

- Aucun défaut d’orientation n’est contourné pour forcer une fermeture. La rotation de 90° du cas centré reste défavorable et ouverte près du corps.
- La présence d’une commande de rapprochement n’implique pas que toutes les classes et tous les couples peuvent fermer avant collision. Le cas signalé MK04/M04 B est corrigé et vérifié ; les autres suivent le modèle et leurs limites.
- Aucun montage importé n’est déplacé automatiquement par les nouvelles présélections. Le calcul et le contrôle de collision restent partagés ; les contraintes propres au montage importé sont conservées.
- La première préparation des orientations du pivot peut encore prendre plusieurs dizaines de secondes (environ 38 s observées pendant d’autres calculs locaux). L’avancement est visible, la lecture démarre seule, puis le résultat est réutilisé. Les volumes ne sont jamais interpolés entre deux orientations.

## Validation

- Suite complète : **2 095 tests réussis, 0 échec**, 137 fichiers.
- TypeScript : vérification sans erreur.
- Compilation de production : réussie.
- Inventaire i18n : `[]`, huit langues prises en charge.
- Quatre scans de charte exécutés. Aucun nouvel écart : les résultats préexistants concernent les matériaux 3D, le thème de la page racine et des primitives UI non migrées ; ils ne sont pas modifiés ici.
- `git diff --check` : aucun problème.
- Recette navigateur : commandes Affichage, circuit permanent, boîtier transparent, sensibilité, approche D1/D3, pivot, conservation de caméra, rotation 90°, coupe 2D, commandes mobiles à 390 × 844. Les vérifications sur les imports sont couvertes par la suite existante ; pas de nouvelle campagne visuelle exhaustive sur tous les modèles importés.

Captures conservées dans le dossier local `atelier-corrections-20261028/evidence` : caméra avant/pendant lecture, pivot, approche D3, contacts fermés, coupe D1 et commandes mobiles. La vidéo utilisateur a été inspectée par extraction de trois images réparties dans l’enregistrement.
