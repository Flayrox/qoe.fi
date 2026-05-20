"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Editor } from "@/features/editor/components/Editor"
import { createArticle } from "../actions"
import { Loader2 } from "lucide-react"

export function NewArticleClient() {
  const router = useRouter()
  const [isInitializing, setIsInitializing] = React.useState(true)

  React.useEffect(() => {
    async function initDraft() {
      try {
        // Create an empty draft immediately and redirect to its edit page
        // This allows the Editor's auto-save to work on an existing ID
        await createArticle()
      } catch (error) {
        console.error("Failed to initialize draft:", error)
        router.push("/dashboard/articles")
      }
    }
    initDraft()
  }, [router])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      <p className="text-zinc-400 font-sans text-sm animate-pulse">
        Preparing your sovereign workspace...
      </p>
    </div>
  )
}
