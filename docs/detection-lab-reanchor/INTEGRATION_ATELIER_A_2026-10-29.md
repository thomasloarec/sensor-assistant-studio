# Intégration de A dans l’atelier — 29 octobre 2026

La réponse A brute remplace B et la déformation pédagogique dans l’atelier client du catalogue. Le menu simplifié est conservé. Aucun changement n’est publié par cette intégration.

## Calcul partagé

- Version catalogue : `catalogue-a-analogy-3.0.0` ; profil : `form66-lfit-a-c1@1.0.0`.
- Réponse : `abs((M1 + M2) / 2)`, moyennes signées du champ axial sur deux demi-longueurs égales. Le noyau historique et l’adaptation catalogue appellent la même fonction `reedResponse`.
- L = 15,63399603080886 mm ; k = 0,13560548808516593 mT/AT.
- Repère axial documentaire = 8,903153027386512 mm ; retrait D4 documentaire = 1,4912902832031252 mm. Ces paramètres servent aux comparaisons de distances, jamais à déplacer les corps ou les volumes.
- Hypothèses de montage conservées : longueur ±30 %, décalage interne ±1 mm, moment ±10 %, selon les scénarios existants `lfit-one-factor-1.0.0`.
- `pedagogical-shape.ts` supprimé : aucune transformation des coordonnées pour élargir artificiellement D1.
- Point, coupe, volume, chronologie et circuit utilisent la même réponse à la pose réelle. Les exclusions portent sur les corps entiers et les enveloppes des pièces importées.
- Le circuit illustre un exemplaire à la borne documentée la plus sensible : zones verte et jaune fermées, extérieur ouvert. Classe A : borne prudente seulement ; position non calculable : illustration désactivée. Aucun déclenchement forcé.
- Les profils de boîtiers et analogies des autres reeds sont inchangés. Les audits historiques B restent séparés.

## Limites conservées

Le choix de A est pédagogique, pas une qualification physique des capteurs. Le contrôle primaire conserve les deux valeurs documentaires suspectes : 43/45 bornes dans le critère, médiane 0,488 mm ; biais moyen D3 −1,134 mm, au-delà du critère de 1 mm. Les anomalies ne sont pas confirmées par Standex. L’analyse secondaire sans ces deux valeurs ne remplace pas le résultat primaire. Les traces exportées restent `qualified: false`.

La taille pincée du schéma de référence peut se trouver dans une zone inaccessible à l’aimant à cause du boîtier. L’intégration n’impose donc pas le contour rouge comme une mesure empirique.

## Vérifications

- Suite complète : **2 115 tests réussis, 0 échec**, 141 fichiers.
- Vérification TypeScript et build de production : réussis.
- Inventaire i18n : 0 entrée manquante ou non traduite ; aucune nouvelle copie d’interface.
- Scans de charte : aucune nouvelle occurrence ; seules restent les exceptions existantes (matériaux Three.js, meta theme-color, primitives UI non migrées). `git diff --check` propre.
- Équivalence au noyau A sur 8 familles 66, 2 aimants pilotes, toutes les hypothèses et des poses obliques ; contrôle indépendant de l’intégrale.
- Identité point/coupe/volume/chronologie/contact ; collisions ; profil et version des traces.
- Approches MK04/M04 D1 et D3 : ouverture et fermeture sans chevauchement. Orientation perpendiculaire centrée : absence d’activation autorisée, zone morte conservée.
- Fichier GLB réel chargé en test : poses et enveloppes mobiles transmises au calcul A, montage inchangé.
- Recette visuelle locale sur le composant client réel : lobes arrondis, maintien des zones pendant le mouvement, contact fermé en approche D3 à 0,5 mm, contact ouvert dans la zone morte D1 à 90° au même écart, coupe 2D et changement de sensibilité, circuit toujours visible et commande de contacts présente.
- Écran 390 × 844 : scène et circuit visibles, largeur du document 390 px (pas de débordement horizontal). Écran 1440 × 1000 également vérifié ; tailles de test réinitialisées.

Les preuves visuelles sont conservées dans le dossier local `detection-integration-a-20261029/`. La préversion locale utilise le même `MagneticWorkshop` que le workflow client ; elle n’utilise pas l’ancienne interface de chat.
