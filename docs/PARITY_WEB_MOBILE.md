# 📊 Parité Web / Mobile — Audit & plan d'action

> Audit comparatif **vérifié sur le code** (routes, features, endpoints) entre :
> **Web** : `apps/core` (Next.js, groupe `(reader)`) — **Mobile** : `apps/mobile` (Expo).
> Légende : ✅ parité · ◐ partielle / à vérifier · ❌ manque d'un côté · N/A hors scope.

---

## 1. Matrice de parité

| Fonctionnalité                                                                                 | Web (core)                                                                                 | Mobile                                                                                                                                    | Écart                                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Réglages — sections**                                                                        | 6 sections (`account`, `notifications`, `privacy`, `appearance`, `data`, `security`)       | 10 écrans : les 6 + `language`, `accounts`, `edit-profile`, `index`                                                                       | ✅ mobile ⊇ web (le web manque langues + multi-comptes) |
| **Préférences de lecture** (reduceMotion, highContrast, autoplayMedia, fontScale, defaultFeed) | Toggles **réactifs** (`ReadingPreferencesProvider`, attrs `data-qoe-*`)                    | Toggles + **appliquées** (8 composants animés, surcharges `useTheme`, hook `useAutoplayMedia`)                                            | ✅                                                      |
| **MFA / TOTP**                                                                                 | settings/security (QR SVG)                                                                 | settings/security (QR natif `SvgXml`)                                                                                                     | ✅                                                      |
| **Édition de profil**                                                                          | `EditProfileModal` (name, username, bio/heroText, bannière, avatar, localisation, pronoms) | `settings/edit-profile.tsx`                                                                                                               | ✅ (vérif champ-à-champ lors d'un run)                  |
| **Données & suppression** (export, demande suppression, sync)                                  | settings/data                                                                              | settings/data                                                                                                                             | ✅                                                      |
| **Confidentialité** (visibilité, mentions, mots masqués, blocages)                             | settings/privacy                                                                           | settings/privacy                                                                                                                          | ✅                                                      |
| **Notifications**                                                                              | `/notifications`                                                                           | tab `notifications` + écran dédié                                                                                                         | ✅                                                      |
| **Recherche**                                                                                  | `/search`                                                                                  | tab `explore` + `features/search`                                                                                                         | ✅                                                      |
| **Bibliothèque**                                                                               | `/library`                                                                                 | tab `library` (**bookmarks + highlights**)                                                                                                | ✅                                                      |
| **Highlights**                                                                                 | `/highlights` (page dédiée) + surlignage                                                   | surlignage article + onglet Highlights en Bibliothèque                                                                                    | ◐ pas de page dédiée mobile (suffisant ?)               |
| **Article**                                                                                    | `/article/[slug]` — **aucune toolbar de lecture détectée**                                 | `article/[slug]` — toolbar (bookmark, highlights), préférences lecture                                                                    | ◐ le mobile est **en avance** côté lecture              |
| **Profil utilisateur**                                                                         | `/[username]` + tabs `[username]/[tab]`                                                    | `user/[username]` + `follow`                                                                                                              | ◐ vérifier la parité des tabs profil                    |
| **Posts / Thoughts**                                                                           | `/[username]/thought/[id]` + fils                                                          | `post/[id]/[kind]`, `thought/[id]`                                                                                                        | ✅                                                      |
| **Composer**                                                                                   | web : `ThoughtComposer` dans le feed (« compose.* » côté mobile)                           | `compose.tsx`                                                                                                                             | ◐ web n'a pas de route composer dédiée (widget inline)  |
| **Historique de lecture**                                                                      | `/history` — **`GET /v1/me/reading-history`**                                              | ❌ **absent**                                                                                                                             | ❌ **manque mobile**                                    |
| **Onboarding**                                                                                 | `/onboarding` complet (setup profil, suggestions)                                          | ❌ **absent** (inscription → app directe)                                                                                                 | ❌ **manque mobile**                                    |
| **Billing / abonnements**                                                                      | `/billing`                                                                                 | ❌ absent                                                                                                                                 | ❌ **manque mobile** (décision IAP vs Stripe)           |
| **Starter-packs**                                                                              | `/starter-packs` (+ `[id]`)                                                                | ❌ absent                                                                                                                                 | ❌ manque mobile (basse priorité)                       |
| **Sessions multi-comptes**                                                                     | ❌ absent                                                                                  | `settings/accounts.tsx` (switch/ajout/retrait)                                                                                            | ❌ **manque web**                                       |
| **Langue (fr/en)**                                                                             | ❌ aucun sélecteur (i18n pourtant complet : 713 clés)                                      | `settings/language.tsx` persistée                                                                                                         | ❌ **manque web**                                       |
| **Messages (DMs)**                                                                             | ❌ rien                                                                                    | tab `messages` = **stub** (0 appel API — « messagerie chiffrée » annoncée mais non construite) ; aucun module conversations dans l'API Go | ❌ **manque partout** (feature complète à créer)        |
| **Updates OTA**                                                                                | N/A (déploiement web classique)                                                            | bouton « Vérifier les mises à jour » + check en arrière-plan + code signing                                                               | N/A                                                     |

---

## 2. Plan d'action priorisé

### P0 — Parité rapide (petit, API existantes)

1. **Écran « Historique de lecture » mobile** _(S)_
   - Endpoint : `GET /v1/me/reading-history?days=14` → `{ sessions: HistorySession[], count }` — **déjà implémenté en Go** (`apps/api/internal/modules/tracking/handler.go`, avec handler tests) et consommé par le web (`apps/core/src/app/(reader)/history/page.tsx`) : aucun travail backend nécessaire.
   - UI : écran dans la Bibliothèque ou route dédiée ; liste des articles lus regroupés par jour (shape `sessions` à confirmer à la lecture du handler Go).
   - i18n : clés `history.*` à extraire/compiler (fr/en).
2. **Parité champ-à-champ du profil** _(S)_ — diff `edit-profile.tsx` mobile vs `EditProfileModal` web (vérifier pronoms, localisation, bannière) ; aligner s'il manque quelque chose.

### P1 — Produit (moyen/gros)

3. **Outils d'accessibilité & lecture sur la page Article** _(M)_ — **vision produits du projet** :
   - **Web** : la page article est minimale → créer une toolbar de lecture réutilisant `ReadingPreferencesProvider` (taille de police, contraste, réduire animations, police adaptée, autoplay des médias) **directement configurable sur l'article**.
   - **Mobile** : enrichir la toolbar article existante avec les mêmes contrôles (fontScale, contraste) en appliquant `useUserSettings`.
4. **Onboarding mobile** _(L)_ — parité web : setup profil (nom, bannière, bio, localisation), suggestions de comptes à suivre, préférences initiales. Réutiliser `settings/edit-profile.tsx` + API existantes.
5. **Vérif HTTPS OTA + test réel du rollback embedded** _(S, bloqué par DNS)_ — `docs/BACKLOG.md` 🔴 #3-#4.

### P2 — Backlog

6. **DMs** (gros) — backend conversations manquant ; voir `docs/BACKLOG.md` 💡.
7. **Billing mobile** — décision produit IAP vs Stripe.
8. **Web : sélecteur de langue** — petit, i18n déjà complet.
9. **Web : sessions multi-comptes** — portage du pattern mobile.
10. **Starter-packs mobile** — parité low-cost après P0.

---

## 3. Prochaines étapes recommandées

1. ~~Audit de parité~~ ✅ **(ce document)**
2. **P0 #1 : Historique de lecture mobile** — le meilleur ratio valeur/effort (API déjà en prod web).
3. **P0 #2 : audit champ-à-champ édition profil** — rapide, évite les régressions.
4. Ensuite trancher P1 selon la priorité produit (outils de lecture article vs onboarding).
