import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { FileText, Plus, Edit3, Trash2, Calendar, Globe, Lock } from "lucide-react"
import { deleteArticleAction } from "./actions"
import { cn } from "@/lib/utils"

export default async function ArticlesPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  const user = authUser ? await prisma.user.findUnique({
    where: { id: authUser.id },
    include: {
      articles: {
        orderBy: { createdAt: 'desc' }
      }
    }
  }) : null

  const articles = user?.articles || []

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Title section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-sans text-white">Articles</h1>
          <p className="text-zinc-400 font-sans text-sm mt-1">
            Manage your independent sovereign publications ({articles.length})
          </p>
        </div>
        <a
          href="/dashboard/articles/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-sans text-sm font-semibold rounded-lg hover:bg-zinc-100 transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New Article
        </a>
      </div>

      {articles.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 bg-zinc-950/40 border border-dashed border-zinc-800 rounded-2xl">
          <div className="h-12 w-12 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center mb-4">
            <FileText className="h-6 w-6 text-zinc-400" />
          </div>
          <h3 className="text-lg font-bold font-sans text-white mb-1">No articles created yet</h3>
          <p className="text-zinc-400 max-w-sm text-center text-sm font-sans mb-6">
            Your voice deserves to be heard. Start drafting your first sovereign, uncensorable publication.
          </p>
          <a
            href="/dashboard/articles/new"
            className="px-4 py-2 bg-white text-black font-sans text-sm font-semibold rounded-lg hover:bg-zinc-100 transition-all cursor-pointer"
          >
            Create Your First Article
          </a>
        </div>
      ) : (
        /* Article Cards Grid */
        <div className="grid gap-6 md:grid-cols-2">
          {articles.map((article) => {
            const formattedDate = new Date(article.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })

            return (
              <div
                key={article.id}
                className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-6 flex flex-col justify-between shadow-lg hover:border-zinc-700/80 transition-all duration-200"
              >
                <div className="space-y-4">
                  {/* Top line metadata */}
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium font-sans border",
                      article.published
                        ? "bg-green-950/40 border-green-800/80 text-green-400"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400"
                    )}>
                      {article.published ? (
                        <>
                          <Globe className="h-3 w-3" />
                          Published
                        </>
                      ) : (
                        <>
                          <Lock className="h-3 w-3" />
                          Draft
                        </>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5 text-zinc-500 font-mono text-xs">
                      <Calendar className="h-3.5 w-3.5" />
                      {formattedDate}
                    </span>
                  </div>

                  {/* Title & Slug */}
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold tracking-tight text-white line-clamp-2 leading-tight">
                      {article.title}
                    </h3>
                    <p className="text-zinc-500 font-mono text-xs truncate">
                      /{article.slug}
                    </p>
                  </div>
                </div>

                {/* Bottom line controls */}
                <div className="flex items-center justify-between border-t border-zinc-900 pt-4 mt-6">
                  <a
                    href={`/dashboard/articles/${article.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-850 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-200 font-sans text-xs font-medium transition-colors"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit Content
                  </a>

                  <form action={deleteArticleAction.bind(null, article.id)} method="POST">
                    <button
                      type="submit"
                      className="h-8 w-8 rounded-lg flex items-center justify-center border border-red-950 bg-red-950/20 text-red-400 hover:bg-red-950/50 hover:text-red-300 transition-colors cursor-pointer"
                      title="Delete Article"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
