import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { Bookmark, Clock, ArrowRight, ExternalLink } from "lucide-react"

export default async function LibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const bookmarks = await prisma.bookmark.findMany({
    where: { readerId: user.id },
    include: {
      article: {
        include: {
          author: { select: { name: true, username: true, subdomain: true, customDomain: true, logoUrl: true } },
          category: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="space-y-4">
      
      {/* Page header */}
      <div className="px-1">
        <h1 className="text-lg font-bold text-neutral-800 tracking-tight">Le Sanctuaire</h1>
        <p className="text-xs text-neutral-400 mt-0.5">Vos lectures sauvegardées et articles favoris.</p>
      </div>

      {/* Bento shell */}
      <div className="bg-[#EE4B2B] rounded-[40px] p-3 shadow-xl flex flex-col gap-3">
        
        {bookmarks.length === 0 ? (
          <div className="bg-white rounded-[32px] p-12 shadow-xs border border-neutral-100 text-center flex flex-col items-center justify-center gap-3">
            <Bookmark className="w-10 h-10 text-neutral-200" />
            <h4 className="font-bold text-sm text-neutral-600">Votre sanctuaire est vide</h4>
            <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
              Explorez qoe.fi et sauvegardez les articles qui méritent d'être lus à tête reposée.
            </p>
            <a href="/home" className="bg-[#EE4B2B] text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-[#d63d20] transition-colors mt-2">
              Découvrir des articles
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {bookmarks.map(b => {
              const host = b.article.author.customDomain || `${b.article.author.subdomain}.localhost:3000`
              const url = `http://${host}/article/${b.article.slug}`

              return (
                <div key={b.id} className="bg-white rounded-[28px] p-5 shadow-xs border border-neutral-100 flex flex-col justify-between gap-4 group hover:border-[#EE4B2B]/20 transition-colors">
                  
                  {/* Top: author + reading time */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <a href={b.article.author.username ? `/@${b.article.author.username}` : "#"} className="flex items-center gap-2 group/auth">
                        {b.article.author.logoUrl ? (
                          <img src={b.article.author.logoUrl} className="w-6 h-6 rounded-lg object-cover border border-neutral-200/50" />
                        ) : (
                          <div className="w-6 h-6 rounded-lg bg-[#EE4B2B]/10 flex items-center justify-center text-[8px] font-bold text-[#EE4B2B]">
                            {b.article.author.name?.charAt(0)}
                          </div>
                        )}
                        <span className="text-[10px] font-bold text-neutral-500 group-hover/auth:text-[#EE4B2B] transition-colors">{b.article.author.name}</span>
                      </a>
                      <div className="flex items-center gap-1 text-[9px] text-neutral-400 font-mono">
                        <Clock className="w-2.5 h-2.5" />
                        {b.article.readingTime} min
                      </div>
                    </div>

                    <h3 className="text-sm font-bold text-neutral-800 tracking-tight leading-snug group-hover:text-[#EE4B2B] transition-colors mb-2">
                      {b.article.title}
                    </h3>
                    
                    <p className="text-xs text-neutral-500 leading-relaxed line-clamp-2">
                      {b.article.content.replace(/<[^>]*>?/gm, '').substring(0, 120)}...
                    </p>
                  </div>

                  {/* Bottom: category + link */}
                  <div className="flex items-center justify-between pt-3 border-t border-neutral-50">
                    <div className="flex items-center gap-2">
                      {b.article.category && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-neutral-100 border rounded text-neutral-500">
                          {b.article.category.name}
                        </span>
                      )}
                      <span className="text-[9px] text-neutral-400 font-mono">
                        {new Date(b.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <a 
                      href={url} 
                      target="_blank" 
                      className="text-[10px] font-bold text-[#EE4B2B] flex items-center gap-0.5 hover:underline"
                    >
                      Lire <ExternalLink className="w-2.5 h-2.5" />
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
