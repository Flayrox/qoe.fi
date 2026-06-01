import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { Highlighter, ExternalLink } from "lucide-react"
import { getTranslate } from "@/tolgee/server"

import { Logo } from "@/components/ui/Logo"

export default async function HighlightsPage() {
  const t = await getTranslate()
  
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
    <>
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[#faf7f5]" />
        
        <div 
          className="absolute bottom-[-20%] left-[-15%] w-[80%] h-[70%] rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, rgba(238,75,43,0.12) 0%, rgba(238,75,43,0.06) 35%, rgba(238,75,43,0.02) 60%, transparent 80%)",
            filter: "blur(60px)",
          }}
        />
        
        <div 
          className="absolute top-[-10%] right-[-10%] w-[60%] h-[50%] rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, rgba(255,180,140,0.15) 0%, rgba(255,200,170,0.08) 40%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />

        <div 
          className="absolute top-[30%] left-[30%] w-[50%] h-[50%] rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, rgba(255,230,215,0.2) 0%, transparent 60%)",
            filter: "blur(100px)",
          }}
        />

        <div 
          className="absolute top-0 right-0 bottom-0 w-[35%]"
          style={{
            background: "linear-gradient(to left, rgba(250,247,245,0.95) 0%, transparent 100%)",
          }}
        />
      </div>

      {/* ── MAIN CONTENT (z-20) ── */}
      <div className="pt-[30vh] pb-24 max-w-[640px] mx-auto selection:bg-[var(--qoe-vermillion-10)] selection:text-[var(--qoe-vermillion)] relative z-20">
        
        {/* ── LOGO LAYER (z-10) ── */}
        <div className="sticky top-[28px] z-10 w-full flex justify-center bg-transparent pointer-events-none h-0">
          <div className="w-full max-w-[640px] px-2 flex items-center gap-6 relative">
            <div className="absolute left-[-84px] w-16 h-8 flex items-center justify-center top-5">
              <a href="/home" className="flex items-center justify-center w-8 h-8 pointer-events-auto">
                <Logo className="h-[13px] w-auto" fillColor="#EE4B2B" />
              </a>
            </div>
          </div>
        </div>

        {/* Real "Surlignages." title positioned sticky so it sticks at top and is covered by the sheet */}
        <div className="sticky top-0 h-0 z-10 pointer-events-none select-none">
          <div className="absolute left-2 top-1">
            <span className="font-sans text-5xl font-extrabold text-[var(--qoe-vermillion)] tracking-tighter">
              Surlignages<span className="text-[var(--text-primary)]">.</span>
            </span>
          </div>
        </div>

        <div className="bg-white shadow-[0_8px_30px_rgba(0,0,0,0.02)] border border-neutral-200/40 rounded-t-xl min-h-screen mt-12 relative z-20">
          
          {/* Sticky header of the sheet itself to mask the contents */}
          <div className="sticky top-0 z-10 h-[60px] bg-white rounded-t-xl border-t border-x border-neutral-200/40 -mx-[1px] -mt-[1px]" />

          <div className="px-6 pb-6 space-y-6">
            
            {/* Page header inside the sheet */}
            <div className="px-1">
              <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                {t("highlights.title", "Carnet de Surlignages")}
              </h1>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                {t("highlights.subtitle", "Vos citations et réflexions extraites de vos lectures.")}
              </p>
            </div>

            {/* Bento shell */}
            <div className="flex flex-col gap-4">
              {highlights.length === 0 ? (
                <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-12 border border-[var(--border-default)] shadow-xs text-center flex flex-col items-center justify-center gap-3">
                  <Highlighter className="w-10 h-10 text-[var(--text-quaternary)]" />
                  <h4 className="font-bold text-sm text-[var(--text-secondary)]">
                    {t("highlights.empty_title", "Aucun passage surligné")}
                  </h4>
                  <p className="text-xs text-[var(--text-tertiary)] max-w-xs leading-relaxed">
                    {t("highlights.empty_desc", "Surlignez des passages dans les articles que vous lisez pour les retrouver ici.")}
                  </p>
                </div>
              ) : (
                highlights.map(h => {
                  if (!h.article || !h.article.author) return null
                  const host = h.article.author.customDomain || `${h.article.author.subdomain}.localhost:3000`
                  const url = `http://${host}/article/${h.article.slug}`

                  return (
                    <div key={h.id} className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 border border-[var(--border-default)] shadow-xs flex flex-col gap-4">
                      {/* Highlighted text */}
                      <div className="border-l-2 border-[var(--qoe-vermillion)]/60 pl-4">
                        <p className="text-sm text-[var(--text-secondary)] italic leading-relaxed font-sans">
                          "{h.text}"
                        </p>
                      </div>

                      {/* Personal note */}
                      {h.note && (
                        <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-card)] p-3.5">
                          <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-tertiary)] block mb-1">
                            {t("highlights.your_note", "Votre Note")}
                          </span>
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{h.note}</p>
                        </div>
                      )}

                      {/* Source info */}
                      <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-tertiary)]">
                        <span className="font-semibold truncate max-w-[60%]">
                          {t("highlights.highlighted_in", "Surligné dans :")} {h.article.title}
                        </span>
                        <a 
                          href={url}
                          target="_blank"
                          className="text-[var(--qoe-vermillion)] hover:underline font-bold flex items-center gap-1 shrink-0"
                        >
                          {t("highlights.consult", "Consulter")} <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
