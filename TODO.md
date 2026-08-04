# 🗺️ TODO & Roadmap — qoe.fi Platform

> Session du 2026-08-05 — Réglages système & compte réarchitecturés aux standards Silicon Valley.

---

## ✅ Fait Récemment (2026-08-04 / 2026-08-05)

- [x] **Pont & Séparation Réglages** : Distinction nette entre Réglages Système Personnels (`qoe.fi/settings`) et Design du Média (`dashboard.qoe.fi/settings`).
- [x] **Sidebar Dashboard Profil Utilisateur** : Affichage dynamique de l'utilisateur connecté dans `AppleSidebar.tsx` et popover avec lien direct vers `Mon Compte Personnel` (`qoe.fi/settings`).
- [x] **Bandeau d'Information VisualStudio** : Banner dans `visual-studio.tsx` orientant le créateur pour ses données personnelles.
- [x] **Refonte Front-End Silicon Valley (`qoe.fi/settings`)** : 9 onglets système (Compte, Sécurité, SSO, Sessions, Timeline, Notifications, Portefeuille, Accessibilité, Confidentialité RGPD & Danger Zone).
- [x] **Nettoyage Design Strict (Anti-AI Slop)** : Suppression de tous les `font-mono` sur les handles/domaines/dates et éradication des pills/badges colorés tape-à-l'œil.
- [x] **Carte E-mails de Sécurité Transactionnelle** : Réglage fin des alertes e-mails de connexion, modifications de sécurité et digests.
- [x] **Module Mailer Transactionnel (`@qoe/auth/mailer`)** : Templates HTML d'e-mails de sécurité Apple-style (`sendSecurityLoginAlert`, `sendSecurityPasswordChangedAlert`, `sendGdprArchiveReadyEmail`).
- [x] **Server Actions Backend Raccordées** : Actions pour l'archive RGPD, le gel de compte (Freeze), la révocation de sessions et la suppression contrôlée avec mot de passe.

---

## 🚧 Feuilles de Route & Prochaines Étapes (Tasklist)

### 1. 📧 Configuration Backend Mailer & Triggers Supabase Prod (À configurer plus tard)
- [ ] Configurer la clé d'API `RESEND_API_KEY` et l'adresse `EMAIL_FROM=security@qoe.fi` en production.
- [ ] Personnaliser les templates e-mails par défaut de Supabase Auth (Confirmation d'inscription, Magic Link, Réinitialisation de mot de passe).
- [ ] Raccorder le trigger de détection automatique de **Nouvelle Connexion sur un Nouvel Appareil/IP** pour expédier `sendSecurityLoginAlert`.
- [ ] Mettre en place le worker d'exportation de données RGPD pour générer l'archive JSON lourde en tâche de fond et transmettre le lien temporaire.

---

### 2. 🎙️ Multi-Tenancy Média & Gestion des Médias depuis le Compte Créateur
> Références : [`VISION_MULTI_TENANT_MEDIA.md`](file:///d:/Files/DEV/Main/qoe.fi/VISION_MULTI_TENANT_MEDIA.md) & Discussion *"Redesign Creator Dashboard Settings"*
- [ ] **Création de Média en 1 Clic** : Permettre à un utilisateur / créateur de **créer un ou plusieurs nouveaux médias** (journal, magazine, revue) directement depuis son compte principal, sans devoir créer un compte supplémentaire ou passer par un compte admin média global.
- [ ] **Gestion des Réglages Médias Dédiés** : Réserver les réglages du Dashboard Studio (`dashboard.qoe.fi/settings`) à la configuration fine de chaque média (subdomaine `.qoe.fi`, domaine personnalisé, logo, palette, SEO, rôles d'équipe).
- [ ] **Cas d'Usage Multi-Médias** : Gérer un créateur qui possède son média propre **ET** qui travaille simultanément en tant que rédacteur/contributeur pour 3 autres médias.
- [ ] **Context Switcher Média (En-tête Studio)** : Composant de basculement rapide de contexte de publication dans la topbar ou la sidebar.
- [ ] **Empilement Progressif des Niveaux d'Interface (Studio Levels)** :
  - **`Writer` (Niveau 1 — Socle & Blog Personnel)** : Interface minimale et épurée axée sur la rédaction d'articles, la gestion de brouillons et la publication sur son blog personnel.
  - **`Creator` (Niveau 2 — Déclinaison Multi-Format & Réseaux)** : Inclus `Writer` + Outils de conversion automatique d'un article en **carrousels Instagram, micro-posts/tweets et visuels sociaux** + Analytics d'engagement & Newsletters.
  - **`Advanced` (Niveau 3 — Multi-Médias & Gestion d'Équipes)** : Inclus `Writer` + `Creator` + Gestion de **plusieurs médias/publications simultanés**, invitation de rédacteurs, sous-domaines/domaines personnalisés complexes, monétisation Stripe & API.

---

### 3. 📰 Redesign Front-End du Feed Lecteur (`apps/feed`)
- [ ] Réviser le layout de la timeline principale et de la navigation lecteur selon les spécifications Apple Music Web ([`design/DESIGN.md`](file:///d:/Files/DEV/Main/qoe.fi/design/DESIGN.md)).
- [ ] Adapter la sidebar de navigation du lecteur aux tokens sémantiques `@qoe/theme`.
- [ ] Affichage fluide des cartes d'articles et micro-posts avec séparateurs capillaires extra-fins.

---

### 4. 🔑 Authentification Avancée & Sécurité Renforcée
- [ ] Intégration de la **Double Authentification TOTP (2FA)** (Google Authenticator / Authy avec QR Code).
- [ ] Support des **Passkeys / WebAuthn** pour la connexion biométrique sans mot de passe (Touch ID / Face ID).
- [ ] Cron worker de suppression définitive des comptes planifiés après la période de grâce de 30 jours.

---

### 5. 💳 Stripe Connect & Monétisation Créateurs
- [ ] Flux d'onboarding Stripe Connect Express pour les créateurs.
- [ ] Recharges automatique du Wallet lecteur et payouts mensuels automatique vers les créateurs.

---

### 6. 🌑 Dark Mode "Onyx" (Apple Dark)
- [ ] Valider les tokens sémantiques `.dark` dans `packages/theme/src/styles/tokens.css`.
- [ ] Bouton de basculement de thème dans le Header (Soleil/Lune).
- [ ] Tester le basculement sans aucun artefact visuel sur `apps/feed` et `apps/dashboard`.
