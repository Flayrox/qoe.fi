# Plan d'Action Détaillé (QOE.FI)

Ce document détaille les étapes d'implémentation pour les prochaines phases d'amélioration de l'architecture et de l'expérience utilisateur de QOE.FI, en respectant les standards stricts définis dans le `AGENT_GUIDE.md`.

## 1. Implémenter le Wrapper typé pour les Server Actions (Architecture)

**Objectif :** Standardiser la gestion des erreurs et le typage des retours des Server Actions pour garantir une robustesse côté client. Actuellement, la règle 8 du guide interdit de laisser une Server Action "throw" une erreur crue.

- **Étape 1.1 : Création du type de retour standard**
  - Créer un fichier `src/lib/types/actions.ts` (ou équivalent).
  - Définir un type générique `ActionResponse<T>` : `{ success: true, data: T } | { success: false, error: string }`.
- **Étape 1.2 : Implémentation du Wrapper (HOC/Helper)**
  - Créer une fonction utilitaire `withActionWrapper` dans `src/lib/utils/actions.ts`.
  - Cette fonction doit envelopper toute Server Action, capturer les exceptions `try/catch`, et retourner systématiquement le format `ActionResponse`.
  - Gérer les erreurs de validation (ex: Zod) et les formater de manière lisible pour le client.
- **Étape 1.3 : Refactoring progressif des actions existantes**
  - Identifier les fichiers `actions.ts` critiques (ex: `src/app/(main)/settings/actions.ts`, `src/app/(admin)/admin/actions.ts`).
  - Remplacer les retours bruts par le wrapper typé.
  - Mettre à jour les composants clients correspondants (ex: `SettingsForm.tsx`) pour utiliser la nouvelle signature et afficher les toasts d'erreur/succès via ce standard.

## 2. Standardiser les Micro-interactions Framer Motion (UI/UX)

**Objectif :** Uniformiser les animations et transitions selon la vision "Premium" et le design system "Bento Vermillion" (Règle 5).

