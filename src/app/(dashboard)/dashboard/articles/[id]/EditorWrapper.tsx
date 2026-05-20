"use client"

import { Editor } from "@/features/editor/components/Editor"
import { saveArticle } from "../actions"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Article } from "@prisma/client"

export function EditorWrapper({ article }: { article: Article }) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async (data: {
    title: string
    content: string
    slug: string
    published: boolean
    isPremium: boolean
  }) => {
    setIsSaving(true)
    try {
      await saveArticle(article.id, data)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Editor
      initialTitle={article.title}
      initialContent={article.content}
      initialSlug={article.slug}
      initialPublished={article.published}
      initialIsPremium={article.isPremium}
      onSave={handleSave}
      onBack={() => router.push("/dashboard/articles")}
      isSaving={isSaving}
    />
  )
}
