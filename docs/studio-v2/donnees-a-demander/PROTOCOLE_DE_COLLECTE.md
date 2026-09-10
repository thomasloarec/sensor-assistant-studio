# Protocole de collecte et d'acceptation

1. Identifier la référence complète du capteur et de l'aimant, leurs variantes et leurs lots. Joindre les dessins de la matière active et du boîtier séparément.
2. Fixer un repère commun : x axe des lames vers les connexions, y transversal, z normal. Décrire les rotations XYZ intrinsèques et les faces à partir desquelles les distances sont relevées.
3. Conserver chaque mesure brute : enclenchement à l'approche et relâchement au retrait, pose, température réelle, charge électrique, vitesse, pièces métalliques voisines, instrument et incertitude. Une absence de mesure est vide, jamais zéro.
4. Relever plusieurs échantillons et plusieurs lots selon un plan défini avec le BE. Ne pas convertir une demi-étendue ou un écart-type en borne garantie. Mentionner explicitement ce que représente la dispersion.
5. Réserver des observations qui ne participent à aucun ajustement, y compris celui du centre magnétique. La V1 teste une retenue par classe et approche sans utiliser la distance retenue pour ajuster le centre. Des mesures indépendantes restent préférables.
6. Importer dans une nouvelle version du registre, conserver la précédente, lancer la validation et comparer le rapport de calibration. Rejeter tout dépassement ou paramètre non identifiable ; conserver le rapport d'échec.
7. Le BE signe une révision du rapport, avec le domaine accepté et les limites. Un nom tapé dans un navigateur n'est pas une authentification du BE et ne suffit pas à certifier un calcul.

En-tête proposé pour les mesures complémentaires :

`measurement_id;sensor_reference;sensor_class;sensor_lot;magnet_reference;magnet_lot;approach_id;datum_id;position_x_mm;position_y_mm;position_z_mm;rotation_x_deg;rotation_y_deg;rotation_z_deg;pull_in_mm;drop_out_mm;temperature_c;speed_mm_per_s;instrument;instrument_uncertainty_mm;ferrous_configuration;source_ref;measured_by;measured_on`

Ce format est une proposition de collecte. Il complète les registres existants ; il ne remplace pas silencieusement leur contrat. Fournir les unités originales avec les données et documenter toute conversion.
