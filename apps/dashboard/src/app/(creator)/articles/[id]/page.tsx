// =====================================================================
// 🖥️ Edit Article Page — apps/dashboard/src/app/(creator)/dashboard/articles/[id]/page.tsx
// =====================================================================
// 📖 Page d'édition d'un article existant avec l'éditeur riche.
// =====================================================================

import { getArticleByIdAction, getCategoriesAction } from "../actions"
import { EditArticleClient } from "./edit-article-client"
import { notFound } from "next/navigation"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ArticleEditPage({ params }: PageProps) {
  const { id } = await params

  try {
    const [article, categories] = await Promise.all([
      getArticleByIdAction(id),
      getCategoriesAction(),
    ])

    if (!article) {
      notFound()
    }

    return (
      <EditArticleClient
        article={article}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    )
  } catch (error) {
    console.error("Error loading article:", error)
    notFound()
  }
}
