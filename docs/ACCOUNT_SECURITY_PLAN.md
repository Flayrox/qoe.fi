# Compte & sécurité — plan d’implémentation

## Périmètre

Cette zone centralise le compte, l’authentification, les sessions, la MFA,
la confidentialité, les données et la suppression. Elle ne duplique pas les
champs déjà modifiables dans le profil public : nom, username, avatar, bio et
pronoms restent éditables depuis le profil existant.

Les fonctionnalités créateur techniques restent dans Studio > Developer :
clés API, webhooks et applications OAuth qoe.fi. Settings expose uniquement
un résumé et un lien vers ces écrans.

## État déjà disponible

- `PATCH /v1/me/profile` : nom, username, avatar, bio, pronoms.
- `GET/PATCH /v1/settings/preferences` : préférences lecteur.
- `GET /v1/me/data-export` : export JSON.
- `GET/POST/DELETE /v1/me/account-deletion-request` : suppression idempotente.
- `/v1/settings/api-keys` : clés API créateur, conservées dans Studio.
- validation serveur des usernames/sous-domaines et protection des collisions.

## Architecture Supabase auto-hébergé

Le frontend ne reçoit jamais de service-role key. Les mutations sensibles passent
par l’API Go, qui vérifie le JWT, la fraîcheur de session, applique le rate
limit, appelle l’Admin API GoTrue si nécessaire et écrit l’audit.

À configurer par environnement :

- `SUPABASE_AUTH_URL` ou URL Kong Auth ;
- endpoint interne Admin API GoTrue ;
- service-role key uniquement dans l’environnement de l’API Go ;
- JWT secret/JWKS ;
- SMTP et expéditeur ;
- URLs de redirection autorisées ;
- providers OAuth ;
- version exacte GoTrue et capacités MFA/sessions ;
- rotation des secrets et timeouts.

Local et production utilisent tous deux Supabase auto-hébergé, mais avec des
URLs, secrets et credentials providers distincts. Voir aussi
`docs/LOCAL_SUPABASE.md`, `docs/AUTH_OAUTH.md` et `docs/OAUTH_PROVIDER.md`.

## Fonctionnalités à construire

### Compte

- email courant et état vérifié ;
- changement d’email avec confirmation ;
- renvoi de confirmation limité ;
- changement/reset de mot de passe ;
- identification des comptes OAuth-only ;
- fournisseurs de connexion liés ;
- réauthentification avant mutation sensible.

### MFA

Politique : obligatoire pour les superadmins, fortement recommandée pour les
créateurs. TOTP, codes de récupération hashés, rate limit, anti-rejeu et audit.
La compatibilité exacte avec la version GoTrue auto-hébergée doit être validée
avant implémentation ; si GoTrue ne suffit pas, ne jamais manipuler directement
ses tables internes : utiliser ses APIs officielles ou un composant dédié.

### Sessions

- liste des sessions actives ;
- session courante ;
- révocation individuelle ;
- révocation des autres sessions ;
- révocation globale ;
- invalidation après changement de mot de passe/email.

Métadonnées minimales : identifiant opaque, user-agent résumé, IP hashée ou
tronquée, dates, expiration et statut. Conservation de l’historique : 90 jours.

### Appareils de confiance

Token aléatoire stocké uniquement hashé, expiration recommandée de 30 jours,
révocation individuelle et globale. Ne jamais identifier un appareil avec le
seul user-agent.

### Journal de sécurité

Journal append-only avec utilisateur, événement, succès/échec, timestamp, IP
hashée, user-agent résumé, correlation ID et métadonnées non sensibles.
Événements : connexions, changements de credentials, MFA, sessions, clés,
domaine, export, suppression et providers OAuth. Purge automatique à 90 jours.

### Alertes

Email/notification interne pour nouvelle connexion, changement email/password,
MFA, création de clé, changement domaine, révocation globale et suppression.
Aucun secret dans les emails, URLs, logs ou analytics.

### Confidentialité et données

Relier les préférences existantes : visibilité du profil, mentions, invitations,
contenu sensible, autoplay, réduction des animations, contraste, taille de
police, feed, mots masqués et blocages. Export et suppression nécessitent
réauthentification, MFA si active, confirmation explicite et audit.

## Endpoints cible

```text
GET    /v1/me/authentication
POST   /v1/me/email-change
POST   /v1/me/email-change/resend
POST   /v1/me/password/change
POST   /v1/me/password/reset
POST   /v1/me/reauthenticate
GET    /v1/me/mfa
POST   /v1/me/mfa/totp/enroll
POST   /v1/me/mfa/totp/verify
POST   /v1/me/mfa/recovery-codes/rotate
DELETE /v1/me/mfa/totp
GET    /v1/me/sessions
DELETE /v1/me/sessions/{id}
POST   /v1/me/sessions/revoke-others
POST   /v1/me/sessions/revoke-all
GET    /v1/me/trusted-devices
POST   /v1/me/trusted-devices/{id}/revoke
POST   /v1/me/trusted-devices/revoke-all
GET    /v1/me/security-events
```

## Contrôles experts

S’aligner sur OWASP ASVS, OWASP Authentication/Session Cheat Sheets, NIST
SP 800-63B et les principes RGPD de minimisation. Appliquer cookies
HttpOnly/Secure/SameSite, CSRF pour les mutations cookie, PKCE pour OAuth,
rate limiting distribué Redis, tokens courts à usage unique pour les actions
sensibles, rotation et révocation serveur.

## Frontière Settings / Studio

Settings : compte, identité, sécurité, confidentialité, sessions, données.
Studio Developer : clés API, webhooks, OAuth qoe.fi, scopes, secrets, logs de
livraison et procédures d’intégration. Settings fournit des liens et indique
l’état de sécurité, mais ne recopie pas les secrets ni la gestion détaillée.
