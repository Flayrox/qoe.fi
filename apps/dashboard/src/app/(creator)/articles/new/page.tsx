// =====================================================================
// 🖥️ New Article Page — apps/dashboard/src/app/(creator)/dashboard/articles/new/page.tsx
// =====================================================================
// 📖 Page de création d'un nouvel article avec l'éditeur riche.
// =====================================================================

import { getCategoriesAction } from "../actions"
import { NewArticleClient } from "./new-article-client"

export default async function NewArticlePage() {
  const categories = await getCategoriesAction()

  return (
    <NewArticleClient 
      categories={categories.map((c) => ({ id: c.id, name: c.name }))} 
    />
  )
}