- **Étape 2.1 : Définir les profils d'animation centraux**
  - Créer un fichier `src/lib/animations/motion-profiles.ts`.
  - Exporter des configurations standardisées (variantes Framer Motion) pour :
    - `springTransition` (la transition de base recommandée).
    - `fadeUpVariant` (pour l'apparition des éléments dans la grille Bento).
    - `dropdownVariant` (pour l'ouverture des menus).
- **Étape 2.2 : Créer des composants utilitaires d'animation**
  - Créer `AnimatedBentoCard.tsx` encapsulant `<motion.div>` avec le profil `fadeUpVariant`.
  - Mettre à jour `Reveal.tsx` si nécessaire pour utiliser ces standards.
- **Étape 2.3 : Auditer et refactoriser l'UI existante**
  - Intégrer `<AnimatePresence>` sur les dropdowns et modales existantes (ex: dans `AppSidebar.tsx`, `ProfileDashboard.tsx`).
  - S'assurer que chaque apparition d'élément au montage utilise une animation fluide.

## 3. Ajouter l'index HNSW/IVFFlat pour pgvector (Prisma/DB)

**Objectif :** Améliorer les performances des requêtes de similarité sémantique pour les recommandations d'articles, en utilisant des index vectoriels.

- **Étape 3.1 : Définition de l'index dans Prisma**
  - Modifier `prisma/schema.prisma` pour le modèle `Article`.
  - L'extension `pgvector` est déjà présente. Il faut s'assurer que l'index est déclaré (souvent Prisma nécessite une configuration spécifique ou une migration manuelle via `db execute` pour créer l'index HNSW ou IVFFlat).
  - *Note : Si Prisma ne supporte pas nativement la création d'index vectoriel via la syntaxe du schéma, préparer la migration SQL.*
- **Étape 3.2 : Création de la migration SQL**
  - Générer une migration vide : `npx prisma migrate dev --create-only`.
  - Ajouter la commande SQL pour créer l'index HNSW sur la colonne `embedding` : `CREATE INDEX ON "Article" USING hnsw (embedding vector_cosine_ops);` (ou `vector_l2_ops` selon la mesure de distance).
- **Étape 3.3 : Optimisation des requêtes de recommandation**
  - Vérifier les requêtes dans `FeedDashboard` ou ses actions associées.
  - S'assurer que les requêtes Prisma/Raw SQL utilisent les opérateurs pertinents (`<=>` pour cosine) afin que l'index HNSW soit utilisé par le planificateur de requêtes Postgres.

## 4. Consolider l'architecture Multi-tenant dans `middleware.ts` (Sécurité/Performance)

**Objectif :** Renforcer la robustesse et la performance du routage multi-tenant (sous-domaines et domaines personnalisés).

- **Étape 4.1 : Mise en cache des règles de résolution**
  - Le middleware est exécuté à chaque requête. Évaluer si des requêtes externes ou à la DB y sont faites.
  - Si oui, implémenter une stratégie de cache edge (ou via un store Redis si disponible) ou utiliser des Edge Configs pour la résolution des domaines personnalisés sans surcharger la DB à chaque appel.
- **Étape 4.2 : Sécurisation et gestion des headers**
  - S'assurer que le middleware propage correctement les identifiants de tenant (headers personnalisés comme `x-tenant-domain`) vers les Server Components.
- **Étape 4.3 : Refactoring du routage d'interception**
  - Valider le comportement du middleware face au routage public (`/[locale]`) et au routage dynamique par interception (`/@username`).
  - Ajouter des tests ou des logs structurés dans le middleware pour monitorer les redirections multi-tenant et prévenir les boucles infinies.

## 5. Refactoriser `FeedDashboard.tsx` avec le pattern Component Composition (Maintenabilité)

**Objectif :** Simplifier le composant `FeedDashboard.tsx`, décrit comme "très complexe" dans le guide, en le découpant intelligemment.

- **Étape 5.1 : Séparation des responsabilités (Data vs UI)**
  - Extraire la logique de data fetching complexe (si elle existe au niveau du parent) dans des Server Components plus petits ou des hooks dédiés si côté client.
- **Étape 5.2 : Pattern Component Composition**
  - Découper `FeedDashboard.tsx` en sous-composants : `FeedTabs`, `RecommendationFeed`, `SubscriptionFeed`, `MicroPostComposer`.
  - Utiliser l'inversion de contrôle (passer des composants enfants en `children`) pour réduire le prop-drilling et la taille du fichier principal.
- **Étape 5.3 : Respect du Design System Bento**
  - S'assurer que la restructuration maintient scrupuleusement l'architecture "3 + 9 colonnes" et la structure de coque Bento Vermillion (`bg-[#EE4B2B] rounded-[40px]`).

## 6. Implémenter la stratégie de mise en cache agressive (Next.js Data Cache)

**Objectif :** Réduire la charge de la base de données et améliorer le temps de réponse (TTFB) pour les contenus publics et peu changeants.

- **Étape 6.1 : Identifier les endpoints et pages éligibles**
  - Cibles prioritaires : Pages publiques (`ProfileDashboard` pour les non-connectés, Landing Page, Articles publics via tenant).
  - Identifier les requêtes Prisma correspondant à ces vues.
- **Étape 6.2 : Implémentation du Cache Next.js (unstable_cache / revalidate)**
  - Envelopper les fonctions de data fetching (ex: `getArticleBySlug`, `getCreatorProfile`) avec `unstable_cache` de Next.js.
  - Définir des tags de cache appropriés (ex: `['article', articleId]`, `['profile', username]`).
- **Étape 6.3 : Stratégie de Revalidation (On-demand)**
  - Dans les Server Actions pertinentes (ex: édition d'article, mise à jour de profil), utiliser `revalidateTag` ou `revalidatePath` pour purger le cache immédiatement après une mutation réussie, garantissant ainsi des données à jour sans compromettre les performances.
