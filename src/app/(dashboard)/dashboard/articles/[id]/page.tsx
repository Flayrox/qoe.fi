import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import { EditArticleClient } from "./edit-article-client"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditArticlePage({ params }: PageProps) {
  const { id } = await params
  
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  const article = await prisma.article.findUnique({
    where: { id }
  })

  if (!article) {
    notFound()
  }

  if (article.authorId !== user.id) {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-center justify-center py-20 bg-zinc-950 border-4 border-red-500 text-center p-8 shadow-[8px_8px_0px_0px_rgba(239,68,68,0.2)] mt-12">
        <h3 className="text-xl font-bold font-mono text-red-500 mb-2">Access Forbidden</h3>
        <p className="text-zinc-400 text-sm font-sans mb-6">
          You are not authorized to edit this article. Only the original creator can make modifications.
        </p>
        <a
          href="/dashboard/articles"
          className="px-6 py-2 border-2 border-white bg-white text-black font-mono text-xs font-bold transition-all shadow-[4px_4px_0px_0px_rgba(255,255,255,0.4)]"
        >
          Return to Articles
        </a>
      </div>
    )
  }

  return (
    <div className="py-6">
      <EditArticleClient article={article} />
    </div>
  )
}
