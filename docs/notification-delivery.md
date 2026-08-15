# Notification delivery

qoe.fi sépare désormais l'événement in-app de sa livraison externe.

## Architecture

1. Une action métier crée `Notification` en base.
2. Le centre in-app et le realtime utilisent toujours cette ligne.
3. Quand `NOTIFICATION_DELIVERY_ENABLED=true`, les canaux autorisés par `NotificationPreference` sont ajoutés dans `NotificationDelivery`.
4. Le runtime worker appelle `drainNotificationEmailOutbox` pour récupérer les lignes `QUEUED` et appelle un `EmailProvider` injecté.
5. La prise de ligne est atomique (`QUEUED` → `PROCESSING`) afin que plusieurs instances puissent tourner sans double envoi.
6. Chaque livraison possède une clé idempotente (`<notificationId>:EMAIL`), un compteur de tentatives, un statut et une erreur exploitable.

Par défaut, `NOTIFICATION_DELIVERY_ENABLED` est absent : aucune livraison externe n'est créée et aucun email ne part.

## Brancher un fournisseur plus tard

Le code métier ne doit pas importer de SDK fournisseur. Il faut créer un adaptateur qui implémente `EmailProvider` dans le runtime worker, puis l'enregistrer sous le nom choisi par `EMAIL_PROVIDER`.

Exemples de fournisseurs compatibles avec ce contrat :

- SMTP générique via un adaptateur Nodemailer ;
- Resend ;
- Postmark ;
- Amazon SES ;
- relais HTTP auto-hébergé.

Variables prévues, sans valeur sensible dans Git :

```text
NOTIFICATION_DELIVERY_ENABLED=true
EMAIL_PROVIDER=<nom-enregistre>
QOE_PUBLIC_URL=https://qoe.fi
```

Les identifiants SMTP/API resteront uniquement dans l'environnement du worker. Le choix du fournisseur peut donc être fait plus tard sans migration ni modification du feed, de l'éditeur ou des notifications in-app.

## Lancer un worker plus tard

Le package `@qoe/workers` expose les primitives, mais ne démarre volontairement aucun processus en production tant qu'un fournisseur n'est pas enregistré. Le runtime pourra initialiser un provider puis appeler `drainNotificationEmailOutbox(provider)` sur un intervalle, avec une limite de lots et une supervision des erreurs depuis `/admin/notifications`.
