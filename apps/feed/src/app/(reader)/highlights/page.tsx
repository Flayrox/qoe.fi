import { createClient } from "@qoe/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@qoe/db/client"
import { Highlighter, ExternalLink } from "lucide-react"
import { getTranslate } from "@qoe/i18n/server"

import { ReaderPageLayout } from "@/components/layout/ReaderPageLayout"

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
    <ReaderPageLayout giantTitle="Surlignages">
      <div className="bg-white shadow-[0_8px_30px_rgba(0,0,0,0.02)] border border-neutral-200/40 rounded-t-xl min-h-screen mt-0 relative z-20">
        
        <div className="px-6 pt-6 pb-6 space-y-6">
            
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
                highlights.map((h: any) => {
                  if (!h.article || !h.article.author) return null
                  const isProd = typeof window !== "undefined"
                    ? window.location.hostname.endsWith("qoe.fi")
                    : process.env.NODE_ENV === "production"
                  const suffix = isProd ? "qoe.fi" : "localhost"
                  const protocol = isProd ? "https:" : "http:"
                  const host = h.article.author.customDomain || (h.article.author.subdomain ? `${h.article.author.subdomain}.${suffix}` : "")
                  const url = host ? `${protocol}//${host}/article/${h.article.slug}` : "#"

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
    </ReaderPageLayout>
  )
}
