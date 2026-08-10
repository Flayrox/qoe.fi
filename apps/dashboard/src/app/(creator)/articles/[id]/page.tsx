// =====================================================================
// 🖥️ Edit Article Page — apps/dashboard/src/app/(creator)/dashboard/articles/[id]/page.tsx
// =====================================================================
// 📖 Page d'édition d'un article existant avec l'éditeur riche.
// =====================================================================

import { getArticleByIdAction, getCategoriesAction } from "@qoe/api-client/actions/articles"

import { EditArticleClient } from "./edit-article-client"
import { notFound } from "next/navigation"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ArticleEditPage({ params }: PageProps) {
  const { id } = await params

  try {
    const [articleRes, categoriesRes] = await Promise.all([
      getArticleByIdAction(id),
      getCategoriesAction(),
    ])

    if (!articleRes.ok || !articleRes.data) {
      notFound()
    }

    const article = articleRes.data
    const categoriesList = categoriesRes.ok ? categoriesRes.data : []

    return (
      <EditArticleClient
        article={article}
        categories={categoriesList.map((c: any) => ({ id: c.id, name: c.name }))}
      />
    )

  } catch (error) {
    console.error("Error loading article:", error)
    notFound()
  }
}
