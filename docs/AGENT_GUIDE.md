# Guide d'Architecture et Instructions pour Agents IA (QOE.FI)

Ce document est le **point de vérité central** pour tout agent IA travaillant sur la base de code `qoe.fi`. Il décrit l'infrastructure, le design system, les choix d'architecture et les règles strictes à suivre pour maintenir la cohérence et le positionnement "Premium" de la plateforme.

---

## 1. Vision et Positionnement
**QOE.FI** se veut être une plateforme souveraine, premium et ultra-soignée pour les créateurs de contenu indépendants et leurs lecteurs. Le mot d'ordre est **l'excellence visuelle et fonctionnelle**. 
- Pas d'UI générique ou brouillonne.
- Tout doit sembler "fini", fluide, et pensé dans les moindres détails (micro-interactions, copy-writing précis).

---

## 2. Tech Stack Core
- **Framework** : Next.js (App Router)
- **Base de données / ORM** : PostgreSQL + Prisma + extension `pgvector`
- **Authentification & Backend** : Supabase
- **Paiements & Abonnements** : Stripe
- **Styling** : Tailwind CSS + utilitaires personnalisés (`globals.css`)
- **Animations** : Framer Motion
- **Internationalisation** : Tolgee

---

## 3. Le Design System : "Bento Vermillion"
C'est la règle d'or visuelle de la plateforme. **Ne jamais dévier de ce standard sur les pages internes.**

### Couleurs et Formes
- **Couleur Primaire (Vermillion)** : `#EE4B2B`. Utilisée pour les boutons principaux, les accents, et les "coques" Bento.
- **Background Général** : `#FAFAFA`.
- **Border Radius** : Arrondis très prononcés.
  - Coque externe : `rounded-[40px]`
  - Cartes internes (Bento cards) : `rounded-[32px]`
  - Éléments plus petits (boutons, inputs) : `rounded-2xl` ou `rounded-xl`.

### Structure Layout Typique (Dashboard / Pages internes)
Toutes les pages internes (Feed, Library, Highlights, Billing, Settings) utilisent une disposition en grille **3 colonnes (Sidebar) + 9 colonnes (Contenu)** sur desktop.

Le contenu de la colonne 9 est encapsulé dans une "Coque Bento" :
```tsx
<div className="bg-[#EE4B2B] rounded-[40px] p-3 shadow-xl flex flex-col gap-3">
  {/* Cartes blanches imbriquées */}
  <div className="bg-white rounded-[32px] p-5 shadow-xs border border-neutral-100">
    ... contenu ...
  </div>
</div>
```

---

## 4. Architecture de Routage (App Router)

- `/src/app/(main)` : Contient l'application principale connectée.
  - Le `layout.tsx` inclut la **`AppSidebar`** partagée. **Il n'y a pas de Navbar sur ces pages.**
- `/src/app/[locale]` : Pages publiques et Landing (avec NavbarPremium).
  - **Route Interception (Profils)** : Le routage est dynamique et intercepte les requêtes commençant par `@`. Par exemple, `qoe.fi/@username` charge la vue `ProfileDashboard`.
- `/src/app/(admin)` : Panel superadmin.
- **Multi-tenant / Domaines Personnalisés** : Géré via le `middleware.ts`. Les utilisateurs peuvent avoir un `subdomain` (ex: `marc.qoe.fi`) ou un `customDomain` (ex: `marc.com`).

---

## 5. Composants Clés à Connaître

- **`AppSidebar.tsx`** : Composant de navigation globale situé à gauche sur toutes les pages internes. Inclut le menu profil, le wallet, et les liens conditionnels (Créateur/Admin). *Si tu dois ajouter une page globale, ajoute-la ici.*
- **`FeedDashboard.tsx`** : Le cœur de l'application. Très complexe. Divisé en sub-tabs (Recommandation, Abonnement, etc.) et gère le composer de micro-posts.
- **`ProfileDashboard.tsx`** : La page de profil public (`/@username`). Gère l'affichage des articles de l'auteur, ses statistiques, et la modale d'édition de profil (pour le propriétaire).
- **`NavbarPremium.tsx`** : Uniquement pour la Landing Page et les vues publiques non connectées.

