// =====================================================================
// ðŸ–¥ï¸ New Article Page â€” apps/dashboard/src/app/(creator)/dashboard/articles/new/page.tsx
// =====================================================================
// ðŸ“– Page de crÃ©ation d'un nouvel article avec l'Ã©diteur riche.
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
