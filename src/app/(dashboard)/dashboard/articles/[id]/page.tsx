import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/db"
import { EditorWrapper } from "./EditorWrapper"

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = await params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return notFound()
  }

  const article = await prisma.article.findUnique({
    where: {
      id: resolvedParams.id,
      authorId: user.id, // Security: Ensure they own it
    },
  })

  if (!article) {
    return notFound()
  }

  return (
    <div className="mx-auto max-w-5xl py-6">
      <EditorWrapper article={article} />
    </div>
  )
}
