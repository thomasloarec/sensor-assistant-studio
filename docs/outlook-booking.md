# Calendrier Sensor Studio — raccordement Microsoft Outlook

Le parcours est déjà partagé : choix de la semaine, du jour, d'un horaire de 30 minutes, récapitulatif dans le fuseau du visiteur, confirmation. Par défaut, les créneaux sont fictifs, explicitement signalés comme démonstration. Aucun appel Microsoft ni invitation n'est effectué dans ce mode.

La résolution du commercial utilise les règles existantes pays/ville/industrie. Ce lot ne crée ni ne modifie aucune attribution. Sans commercial résolu, le dialogue affiche uniquement la confirmation du projet. Un lien de réservation personnel existant reste utilisé en mode par défaut. Le mode Outlook intégré prend ensuite la priorité sur ce lien et conserve le calendrier Sensor Studio.

## Configuration par l'IT

1. Enregistrer une application dans le tenant Microsoft Entra de Standex. Autoriser Microsoft Graph `Calendars.ReadWrite` en mode application pour lire les disponibilités et créer l'événement avec le prospect invité. Restreindre l'accès Exchange aux seules boîtes commerciales autorisées. Ne pas donner accès à tout le tenant sans restriction.
2. Configurer les secrets **sur le serveur uniquement** : `OUTLOOK_TENANT_ID`, `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`. Aucun de ces secrets ne doit avoir de préfixe `VITE_`.
3. Configurer `OUTLOOK_SALES_MAILBOXES` comme un objet JSON reliant l'identifiant de la personne de l'annuaire Sensor Studio à sa boîte Outlook. Exemple de structure (identifiants et boîte fictifs à remplacer) :

```json
{
  "20000000-0000-4000-8000-000000000002": {
    "mailbox": "sales@example.invalid",
    "timeZone": "Europe/Berlin",
    "days": [1, 2, 3, 4, 5],
    "windows": [[540, 720], [840, 1020]]
  }
}
```

`days` : lundi = 1, vendredi = 5. `windows` : minutes depuis minuit dans le fuseau du commercial, ici 09:00–12:00 et 14:00–17:00. Ces plages configurent les heures proposées, pas les heures de travail Outlook ; les deux doivent être cohérentes. Les indisponibilités Outlook sont ensuite exclues. Configurer toutes les personnes ayant une attribution avant d'activer globalement le mode réel.

4. Le serveur utilise les paramètres existants `STANDEX_SITE_URL` (origine publique HTTPS exacte), `STANDEX_SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`. Le chemin `/api/booking` doit être servi par l'entrée serveur de l'application, comme `/api/customer-access` ; un hébergement uniquement statique ne suffit pas.
5. Définir `VITE_BOOKING_PROVIDER=outlook` puis reconstruire et déployer l'application. En son absence, le mode démonstration reste actif. Le changement ne demande aucune modification du composant calendrier. Le mode réel ne bascule jamais silencieusement en simulation en cas d'erreur.

## Autorisations et données

Le prospect doit avoir une session avec adresse vérifiée et un dossier déjà soumis auquel il a accès. Le serveur vérifie la session avec `getUser`, lit la dernière version soumise via `lead_client_view` avec les droits de cet utilisateur, et résout à nouveau le commercial depuis cette version. Un identifiant de commercial falsifié est refusé. Les boîtes commerciales proviennent uniquement de la configuration serveur ; l'invitation est envoyée à l'adresse vérifiée du compte. Aucun document du projet, pièce 3D ou contenu NDA n'est inclus dans l'événement.

Les disponibilités sont demandées via `getSchedule`. Seuls les créneaux libres pendant les plages configurées sont renvoyés au navigateur, jamais les sujets ou participants des événements existants. Avant création, le serveur revérifie le créneau. La confirmation n'apparaît qu'après réception d'un identifiant d'événement Microsoft. Un `transactionId` stable par dossier/boîte/créneau accompagne les écritures pour limiter les doublons lors d'une reprise réseau.

## Recette d'activation

Les tests du dépôt utilisent des réponses Microsoft simulées. Aucun test réel dans le tenant Standex n'a été effectué dans ce lot.

Avant activation publique, réaliser sur des comptes de test autorisés : un créneau libre, un événement occupé, une absence du commercial, un changement de fuseau/heure d'été, une invitation reçue par le prospect, une erreur de permission, un créneau devenu occupé et deux demandes simultanées. Les lectures et créations Graph sont deux opérations distinctes : Microsoft Graph ne fournit pas de réservation atomique du créneau sur une boîte utilisateur. La vérification réduit les conflits, mais ne garantit pas leur absence si un autre système écrit au même instant. Pour une garantie stricte en exploitation multi-instance, ajouter une réservation persistante partagée ou utiliser une politique Microsoft Bookings adaptée.

Après une erreur réseau de création, le client demande de vérifier le calendrier avant de réessayer : l'invitation peut avoir été créée même si sa réponse n'a pas été reçue. La fermeture du dialogue n'annule pas un événement déjà créé. Annulations et déplacements se font ensuite dans Outlook ; l'application ne présente pas de faux bouton d'annulation.

L'IT doit également appliquer les protections habituelles de l'hébergement (limitation du débit sur `/api/booking`, rotation du secret et journalisation sans jetons). Aucune migration de base ni modification d'attribution commerciale n'est requise pour cette intégration.

## Références Microsoft

- [Disponibilités — getSchedule](https://learn.microsoft.com/en-us/graph/api/calendar-getschedule?view=graph-rest-1.0)
- [Créer un événement et envoyer les invitations](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0)

## Éléments livrés

- `booking-provider.ts` : contrat identique et adaptateurs démonstration/serveur.
- `booking.server.ts` : contrôle du dossier, résolution commerciale, authentification Microsoft, disponibilités et création.
- `booking-calendar.tsx` : interface commune, états de chargement/refus et confirmation.
- `tests/outlook-booking.test.ts` et `tests/booking-calendar-20261109.test.tsx` : essais sans écriture externe.
