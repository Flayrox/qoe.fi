"use client"

import React from "react"
import { FileText, Eye, ChevronRight } from "lucide-react"
import { UmamiPageMetric } from "@qoe/analytics/server"

interface TopPagesBlockProps {
  topPages: UmamiPageMetric[]
  articleTitlesMap: Record<string, string>
  onSelectArticle?: (urlPath: string) => void
}

export function TopPagesBlock({ topPages, articleTitlesMap, onSelectArticle }: TopPagesBlockProps) {
  const maxViews = topPages.length > 0 ? Math.max(...topPages.map((p) => p.y)) : 1

  return (
    <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[17px] font-semibold tracking-tight text-foreground">Publications & Pages lues</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Cliquez sur un article pour analyser ses métriques dédiées</p>
        </div>
        <span className="text-xs text-muted-foreground font-medium">
          {topPages.length} écrits
        </span>
      </div>

      {topPages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg border-border/30 bg-muted/10">
          <Eye className="h-6 w-6 text-muted-foreground/40 mb-2 stroke-[1.5]" />
          <p className="text-xs font-medium text-muted-foreground">Aucune consultation enregistrée</p>
        </div>
      ) : (
        <div className="divide-y divide-border/30">
          {topPages.map((page, index) => {
            const displayTitle = articleTitlesMap[page.x] || page.x
            const percentage = Math.round((page.y / maxViews) * 100)
            const formattedRank = index + 1 < 10 ? `0${index + 1}` : `${index + 1}`

            return (
              <div
                key={page.x || index}
                onClick={() => onSelectArticle?.(page.x)}
                className="group relative flex flex-col justify-center h-14 px-3 -mx-3 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <span className="text-xs font-medium text-muted-foreground/60 w-5 text-right shrink-0">
                      {formattedRank}
                    </span>
                    <FileText className="h-4 w-4 text-muted-foreground/70 shrink-0 stroke-[1.5]" />
                    <span className="font-medium text-foreground text-sm truncate group-hover:text-primary transition-colors" title={displayTitle}>
                      {displayTitle}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-foreground text-sm">{page.y.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">vues</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all stroke-[1.5]" />
                  </div>
                </div>

                {/* Hairline Progress Indicator */}
                <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-transparent">
                  <div
                    className="h-full bg-foreground/20 rounded-full transition-all duration-300 group-hover:bg-foreground/40"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
