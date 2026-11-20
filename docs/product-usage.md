# Usage produit — V1

L’onglet **Administration → Usage produit** conserve les quatre blocs validés :
indicateurs, progression, points d’arrêt et difficultés. Périodes de 7, 30 ou 90
jours calendaires, calculées en heure de Paris. Aucun jeu de démonstration en
production. Erreur de chargement et absence de données sont deux états distincts.
Les huit langues utilisent le dictionnaire existant ; un changement de langue
retraduit aussi les libellés calculés, erreurs, nombres et dates sans recharger.

## Périmètre de mesure

- Mesure facultative, désactivée avant « Autoriser », choix modifiable en bas de
  la page. Le refus efface les identifiants locaux et les événements en attente.
- Navigateur pseudonyme, pas identité d’une personne : un navigateur partagé
  sous-compte, plusieurs appareils sur-comptent. Les comptes sont dédupliqués
  sur la période ; les personnes sans accord ne sont pas dans le dénominateur.
- Une session suit 30 minutes d’inactivité. Seules les sessions closes alimentent
  les points d’arrêt. Les interactions maintiennent la session, pas un onglet
  laissé ouvert. Un arrêt n’établit pas une difficulté ni sa cause.
- Les entonnoirs suivent les événements observés dans l’ordre, dans un même
  projet et une même session. L’import suit en plus une même tentative.
  Un accord donné en cours de parcours ne recrée pas les étapes antérieures.
- Domaine autorisé : `sensor-pal-tester.lovable.app`. Ajouter explicitement un
  nouveau domaine de lancement dans `usageAllowedHost` si nécessaire.
- Les comptes ayant un rôle Standex sont exclus côté serveur, pour toute leur
  session. Pour tester sans compte, ouvrir `/?usage=off` : exclusion pour cet
  onglet, persistante jusqu’à sa fermeture. Localhost et les previews sont exclus.
- Événements à vocabulaire fermé et propriétés limitées : numéro de question,
  source (simple/démo/personnel), format et tranche de taille du fichier,
  identifiants techniques de session/projet/tentative. Aucun nom de fichier,
  réponse, email, géométrie, mouvement de souris ou enregistrement vidéo.
- Les données sont purgées automatiquement toutes les heures au plus tard à
  90 jours, même sans nouveau trafic. Effacement en cascade des événements
  et liens de confirmation. Les identifiants visiteurs expirent à 90 jours.

## Lecture des quatre blocs

1. **Indicateurs** : navigateurs observés, parcours démarrés, utilisateurs actifs
   dans l’atelier (réglage ou essai), import personnel effectivement rendu,
   résultat consulté après essai de la même configuration, transmission confirmée.
2. **Progression** : vue globale, six questions consultées (pas forcément répondues),
   import personnel, et Avec Standex. Le contact direct est une branche distincte ;
   l’atelier n’est jamais requis pour transmettre. « Je ne sais pas encore » est
   compté à part. Les modèles de démonstration n’alimentent pas les imports personnels.
3. **Points d’arrêt** : dernière étape observée du dernier projet de chaque
   session close ; vérification en attente, expirée et transmission sont distinctes.
4. **Difficultés** : navigateurs touchés par chaque difficulté ; catégories non
   additives. Les reprises réussies doivent suivre l’erreur dans le même projet
   (et la même tentative pour l’import). Une estimation indisponible ne signifie
   pas une détection négative valide. Ces données orientent les tests utilisateurs.

## Confirmation et fiabilité

Le navigateur ne peut pas envoyer un événement « transmission confirmée ».
Après un envoi réussi, une RPC rattache la session au dossier en vérifiant le
propriétaire connecté ou l’empreinte du reçu de l’envoi anonyme. La création de la
révision soumise côté base complète la confirmation différée. Un ancien dossier déjà
soumis ne suffit pas à confirmer un nouvel envoi. Un dossier est lié une seule
fois, à sa session d’origine : les périodes récentes peuvent encore évoluer.

Les lots ont des identifiants idempotents et une file locale bornée dans l’onglet,
avec reprise après rechargement et requêtes `keepalive` à la fermeture. Une panne
réseau ou un navigateur qui interrompt ces requêtes peut néanmoins sous-compter ;
la mesure ne bloque jamais l’import, l’essai ou la soumission métier.

Les trois tables `lead.product_usage_*` sont protégées par RLS sans accès direct
aux rôles navigateur. Les fonctions privées ont un `search_path` fixe. Le rapport
exige un administrateur réel côté serveur ; l’interface seule ne donne aucun
droit. Les limites d’ingestion bornent la taille des lots et le nombre d’événements.
Ce point d’entrée public reste une mesure déclarative : il ne constitue pas une
preuve d’identité ni une protection anti-robot exhaustive.

## Installation et validation

Appliquer les migrations `20261120151239_product_usage_v1.sql`, puis
`20261120152947_product_usage_retention.sql`, avant de publier le front.
La seconde active [Supabase Cron](https://supabase.com/docs/guides/cron/install)
et crée uniquement la purge des tables de mesure. Aucune clé supplémentaire.
Le site utilise ses variables Supabase existantes.

La mesure fonctionne aussi avant le déploiement du parcours de vérification
d’email (`customer_email_access`, version métier 1.12). Elle n’active pas ce
parcours. Lorsque celui-ci est disponible, les reçus et confirmations sont pris
en charge automatiquement par le même suivi.

Tests : séquences et déduplication, erreurs/reprises, retours en arrière,
confirmation anonyme et connectée, accès SQL par rôle, idempotence, exclusion du
personnel, réponses réseau tardives et changement de langue sur l’écran monté.
Vérifier ensuite `bun test tests/`, `tsgo --noEmit`, `bun run build` et les contrôles
de la charte. Contrôler la tâche `product-usage-retention` dans Supabase Cron.
