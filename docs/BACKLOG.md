# 📌 Backlog — Idées & prochaines étapes

> Backlog central des idées, chantiers en attente et features futures du projet.
> Toute idée notée en session de travail est compilée ici pour ne rien perdre.
> Format d'une entrée : **Titre** — contexte / endpoints / fichiers touchés / statut.

---

## 🔴 Ops & infrastructure en attente (actions avant de continuer)

| #   | Action                                                                                               | Bloqué par                                   | Doc de référence                                                 |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| 1   | **Record DNS `updates.qoe.fi` → VPS**                                                                | Admin DNS (Hetzner/Bunny) — côté utilisateur | `docs/OTA_UPDATES.md`                                            |
| 2   | **Sauvegarder la clé privée de code signing** (`apps/mobile/keys/`) dans un coffre/KMS               | —                                            | `docs/OTA_UPDATES.md` §6 — sans elle, plus de signature possible |
| 3   | **Premier `deploy-prod.sh --publish-update`** (service `updates` + premier update live)              | #1 (DNS)                                     | `docs/OTA_UPDATES.md`, `scripts/deploy-prod.sh`                  |
| 4   | **Vérifier le manifest signé en HTTPS de bout en bout** (rejouer le flux E2E sim avec l'URL de prod) | #1 (DNS)                                     | `docs/OTA_UPDATES.md` §5                                         |
| 5   | Scripts RLS (`scripts/rls-grants.sql`, `rls-interactions.sql`) — à committer/terminer                | —                                            | en cours (working tree)                                          |
| 6   | Roadmap CDN images (Bunny.net) + backups offsite Hetzner                                             | —                                            | `docs/ROADMAP_INFRA.md`                                          |

---

## 🔜 À faire (court terme)

- **[S] Écran Historique de lecture mobile** — parité web (`/v1/me/reading-history`, déjà utilisé par `apps/core/src/app/(reader)/history/page.tsx`). → voir `docs/PARITY_WEB_MOBILE.md` P0.
- **[S] Test réel de la directive `rollBackToEmbedded`** — rejouer le flux E2E OTA sur simulateur en publiant un update volontairement cassé et vérifier que l'app revient au bundle embedded (serveur déjà couvert par un test unitaire ; manque la preuve en réel sur l'app).
- **[M] Outils d'accessibilité & de lecture sur la page article** (mobile **et** web) — réutiliser `useUserSettings`/`ReadingPreferencesProvider` : taille de police, contraste, réduire les animations, police adaptée. **Vision produits** : ces outils seront aussi configurables directement sur la page d'un article. Plan complet dans `docs/READING_TOOLS_AUDIT.md` (surlignage par sélection, citations d'extraits, annotations, toolbar lecture — API Go déjà prête).
- **[M] Onboarding mobile** — parité web (`/onboarding`) : setup du profil (nom, bannière, bio), suggestions à suivre. Aujourd'hui : inscription → app directe.

---

## 💡 Idées en attente (moyen/long terme)

- **Messagerie directe (DMs)** — le tab Messages mobile est un **stub** (aucun appel API) ; le web n'a rien ; **aucun module conversations dans l'API Go**. Feature complète à construire (backend temps réel — Supabase Realtime déjà en place —, chiffrement annoncé dans le header du stub, UI web + mobile). ⚠️ le client mobile affiche déjà « messagerie privée et discussions chiffrées » en promesse.
- **Billing mobile** — web a `/billing` ; mobile : rien. Décision produit requise : Apple IAP vs Stripe (le web utilise quoi ? vérifier).
- **Starter-packs mobile** — web a `/starter-packs` ; mobile : rien. Priorité basse.
- **Web : sélection de langue** — mobile a `/settings/language` (fr/en persistée) ; le web n'a aucun sélecteur de langue alors que l'i18n est complet (713 clés).
- **Web : sessions multi-comptes** — mobile a `/settings/accounts` (switch, ajout, retrait) ; pas d'équivalent web.
- **Hardening OTA** — alertes de rollback automatique (slack/webhook), surveillance du healthz `updates.qoe.fi`, logs serveur structurés (JSON).
- **Rotation de clé de code signing automatisée** — script existant (`scripts/rotate-code-signing-key.sh`) ; automatiser (cron + KMS) et documenter la procédure d'urgence.
- **Portefeuille (wallet)** — clés i18n `wallet.*` présentes côté mobile ; page billing web. Clarifier le scope produit (créateur ? tips ?) avant de construire.
- **CDN images** — routeur des images d'articles vers Bunny.net pour alléger l'infra (cf. `docs/ROADMAP_INFRA.md`).
- **e2e Playwright / tests UI** — `pnpm e2e` existe ; couvrir les settings web + onboarding.
- **Notifications push mobiles** — à vérifier si les préférences `/v1/notifications/preferences` sont câblées à un vrai canal push (APNs/FCM) ou stockage seul.

---

## ✅ Récemment terminé (pour mémoire)

- **OTA auto-hébergé** : serveur docker zéro-dépendance (manifest multipart sur `/` + `/api/manifest`, directives, signature RSA, anti-traversal), service docker-compose + Caddy `updates.qoe.fi`, CI GHCR, `publish-update.sh`, tests unitaires **12/12**, **E2E simulateur réussi** (bundle OTA téléchargé → signé → appliqué, preuve OCR). Commits : `b128507f` → `44accfad`.
- **Code signing** des manifests (paire RSA, cert public commité, clé privée gitignorée, rotation scriptée).
- **Bouton « Vérifier les mises à jour »** dans Réglages + vérification en arrière-plan (`UpdateBackgroundCheck`).
- **i18n complet** : 713 clés fr/en (settings.* + tous les écrans pré-existants), parité parfaite, test de parité en CI, fix de 2 typos ICU.
- **Préférences de lecture réellement appliquées** : `reduceMotion` (8 composants animés), `highContrast` (surcharges `useTheme`), `autoplayMedia` (hook prêt) côté mobile **et** web réactif (`ReadingPreferencesProvider`).
- **QR TOTP natif** dans Sécurité (`SvgXml`, fallback secret).
- **Réglages mobile complets** : compte (édition profil complète : bannière/avatar/bio/localisation/pronoms), notifications, confidentialité (visibilité, mots masqués, blocages), apparence & lecture, données (export, suppression), sécurité (MFA, mot de passe), langue, sessions multi-comptes.
