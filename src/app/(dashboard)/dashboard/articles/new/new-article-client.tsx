"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Editor } from "@/features/editor/components/Editor"
import { createArticleAction } from "../actions"

export function NewArticleClient() {
  const router = useRouter()
  const [isSaving, setIsSaving] = React.useState(false)

  const handleSave = async (data: {
    title: string
    content: string
    slug: string
    published: boolean
  }) => {
    setIsSaving(true)
    try {
      await createArticleAction(data)
      router.push("/dashboard/articles")
      router.refresh()
    } catch (error) {
      setIsSaving(false)
      throw error // Let the editor component handle displaying this error
    }
  }

  return (
    <Editor
      onSave={handleSave}
      onBack={() => router.push("/dashboard/articles")}
      isSaving={isSaving}
    />
  )
}
