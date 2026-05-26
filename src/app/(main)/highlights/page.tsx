import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { Highlighter, ExternalLink } from "lucide-react"

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
    <div className="space-y-4">
      
      {/* Page header */}
      <div className="px-1">
        <h1 className="text-lg font-bold text-neutral-800 tracking-tight">Carnet de Surlignages</h1>
        <p className="text-xs text-neutral-400 mt-0.5">Vos citations et réflexions extraites de vos lectures.</p>
      </div>

      {/* Bento shell */}
      <div className="bg-[#EE4B2B] rounded-[40px] p-3 shadow-xl flex flex-col gap-3">
        
        {highlights.length === 0 ? (
          <div className="bg-white rounded-[32px] p-12 shadow-xs border border-neutral-100 text-center flex flex-col items-center justify-center gap-3">
            <Highlighter className="w-10 h-10 text-neutral-200" />
            <h4 className="font-bold text-sm text-neutral-600">Aucun passage surligné</h4>
            <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
              Surlignez des passages dans les articles que vous lisez pour les retrouver ici.
            </p>
          </div>
        ) : (
          highlights.map(h => {
            if (!h.article || !h.article.author) return null
            const host = h.article.author.customDomain || `${h.article.author.subdomain}.localhost:3000`
            const url = `http://${host}/article/${h.article.slug}`

            return (
              <div key={h.id} className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-4">
                {/* Highlighted text */}
                <div className="border-l-2 border-[#EE4B2B]/60 pl-4">
                  <p className="text-sm text-neutral-700 italic leading-relaxed font-sans">
                    "{h.text}"
                  </p>
                </div>

                {/* Personal note */}
                {h.note && (
                  <div className="bg-neutral-50 border border-neutral-100 rounded-2xl p-3.5">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block mb-1">Votre Note</span>
                    <p className="text-xs text-neutral-600 leading-relaxed">{h.note}</p>
                  </div>
                )}

                {/* Source info */}
                <div className="flex items-center justify-between pt-3 border-t border-neutral-50 text-[10px] text-neutral-400">
                  <span className="font-semibold truncate max-w-[60%]">
                    Surligné dans : {h.article.title}
                  </span>
                  <a 
                    href={url}
                    target="_blank"
                    className="text-[#EE4B2B] hover:underline font-bold flex items-center gap-1 shrink-0"
                  >
                    Consulter <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )
          })
        )}

      </div>
    </div>
  )
}
