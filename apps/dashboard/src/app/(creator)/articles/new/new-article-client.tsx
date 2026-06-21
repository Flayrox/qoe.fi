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
      const created = await saveArticleAction(data)
      
      // Redirect to the edit page for this new article once created
      router.push(`/articles/${created.id}`)
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
        onBack={() => router.push("/articles")}
      />
    </div>
  )
}
