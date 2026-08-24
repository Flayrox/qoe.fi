# Audit et Architecture qoe.fi

## 1. Audit de Code (Qualité & Robustesse)

### [CRITIQUE] Typages dangereux et erreurs silencieuses

- **Problème** : Utilisation massive de `any` dans le typage des props, des retours d'API et Prisma (`post: any`, `err: any`), ainsi que des casts dangereux (`as any` sur les `<Link href>`). Dans un monorepo TypeScript, `any` annule l'inférence. Si le schéma Prisma change, les composants UI ne crasheront pas à la compilation mais en production.
- **Fichiers concernés** :
  - `apps/studio/src/app/(creator)/articles/articles-client.tsx`
  - `apps/studio/src/features/settings/components/creator-studio-legacy.tsx`
  - `apps/studio/src/components/feed/ArticleCard.tsx`
  - `apps/core/src/app/(reader)/home/page.tsx`
- **Solution recommandée** :
  - Remplacer tous les `any` par des types d'inférence stricts Prisma (`Prisma.PostGetPayload<{ include: {...} }>`).
  - Caster les erreurs correctement dans les catch : `catch (err: unknown) { if (err instanceof Error) { ... } }`.

### [ÉLEVÉE] N+1 Queries potentielles (Feed Page)

- **Problème** : La page principale du feed effectue actuellement environ 13 requêtes Prisma distinctes en parallèle dans un `Promise.all`. Cela surcharge la base de données.
- **Fichier concerné** : `apps/core/src/app/(reader)/home/page.tsx`
- **Solution recommandée** : Implémenter un cache (Redis/LRU ou Next.js `unstable_cache`) pour les requêtes à forte lecture comme `trendsPromise` ou `promosPromise` qui n'ont pas besoin d'être fetchées à la volée pour chaque utilisateur.

### [MOYENNE] Incohérences de nommage et duplication de formulaires

- **Problème** : Le `LoginModal.tsx` contient une implémentation complète des formulaires d'authentification, tout comme la vraie page `/login`. Cela duplique la logique UI et les hooks.
- **Solution recommandée** : Extraire les formulaires d'authentification (`MagicLink`, `Password`, `Signup`) dans un composant UI partagé.

## 2. Refactoring : Authentification & Architecture "Public Read-Only Feed"

### Redirection stricte pour les utilisateurs connectés

- **Problème** : Les middlewares permettaient aux utilisateurs connectés d'accéder à `/login` ou `/register`, créant une incohérence d'état.
- **Solution appliquée** : Les middlewares interceptent strictement tout accès à `/login` ou `/register` si `user` est défini et redirigent proprement vers `/home` sans flicker.
  _Modifications : `apps/core/middleware.ts` (etc.)_

### Architecture "Public Read-Only Feed" (Modèle Twitter/Substack)

- **Objectif** : Rendre le feed accessible aux visiteurs non connectés tout en bloquant les interactions (mutations).
- **Implémentation** :
  1. **Layout / Routing** : Suppression de la redirection brutale `if (!user) redirect("/login")` dans le layout principal (`apps/core/src/app/(reader)/layout.tsx`). `dbUser` peut désormais être `null`.
  2. **Guard d'Interception UI** : Création du hook universel `useAuthGuard()` (`apps/core/src/lib/use-auth-guard.ts`). Il enveloppe les actions (Like, Follow, Bookmark) et déclenche le modal d'authentification (`LoginModal.tsx`) si l'utilisateur n'est pas loggué, sans casser l'expérience de lecture.
  3. **Sécurisation Backend (Zero Trust)** : Toutes les mutations serveur (`actions.ts`) valident strictement la session avec `supabase.auth.getUser()` et rejettent les appels non authentifiés avec un statut d'erreur clair.

---

_Ce document sert de base pour la standardisation du codebase et l'amélioration continue de la plateforme._
