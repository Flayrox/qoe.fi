"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, BookOpen, Clock, Loader2, AlertCircle } from "lucide-react"
import { useTabStore } from "@/lib/use-tab-store"
import { getArticleThread } from "../actions"

interface ArticleReaderViewProps {
  slug: string
}

const springs = {
  enter: { type: "spring" as const, stiffness: 450, damping: 30 }
}

export function ArticleReaderView({ slug }: ArticleReaderViewProps) {
  const { setActiveTabId } = useTabStore()
  const [article, setArticle] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadArticle() {
      setLoading(true)
      const res = await getArticleThread(slug)
      if (res.success && res.data?.article) {
        setArticle(res.data.article)
      }
      setLoading(false)
    }
    loadArticle()
  }, [slug])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white border border-neutral-200/50 rounded-xl shadow-xs">
        <Loader2 className="w-5 h-5 animate-spin text-[#EE4B2B]" />
        <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider font-mono">Chargement de l'écrit...</span>
      </div>
    )
  }

  if (!article) {
    return (
      <div className="bg-white border border-neutral-200/50 rounded-xl p-8 text-center text-neutral-500 shadow-xs">
        <AlertCircle className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
        <p className="text-xs">L'article demandé est introuvable ou a été dépublié.</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.enter}
      className="bg-white border border-neutral-200/50 rounded-xl p-6 md:p-8 shadow-xs flex flex-col gap-6"
    >
      {/* Editorial Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-3.5">
        <button
          onClick={() => setActiveTabId("timeline")}
          className="flex items-center gap-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Retour au flux
        </button>
        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest font-mono">Lecture de l'écrit</span>
      </div>

      {/* Meta headers */}
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          {article.category && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 bg-neutral-50 border border-neutral-200/30 rounded text-neutral-500 font-mono">
              {article.category.name}
            </span>
          )}
          {article.isPremium && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 bg-[#EE4B2B]/5 border border-[#EE4B2B]/10 rounded text-[#EE4B2B] font-mono">
              Premium
            </span>
          )}
          <span className="text-[10px] text-neutral-400 font-mono flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> {article.readingTime || 5} min de lecture
          </span>
        </div>

        <h1 className="text-xl md:text-2xl font-semibold text-neutral-900 tracking-tight leading-snug">
          {article.title}
        </h1>

        {/* Author box */}
        <div className="flex items-center gap-3 pt-2 border-b border-neutral-100 pb-4">
          <div className="w-9 h-9 rounded-md overflow-hidden border border-neutral-200/30 shrink-0 shadow-xs">
            {article.author.logoUrl ? (
              <img src={article.author.logoUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full bg-[#EE4B2B]/5 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                {article.author.name?.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-neutral-800 leading-none">{article.author.name}</span>
              {article.author.isCertified && <span className="text-[#EE4B2B] text-[9px] font-black">✓</span>}
            </div>
            <span className="text-[10px] text-neutral-400 block mt-1 font-mono">
              @{article.author.username || article.author.subdomain} • {new Date(article.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
            </span>
          </div>
        </div>
      </div>

      {/* Article HTML Content parsed cleanly with gorgeous typographic styles */}
      <div 
        className="prose prose-neutral max-w-none text-[14px] text-neutral-700 leading-relaxed font-sans font-light whitespace-pre-line space-y-4"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
    </motion.div>
  )
}
