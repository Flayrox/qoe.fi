# 🗺️ TODO — qoe.fi Creator Dashboard

> Session du 2026-08-04 — Blocage infra résolu. On peut maintenant avancer sur le design.

---

## ✅ Fait aujourd'hui (2026-08-04)

- **Architecture multi-domaine universelle** : `getMonorepoUrl()` dans `@qoe/config`
- **Middleware Étape 0** : canonicalisation `localhost` → `lvh.me` dans dashboard, admin, feed
- **`requireUser()` corrigé** : redirect vers la page de login centrale absolue avec bon `?redirect=`
- **Supabase middleware** : gestion gracieuse refresh tokens invalides, purge cookies `sb-*` conditionnelle
- **DevTools** : suppression auto-refresh 8s, fix hydration SSR, `signOut()` avant impersonation
- **Sidebar** : theme-agnostic (tokens CSS sémantiques), `Link` Next.js, `SidebarRail`
- **Linter** : suppression de tous les `as any`, tokens Tailwind bruts → tokens sémantiques
- **DESIGN.md + architecture.md** : règles anti-AI-slop, 2 couches `@qoe/theme`, référence Apple Music Web

---

## 🚧 Reste à faire

### 1. DevTools — Pollution terminal restante

> Le DevTools est aussi dans `apps/feed/src/app/layout.tsx`. Si le cache Turbo est encore chaud,
> des appels `getDevtoolsData` peuvent encore apparaître en logs. À surveiller après un `pnpm dev:win` frais.

- [ ] Vérifier que les logs Prisma `getDevtoolsData` ont disparu après un redémarrage propre
- [ ] Si persistant : inspecter si l'`useEffect` hydration a bien éliminé le setInterval

---

### 2. 🎨 Design Creator Dashboard (`apps/dashboard`) — Phase 2 à 4

> Le gros du travail qui avait été planifié mais bloqué par les bugs auth/domaine.
> Référence : [`design/DESIGN.md`](file:///d:/Files/DEV/Main/qoe.fi/design/DESIGN.md) — Style Apple Music Web

#### Phase 2 — Main Stage Layout Shell & Header

- [ ] **Header global** (`HeaderClient.tsx`) : barre compacte 44–56px, breadcrumb dynamique, actions rapides
- [ ] **Layout coquille** (`(creator)/layout.tsx`) : `bg-background`, padding équilibré, séparateurs `border-border/40`
- [ ] **Zone de défilement** : overflow-y-auto smooth, padding latéral responsive

#### Phase 3 — Creator Studio Home (`page.tsx`)

- [ ] **Vue d'ensemble** (accueil dashboard) : stats articles, abonnés, vues, revenus
- [ ] **Rangées fluides** (44px height) style liste Apple Music
- [ ] **Cartes stats** : tokens sémantiques `bg-card`, `text-card-foreground`
- [ ] **Actions rapides** : "Nouvel article", "Voir mon blog", "Voir les stats"
- [ ] **Activité récente** : derniers articles publiés, derniers abonnés

#### Phase 4 — Page Articles (`articles-client.tsx`)

- [ ] **Liste articles** : rangées fluides, tri par date, filtre par catégorie
- [ ] **Badge statut** : publié/brouillon en tokens sémantiques (pas de couleurs hardcodées)
- [ ] **Actions inline** : éditer, supprimer, dupliquer
- [ ] **Empty state** : illustration + CTA "Écrire mon premier article"
- [ ] **Pagination** ou scroll infini

---

### 3. 🌑 Dark Mode "Onyx" (Apple Dark)

- [ ] Définir les valeurs sémantiques `.dark` dans `packages/theme/src/styles/semantic.css`
  - `--background: --zinc-950`, `--foreground: --zinc-0`, `--card: --zinc-900`, etc.
- [ ] Toggle thème dans le Header (bouton soleil/lune)
- [ ] Vérifier que 100% des composants dashboard utilisent uniquement les tokens sémantiques
- [ ] Tester le basculement Light → Dark sans aucun artefact visuel

---

### 4. 🔐 Auth & Session — Finitions

- [ ] **Magic link** : tester le flow complet OTP email → callback → redirect vers dashboard
- [ ] **OAuth Google/Apple** : vérifier le `redirectTo` vers `/auth/callback` sur `lvh.me:3010`
- [ ] **Onboarding** : vérifier que le redirect post-inscription arrive bien sur `/onboarding`
- [ ] **Session persistante** : vérifier que rester connecté 24h+ ne trigger pas de re-login

---

### 5. 🛤️ Navigation Dashboard — Liens restants à vérifier

> Certains boutons de la sidebar peuvent encore pointer vers `localhost` si non convertis en `Link`.

- [ ] Auditer **tous** les `<a href="...">` dans la sidebar → convertir en `<Link>`
- [ ] Vérifier les liens "Aperçu blog" → doivent pointer vers `[subdomain].lvh.me:3001`
- [ ] Vérifier les liens "Voir en production" → doivent utiliser `getMonorepoUrl("tenant", host, subdomain)`

---

### 6. 🧹 Tech Debt

- [ ] `apps/admin/src/app/(admin)/admin/layout.tsx` : remplacer les URL hardcodées par `getMonorepoUrl`
- [ ] `apps/feed/src/app/login/actions.ts` : remplacer `redirect('/onboarding')` par une URL absolue si besoin cross-domaine
- [ ] `packages/supabase/src/cookie-config.ts` : supprimer le `as any` restant
- [ ] Auditer tous les fichiers pour traces résiduelles de `localhost:3020`, `localhost:3030` hardcodés

---

### 7. 📊 Pages Dashboard à créer / compléter

| Page | Statut | Priorité |
|---|---|---|
| `/` (Home Studio) | Coquille vide | 🔴 Haute |
| `/articles` | Fonctionnel, design à refaire | 🔴 Haute |
| `/articles/[id]` (Éditeur) | Fonctionnel | 🟡 Moyen |
| `/settings` | Manquant | 🟡 Moyen |
| `/analytics` | Manquant | 🟢 Bas |
| `/subscribers` | Manquant | 🟢 Bas |
| `/billing` | Manquant | 🟢 Bas |

---

### 8. 🚀 Production & Déploiement

- [ ] Vérifier que `NEXT_PUBLIC_ROOT_DOMAIN=qoe.fi` est dans les variables d'env prod
- [ ] Tester `getMonorepoUrl` en mode `NODE_ENV=production` → URLs sans port
- [ ] Vérifier le Caddyfile prod (`docker/caddy/Caddyfile`) : wildcard `*.qoe.fi` actif
- [ ] Vérifier le cookie Supabase `.qoe.fi` en production
