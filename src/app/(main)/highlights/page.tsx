import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import Link from "next/link"
import { Highlighter, Quote } from "lucide-react"

export default async function HighlightsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const highlights = await prisma.highlight.findMany({
    where: { readerId: user.id },
    include: {
      article: {
        select: { title: true, slug: true, author: { select: { name: true, subdomain: true, customDomain: true } } }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="flex items-center gap-4 mb-12 border-b border-border pb-6">
          <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500">
            <Highlighter className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Carnet de Surlignages</h1>
            <p className="text-muted-foreground text-sm">Vos citations, vos réflexions, extraites de vos lectures.</p>
          </div>
        </div>

        {highlights.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed rounded-3xl bg-card">
            <p className="text-muted-foreground">Aucun passage surligné pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {highlights.map(h => {
              if (!h.article || !h.article.author) return null;
              const host = h.article.author.customDomain || `${h.article.author.subdomain}.localhost:3000`
              const url = `http://${host}/article/${h.article.slug}`

              return (
                <div key={h.id} className="bg-card border rounded-2xl p-6 md:p-8">
                  <div className="flex gap-4">
                    <Quote className="w-8 h-8 text-amber-500/20 flex-shrink-0" />
                    <div>
                      <p className="text-lg md:text-xl font-serif leading-relaxed mb-4">
                        <mark className="bg-amber-500/20 text-foreground px-1 rounded-sm">{h.text}</mark>
                      </p>
                      
                      {h.note && (
                        <div className="mb-4 bg-muted/50 p-4 rounded-xl border-l-2 border-primary text-sm">
                          <strong className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Votre Note :</strong>
                          {h.note}
                        </div>
                      )}

                      <div className="text-sm font-medium">
                        <span className="text-muted-foreground">Extrait de </span>
                        <a href={url} target="_blank" className="text-primary hover:underline">
                          {h.article.title}
                        </a>
                        <span className="text-muted-foreground"> par {h.article.author.name}</span>
                      </div>
                    </div>
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
