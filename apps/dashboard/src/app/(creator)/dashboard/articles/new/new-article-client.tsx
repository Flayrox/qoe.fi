"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Editor } from "@/features/editor/components/Editor"
import { saveArticleAction } from "../actions"

interface NewArticleClientProps {
  categories: { id: string; name: string }[]
}

export function NewArticleClient({ categories }: NewArticleClientProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [articleId, setArticleId] = useState<string | null>(null)

  const handleSave = async (data: {
    title: string
    content: string
    slug: string
    published: boolean
    isPremium: boolean
    categoryId: string | null
    seoTitle: string | null
    seoDescription: string | null
  }) => {
    try {
      setIsSaving(true)
      const result = await saveArticleAction({
        id: articleId || undefined,
        ...data,
      })
      
      if (!articleId) {
        setArticleId(result.id)
        // Silently update the URL in the browser without unmounting the editor
        window.history.replaceState(null, "", `/dashboard/articles/${result.id}`)
      }
      router.refresh()
    } catch (err: any) {
      throw new Error(err?.message || "Échec de l'enregistrement.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="py-4">
      <Editor
        categories={categories}
        isSaving={isSaving}
        onSave={handleSave}
        onBack={() => router.push("/dashboard/articles")}
      />
    </div>
  )
}
