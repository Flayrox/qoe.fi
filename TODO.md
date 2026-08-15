# TODO — Prochaines étapes qoe.fi

> État au commit des réglages compte + outbox email. Ce qui est fait :
> centre de réglages lecteur, confidentialité de profil, export/suppression de
> compte, outbox de livraison email, écran admin `/admin/notifications`,
> worker de drainage atomique. Ce qui reste à faire :

## 📮 Livraison email (outbox)

- [ ] Choisir et enregistrer un vrai `EmailProvider` (Resend, Postmark, SES ou SMTP/Nodemailer) dans le runtime worker — sans toucher au contrat existant
- [ ] Démarrer un scheduler qui appelle `drainNotificationEmailOutbox(provider)` sur un intervalle (ex. toutes les 30 s), avec supervision des erreurs
- [ ] Politique de retry/backoff : `availableAt` repoussé après échec, max d'essais, désactivation après N échecs
- [ ] Templates email pour les autres types (like, follow, commentaire, mention, média) — seul l'invitation contributeur a un template aujourd'hui
- [ ] Brancher `QOE_PUBLIC_URL` par publication (lien article sur le bon sous-domaine/custom domain)
- [ ] Option de brouillon/debug : envoyer les emails vers une boîte de test quand `NODE_ENV !== production`

## 🔐 Sécurité & sessions (réglages)

- [ ] Page « Sécurité » : liste des sessions actives (Supabase Auth), révocation d'une session, déconnexion des autres appareils
- [ ] Changement d'email et de mot de passe depuis les réglages (flux Supabase Auth)
- [ ] Double authentification (2FA/TOTP ou WebAuthn) avec codes de récupération
- [ ] Vérification d'identité pour les actions sensibles (export, suppression, changement d'email)

## 🗑️ Suppression de compte

- [ ] Écran admin pour traiter `AccountDeletionRequest` (approuver / refuser, motif visible)
- [ ] Job de suppression RGPD : cascade propre (pensées, articles, likes, abonnements, notifications, préférences…)
- [ ] Notification email au user quand la suppression est traitée
- [ ] Période de grâce + annulation déjà possible côté user (fait) — documenter le délai

## 🔒 Confidentialité

- [ ] Appliquer `profileVisibility` aux autres surfaces (recherche, notifications, suggestions du feed)
- [ ] Appliquer `showSensitiveContent` aux trigger warnings dans le feed et les profils
- [ ] Gérer les `BlockedUser` et `MutedWord` depuis l'UI des réglages (la DB existe déjà)

## 🤝 Consentement contributeur & collaboration

- [ ] Remplacer le mode local par une vraie collaboration distante (Hocuspocus/WebSocket) : curseurs, présence, permissions par article
- [ ] Historique des versions d'article et restauration
- [ ] Verrouillage de publication tant qu'une invitation est en attente (ou décision explicite)
- [ ] UI de retrait de consentement depuis le profil du contributeur (pas seulement depuis l'espace Avancé)

## 🔔 Notifications

- [ ] Parité Go/TS sur les nouveaux types de notification (délivrance, grouping)
- [ ] Push réel (APNs/FCM) — aujourd'hui seuls les canaux email/in-app existent
- [ ] Préférences par sous-type et par publication (pas seulement globales)

## 🧪 Tests & qualité

- [ ] E2E pour l'écran admin outbox (relance, erreurs) et la confidentialité de profil privé/abonnés
- [ ] Tests du scheduler de drainage (idempotence, limites de batch, backoff)
- [ ] Tests du parcours suppression de compte de bout en bout

## 🌐 Divers

- [ ] Traductions (i18n) pour toutes les nouvelles pages de réglages
- [ ] Audit de sécurité : rate-limiting sur les actions de réglages, logs d'audit admin
