# Architecture Système : Navigation par Onglets Dynamiques & Écosystème Social

Ce document détaille l'architecture frontend et backend pour la refonte majeure de l'interface utilisateur de QOE.FI. L'objectif est de transformer la plateforme en une application web d'ingénierie design de classe mondiale, s'inspirant des standards des leaders de l'industrie (Arc Browser, Linear, Vercel).

---

## 1. Vision et Inspirations Design

*   **Le paradigme du "Browser-like"** : Remplacer la navigation traditionnelle par un système d'onglets persistants en haut de l'écran. 
*   **Immersivité** : L'ouverture d'un article ou d'un post étendu ne doit plus rediriger rudement l'utilisateur, mais s'ouvrir comme une "feuille" spatiale ou un nouvel onglet, préservant la mémoire spatiale du contexte d'origine.
*   **Iconographie Vectorielle Pure** : Remplacement complet de bibliothèques tierces comme `lucide-react` par notre propre système de composants SVG ultra-optimisés, injectés en ligne pour réduire le TTI (Time to Interactive) et garantir des tracés parfaits au sous-pixel.

---

## 2. Système d'Onglets et Rétention d'État (State Management)

La complexité principale réside dans le basculement instantané entre l'onglet "Flux" (Timeline) et divers "Articles" ouverts simultanément, avec une **conservation absolue de la position de défilement (scroll) et de l'état local**.

### Choix Technologiques :
1.  **State Manager Global** : **Zustand**
    *   *Pourquoi ?* Plus léger que Redux, parfait pour gérer un tableau complexe d'objets "Tabs" sans re-rendre l'arbre entier de l'application. Zustand stockera la liste des onglets ouverts (`id`, `type`, `url`, `title`, `scrollPosition`).
2.  **Routing Stratégique (Next.js App Router)** :
    *   Le layout principal ne détruira pas les composants des onglets inactifs. Au lieu d'utiliser un routing pur (`router.push`) qui "unmount" la page précédente, l'URL sera synchronisée via l'API **`window.history.pushState`** (ou via la librairie **`nuqs`**).
3.  **Rétention d'État Virtuel (Virtual DOM)** :
    *   Plutôt que d'utiliser un simple rendu conditionnel `{activeTab === id && <Tab />}` qui efface l'état du DOM, nous utiliserons un conteneur qui masque les onglets inactifs : `className={activeTab === id ? "block" : "hidden"}`. 
    *   Ceci garantit que la position de scroll native de la `div` de l'onglet reste gelée en mémoire par le navigateur.

---

## 3. Écosystème Social Immersif (Post Extended View)

L'ajout de commentaires imbriqués, de reposts et de likes nécessite une évolution du schéma Prisma et de la logique Supabase.

### Schéma Base de Données (Prisma / Supabase)

```prisma
model Post {
  id          String   @id @default(cuid())
  content     String   @db.Text
  authorId    String   @db.Uuid
  author      User     @relation(fields: [authorId], references: [id])
  
  // Système Social
  parentId    String?  // Si c'est un commentaire
  parent      Post?    @relation("PostReplies", fields: [parentId], references: [id])
  replies     Post[]   @relation("PostReplies")
  
  repostId    String?  // Si c'est un repost
  repost      Post?    @relation("PostReposts", fields: [repostId], references: [id])
  reposts     Post[]   @relation("PostReposts")
  
  likes       Like[]
  
  createdAt   DateTime @default(now())
}

model Like {
  id        String   @id @default(cuid())
  postId    String
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  userId    String   @db.Uuid
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([postId, userId])
}
```

### Mécanique Frontend Sociale
*   **Optimistic UI** : Lorsqu'un utilisateur clique sur "Like" ou "Repost", le compteur s'incrémente immédiatement côté client grâce au state React, avant même que la Server Action ne réponde. Si l'action échoue, l'état est "rollbacked" silencieusement.
*   **Commentaires Imbriqués (Nested Replies)** : Rendu récursif de composants `<CommentThread />` limités à une profondeur visuelle maximale (ex: 3 niveaux) au-delà de laquelle un bouton "Voir le fil de discussion" apparaît.

---

## 4. Schéma Architectural de Haut Niveau

```mermaid
graph TD
    %% Frontend Layer
    subgraph Frontend [Next.js Client (React 19)]
        TS[TabStore Zustand]
        Router[Next.js App Router]
        
        subgraph ViewManager [Tab View Manager]
            TF[Feed Tab - Block/Hidden]
            TA1[Article 1 Tab - Block/Hidden]
            TA2[Article 2 Tab - Block/Hidden]
        end
        
        Router --> TS
        TS --> ViewManager
    end

    %% Network Layer
    subgraph API [Next.js Server Actions]
        SA_Post[createPost / replyPost]
        SA_Like[toggleLike]
        SA_Fetch[getCachedThread]
    end

    %% Backend Layer
    subgraph Database [Supabase / PostgreSQL]
        Prisma[(Prisma ORM)]
        DB[(PostgreSQL)]
        Edge[Supabase Edge Functions]
    end

    TF -- "Fetch / Mutations" --> API
    TA1 -- "Fetch / Mutations" --> API
    API --> Prisma
    Prisma --> DB
```

---

## 5. Méthodologie d'Implémentation (Étape par Étape)

1.  **Phase 1 : Refonte Iconographique et Fondation Tabulaire**
    *   Créer un dossier `src/components/icons/` pour abriter tous les SVGs personnalisés.
    *   Remplacer progressivement toutes les occurrences de `lucide-react`.
    *   Installer et configurer Zustand. Créer le store d'onglets `useTabStore`.

2.  **Phase 2 : Restructuration du Layout Principal (`layout.tsx` / `FeedDashboard.tsx`)**
    *   Créer le composant `TabBar.tsx` (le "navigateur web" interne) qui se place en haut de l'interface.
    *   Modifier `FeedDashboard.tsx` pour qu'il devienne l'un des composants enfants gérés par le `TabViewManager`.
    *   Ajouter le bouton "Ouvrir dans un onglet" sur les composants `ArticleCard.tsx`.

3.  **Phase 3 : Évolution de la Base de Données (Écosystème Social)**
    *   Modifier le fichier `prisma/schema.prisma` pour implémenter les modèles `Like`, les relations parent/enfant sur `Post` (Commentaires), et les `Reposts`.
    *   Créer les migrations via `supabase db push` ou raw SQL (comme utilisé précédemment) pour éviter la perte de données sur l'environnement de développement.

4.  **Phase 4 : Vue Immersive Post & Optimistic UI**
    *   Créer le composant `ExpandedPostView.tsx` qui affiche le post en grand format.
    *   Implémenter le fil de commentaires récursif avec animations Framer Motion.
    *   Finaliser la logique des Server Actions (ajout de likes, publication de commentaires) couplée aux mises à jour d'état optimistes côté client.
