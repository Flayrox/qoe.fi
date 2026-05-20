import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import Link from "next/link"
import { Sparkles, Activity } from "lucide-react"

export default async function ReaderHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const following = await prisma.follows.findMany({
    where: { readerId: user.id },
    select: { creatorId: true }
  })
  
  const creatorIds = following.map(f => f.creatorId)

  const articles = await prisma.article.findMany({
    where: { 
      authorId: { in: creatorIds },
      published: true 
    },
    include: {
      author: { select: { name: true, subdomain: true, customDomain: true, logoUrl: true } },
      category: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="flex items-center gap-4 mb-12 border-b border-border pb-6">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Votre Timeline</h1>
            <p className="text-muted-foreground text-sm">Chronologique. Sans bruit. Sans algorithme.</p>
          </div>
        </div>

        {articles.length === 0 ? (
          <div className="text-center py-32 border-2 border-dashed rounded-3xl bg-card">
            <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-bold mb-2">C'est un peu calme ici.</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Abonnez-vous à vos médias préférés pour voir leurs articles apparaître ici.
            </p>
            <Link href="/" className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:opacity-90 transition-opacity">
              Explorer qoe.fi
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {articles.map(article => {
              const host = article.author.customDomain || `${article.author.subdomain}.localhost:3000`
              const url = `http://${host}/article/${article.slug}`

              return (
                <div key={article.id} className="bg-card border rounded-3xl p-8 hover:shadow-lg transition-shadow">
                  <div className="flex items-center gap-3 mb-6">
                    {article.author.logoUrl ? (
                      <img src={article.author.logoUrl} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase">
                        {article.author.name?.substring(0,2) || 'NA'}
                      </div>
                    )}
                    <span className="font-semibold text-sm">{article.author.name}</span>
                    <span className="text-muted-foreground text-xs mx-2">•</span>
                    <time className="text-muted-foreground text-xs font-medium">
                      {new Date(article.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                  
                  <Link href={url} target="_blank" className="block group">
                    <h2 className="text-2xl font-bold mb-4 leading-snug group-hover:text-primary transition-colors">
                      {article.title}
                    </h2>
                    <p className="text-muted-foreground line-clamp-3 mb-6 text-lg leading-relaxed">
                      {article.content.replace(/<[^>]*>?/gm, '').substring(0, 200)}...
                    </p>
                  </Link>
                  
                  <div className="flex items-center justify-between pt-6 border-t border-border">
                     {article.category && (
                        <span className="text-xs font-semibold px-3 py-1.5 bg-muted rounded-md text-muted-foreground">
                          {article.category.name}
                        </span>
                     )}
                     <span className="text-xs font-semibold px-3 py-1.5 border rounded-md text-muted-foreground">
                        {article.readingTime} min read
                     </span>
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
