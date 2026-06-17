// =====================================================================
// ðŸ–¥ï¸ Articles Index Page â€” apps/dashboard/src/app/(creator)/dashboard/articles/page.tsx
// =====================================================================
// ðŸ“– Page principale de gestion des articles et catÃ©gories.
//    Server-side data fetching et passage au client interactif.
// =====================================================================

import { getArticlesAction, getCategoriesAction } from "./actions"
import { ArticlesClient } from "./articles-client"

export default async function ArticlesPage() {
  // RÃ©cupÃ©ration initiale des donnÃ©es sur le serveur (Server Action ou Prisma direct)
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