---

## 6. Base de Données (Prisma)
- **User** : Modèle central. Contient l'identité, les configs personnalisées (thème, `headerImageUrl`), le solde du portefeuille (`walletBalanceCents`), et le statut (`role: 'user' | 'creator' | 'superadmin'`).
- **Article & Post** : Les articles sont les publications longues, les Posts sont les "pensées" courtes (micro-posts).
- **Follows & Subscriber** : Les lecteurs "suivent" (Follows) et/ou "s'abonnent en premium" (Subscriber) aux créateurs.
- **Vectorisation** : Le modèle `Article` intègre un champ `embedding Unsupported("vector(1536)")?` pour la recommandation sémantique. L'IA compare la distance vectorielle pour le feed Recommandation.

---

## 7. Gestion de l'État et Mutations

- **Server Actions** : Toutes les mutations de base de données (ajout de signet, follow, édition de profil) s'effectuent via des Server Actions (les fichiers `actions.ts` dans les dossiers de page).
- **Data Fetching** : S'effectue dans les Server Components (`page.tsx`) via `prisma.model.findMany()`. Les données sont ensuite passées en props aux Client Components (`"use client"`).
- **Authentification** : Totalement gérée par `supabase-js`. Le point de vérité pour savoir si un utilisateur est connecté est `supabase.auth.getUser()`. Le modèle Prisma `User` est synchronisé mais secondaire pour la session.

---

## 8. Directives et Interdictions Strictes pour les Agents (CRITICAL)

1. **Pas de couleurs génériques Tailwind** : Bannir l'usage de `bg-gray-100`, `text-blue-500`, `text-amber-500` sans raison. Utiliser les teintes neutres (`neutral-100` à `neutral-900`) et le rouge primaire `#EE4B2B`.
2. **Ne pas reconstruire la Navbar dans le layout connecté** : La navigation se fait via `AppSidebar`.
3. **Centralisation du Profil** : L'édition de l'avatar, du nom, de la bio et de la bannière se fait **exclusivement** via la modale d'édition de `ProfileDashboard.tsx`. Ne pas dupliquer ces champs dans la page Settings.
4. **Gestion de l'État** : Privilégier les Server Components pour le data fetching (via `prisma.xyz.find...`), puis passer les données nécessaires en props aux Client Components interactifs (`"use client"`).
5. **Micro-animations** : Toujours utiliser `framer-motion` (`<AnimatePresence>` et `<motion.div>`) pour l'apparition d'éléments, l'ouverture de menus ou de dropdowns. Les transitions doivent être fluides (ex: `springTransition`).
6. **Icons** : Toujours utiliser `lucide-react`.
7. **Boutons** : Les boutons CTA principaux doivent être pleins : `bg-[#EE4B2B] text-white hover:bg-[#d63d20] transition-colors rounded-xl font-bold`.
8. **Gestion des Erreurs** : Ne jamais laisser un Server Action throw une erreur crue. Toujours retourner un objet standard `{ success: false, error: "Message" }` pour que le client l'affiche élégamment via un toast ou un state local.

---

## 9. Workflow de Développement
1. **Analyser le contexte** : Avant de modifier une page, toujours regarder si une page similaire (ex: `library/page.tsx` ou `billing/page.tsx`) a déjà implémenté le style Bento Vermillion.
2. **Ne pas casser l'existant** : Le projet est vaste. Si tu modifies une interface (ex: un User), assure-toi de mettre à jour le schéma Prisma et les `select` correspondants dans les requêtes de fetching.
3. **Tolgee** : Si des textes statiques sont ajoutés sur les pages publiques (`/[locale]/...`), penser à utiliser le hook `useTranslate()` ou les clés Tolgee. Pour les pages internes (`/(main)/...`), le français est la langue par défaut codée en dur.

Ce guide doit être lu avant toute refonte architecturale ou ajout de fonctionnalité majeure.
