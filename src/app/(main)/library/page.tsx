import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import Link from "next/link"
import { Bookmark, Clock, ArrowRight, Library as LibraryIcon } from "lucide-react"

export default async function LibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const bookmarks = await prisma.bookmark.findMany({
    where: { readerId: user.id },
    include: {
      article: {
        include: {
          author: { select: { name: true, subdomain: true, customDomain: true, logoUrl: true } },
          category: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="container mx-auto px-4 py-16 max-w-5xl">
        <div className="flex items-center gap-4 mb-12 border-b border-border pb-6">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
            <LibraryIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Le Sanctuaire</h1>
            <p className="text-muted-foreground text-sm">Vos lectures sauvegardées et articles favoris.</p>
          </div>
        </div>

        {bookmarks.length === 0 ? (
          <div className="text-center py-32 border-2 border-dashed rounded-3xl bg-card">
            <Bookmark className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-bold mb-2">Votre sanctuaire est vide</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Explorez qoe.fi et sauvegardez les articles qui méritent d'être lus à tête reposée.
            </p>
            <Link href="/" className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:opacity-90 transition-opacity">
              Découvrir des articles
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {bookmarks.map(b => {
              const host = b.article.author.customDomain || `${b.article.author.subdomain}.localhost:3000`
              const url = `http://${host}/article/${b.article.slug}`

              return (
                <div key={b.id} className="group bg-card border rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      {b.article.author.logoUrl ? (
                        <img src={b.article.author.logoUrl} className="w-6 h-6 rounded-md object-cover" />
                      ) : (
                        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-[10px] font-bold">
                          {b.article.author.name?.charAt(0)}
                        </div>
                      )}
                      <span className="text-xs font-semibold text-muted-foreground">{b.article.author.name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium bg-muted/50 px-2 py-1 rounded-md">
                      <Clock className="w-3 h-3" />
                      {b.article.readingTime} min
                    </div>
                  </div>

                  <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors leading-tight">
                    {b.article.title}
                  </h3>
                  
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-6 flex-1">
                    {b.article.content.replace(/<[^>]*>?/gm, '').substring(0, 120)}...
                  </p>

                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">Sauvegardé le {new Date(b.createdAt).toLocaleDateString()}</span>
                    <a href={url} target="_blank" className="flex items-center gap-1 text-sm font-semibold text-primary group-hover:translate-x-1 transition-transform">
                      Lire <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
