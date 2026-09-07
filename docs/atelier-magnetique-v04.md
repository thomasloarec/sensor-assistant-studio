# V0.4 — langues et cartes produit

7 septembre 2026. Cette version complète la [V0.3](atelier-magnetique-v03.md).

## Utilisation

Le sélecteur de langue est présent dans l'en-tête du dossier, du chat et de l'atelier. Français par défaut, puis anglais, chinois simplifié, allemand, espagnol, russe, italien et japonais. Le choix est mémorisé dans ce navigateur. Changer de langue conserve le montage, le capteur, les coordonnées et la session.

Dans l'atelier, ouvrir **Découvrir ce capteur** sous le capteur sélectionné. Dans le catalogue, le même bouton permet de consulter la carte avant de choisir **Utiliser ce capteur**.

La carte présente le produit sur un fond bleu profond, une illustration de sa forme, une cote et ses dimensions réelles. Le bouton **Voir les contacts** révèle les contacts symboliques dans leur état courant. Trois rubriques :

- **Essentiel** : température et condition d'utilisation, boîtier, connexion et longueurs de câble.
- **Électrique** : options de la série et limites de puissance, tension, courant commuté et courant traversant.
- **Intégration** : températures selon le câble, précautions de montage et encombrement.

Le choix d'une option électrique dans la carte sert à consulter la documentation ; il ne change pas la forme de contact simulée. Les maxima d'options différentes ne sont jamais fusionnés. Le reed pédagogique ne reçoit pas de caractéristiques commerciales inventées.

## Sources et distinctions importantes

Les données des 21 modèles et variantes sont transcrites depuis les fiches fabricant livrées dans `public/datasheets`. Chaque carte renvoie à la fiche de sa série. Révisions : 28 février 2019 pour les séries historiques ; 27 octobre 2023 pour MK21PR ; 17 janvier 2025 pour MK36, MK37 et MK38. Les PDF source conservent leur langue d'origine.

- MK24 : 5 × 2,2 × 1,6 mm pour le corps ; 5,5 mm avec connexions J. L'astérisque des valeurs réduites correspond à la **sensibilité magnétique A**, pas au contact Form A. Standard : 3 W / 30 V / 0,3 A commuté / 0,5 A traversant. Sensibilité A : 1 W / 30 V / 0,1 A / 0,3 A. La fiche fabricant de 2017, [hébergée chez Mouser](https://www.mouser.com/pdfdocs/datasheet-reed-sensor-mk24-oe-v02.pdf), explicite cette note absente de la transcription 2019. Un lien complémentaire est présent sur la carte.
- MK38 1A85C : 300 V commutés au maximum pour le capteur packagé. Ne pas reprendre les 1 000 V du reed brut 85.
- MK21 : câble Radox, −40 à +150 °C immobile et −30 à +150 °C mobile. MK21PR : PVC, −30 à +80 °C immobile et −5 à +80 °C mobile.
- MK36/MK37 : 300 mm UL1569 et 2 m VdS, avec des températures différentes. MK38 : 300 mm UL1569 standard, autres longueurs sur demande.
- Les variantes MK11 sont des boîtiers distincts ; la carte montre les options de série à vérifier contre le code de commande exact.

Les limites électriques, conditions thermiques et longueurs de câble sont documentées. Le champ et les distances de démonstration restent fictifs selon les règles V0.3. Une carte produit ne constitue pas une validation du montage.

## Localisation

`src/lib/i18n` contient le catalogue des huit langues et 966 messages, chacun avec sept traductions. Les textes de l'interface, libellés du dossier, messages déterministes connus, résumés de montage et exports Markdown sont traduits à l'affichage. Nombres et dates suivent la langue sélectionnée. Les paramètres de configuration et les exports JSON restent canoniques ; les données ne sont pas retraduites en base.

Le texte libre saisi par un utilisateur, les noms de pièces GLB, les références, les identifiants techniques et les documents source sont conservés. Le dictionnaire n'est pas un service de traduction de tout document ou historique libre. Les textes de démonstration reconnus sont traduits ; une ancienne réponse libre dans une autre langue garde sa langue d'origine.

L'assistant expérimental reçoit la langue choisie pour ses nouvelles réponses. La consigne exige les mêmes réserves techniques et une version française interne pour les contrôles historiques. Une réponse non française sans cette version de contrôle est rejetée ; la formule de reprise localisée est vérifiée. Ces contrôles ne remplacent pas la revue technique et linguistique du contenu génératif. Les champs et identifiants internes conservent leur contrat existant. Aucune migration de base de données ni modification de l'authentification.

## Vérifications

- 65 tests automatisés : modèles magnétiques, géométrie, imports, sauvegardes, couverture et paramètres de traduction, notes multilingues, caractéristiques produit et réserves MK24/MK38/MK21.
- TypeScript : aucune erreur. Lint ciblé : aucune erreur ; deux avertissements de rechargement à chaud des composants de développement.
- Construction de production réussie. Avertissements existants de taille des modules 3D et de configuration de compilation conservés.
- Parcours navigateur : huit langues, conservation des coordonnées 99 / 73,8 / 62 mm, ouverture des cartes et options MK24, catalogue et carte imbriquée ; carte vérifiée à 390 × 844 px sans débordement horizontal.

Les traductions sont une première version produit à relire avec les équipes locales avant une diffusion commerciale. Aucun appel de génération réel dans les huit langues n'est inclus dans cette recette ; la transmission et le contrat linguistique sont testés automatiquement.

## Fichiers principaux

- `src/lib/i18n/core.ts`, `messages.json`, `react.tsx` : langues et préférence locale.
- `src/lib/standex/sensor-specifications.ts` : données de série et conditions.
- `src/components/standex/workshop/sensor-card.tsx` et `.css` : carte responsive.
- `src/lib/standex/response-language.ts` : contrat linguistique de l'assistant expérimental.
- `tests/localization.test.ts` et `tests/sensor-specifications.test.ts` : vérifications ajoutées.

L'aperçu Lovable reste privé ; la synchronisation se fait par le dépôt connecté, sans publication publique.
