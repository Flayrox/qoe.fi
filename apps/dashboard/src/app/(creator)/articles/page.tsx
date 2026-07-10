// =====================================================================
// 🖥️ Articles Index Page — apps/dashboard/src/app/(creator)/dashboard/articles/page.tsx
// =====================================================================
// 📖 Page principale de gestion des articles et catégories.
//    Server-side data fetching et passage au client interactif.
// =====================================================================

import { getArticlesAction, getCategoriesAction } from "./actions"
import { ArticlesClient } from "./articles-client"

export default async function ArticlesPage() {
  // Récupération initiale des données sur le serveur (Server Action ou Prisma direct)
  const [articles, categories] = await Promise.all([
    getArticlesAction(),
    getCategoriesAction(),
  ])

  return (
    <div className="py-4">
      <ArticlesClient 
        initialArticles={articles} 
        initialCategories={categories} 
      />
    </div>
  )
}
