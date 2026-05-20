import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { FileText, Plus, Edit3, Trash2, Calendar, Globe, Lock } from "lucide-react"
import { deleteArticle } from "./actions"
import { cn } from "@/lib/utils"
import { getTranslate } from "@/tolgee/server"

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
  const t = await getTranslate()

  return (
    <div className="space-y-8">
      {/* Title section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-sans">{t('dashboard.articles.title')}</h1>
          <p className="text-muted-foreground font-sans text-sm mt-1">
            {t('dashboard.articles.description', { count: String(articles.length) })}
          </p>
        </div>
        <a
          href="/dashboard/articles/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-sans text-sm font-semibold rounded-lg hover:bg-primary/90 transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          {t('dashboard.articles.new_article')}
        </a>
      </div>

      {articles.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 bg-muted/20 border border-dashed border-border rounded-2xl">
          <div className="h-12 w-12 bg-secondary border border-border rounded-xl flex items-center justify-center mb-4">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold font-sans mb-1">{t('dashboard.articles.empty_title')}</h3>
          <p className="text-muted-foreground max-w-sm text-center text-sm font-sans mb-6">
            {t('dashboard.articles.empty_description')}
          </p>
          <a
            href="/dashboard/articles/new"
            className="px-4 py-2 bg-primary text-primary-foreground font-sans text-sm font-semibold rounded-lg hover:bg-primary/90 transition-all cursor-pointer"
          >
            {t('dashboard.articles.create_first')}
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
                className="bg-card border border-border/80 rounded-xl p-6 flex flex-col justify-between shadow-sm hover:border-border transition-all duration-200"
              >
                <div className="space-y-4">
                  {/* Top line metadata */}
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium font-sans border",
                      article.published
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                        : "bg-secondary border-border text-muted-foreground"
                    )}>
                      {article.published ? (
                        <>
                          <Globe className="h-3 w-3" />
                          {t('dashboard.articles.status_published')}
                        </>
                      ) : (
                        <>
                          <Lock className="h-3 w-3" />
                          {t('dashboard.articles.status_draft')}
                        </>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground font-mono text-xs">
                      <Calendar className="h-3.5 w-3.5" />
                      {formattedDate}
                    </span>
                  </div>

                  {/* Title & Slug */}
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold tracking-tight line-clamp-2 leading-tight">
                      {article.title}
                    </h3>
                    <p className="text-muted-foreground font-mono text-xs truncate">
                      /{article.slug}
                    </p>
                  </div>
                </div>

                {/* Bottom line controls */}
                <div className="flex items-center justify-between border-t border-border/50 pt-4 mt-6">
                  <a
                    href={`/dashboard/articles/${article.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-secondary-foreground font-sans text-xs font-medium transition-colors"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    {t('dashboard.articles.edit_content')}
                  </a>

                  <form action={deleteArticle.bind(null, article.id)} method="POST">
                    <button
                      type="submit"
                      className="h-8 w-8 rounded-lg flex items-center justify-center border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
                      title={t('common.delete')}
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
