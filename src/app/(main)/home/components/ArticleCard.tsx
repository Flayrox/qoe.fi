"use client"

import React from "react"
import { motion } from "framer-motion"
import { ExternalLink, UserPlus, UserCheck, Bookmark, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTabStore } from "@/lib/use-tab-store"

interface Author {
  id: string
  name: string | null
  username: string | null
  subdomain: string | null
  customDomain: string | null
  logoUrl: string | null
  heroText: string | null
  isCertified?: boolean
}

interface Article {
  id: string
  title: string
  slug: string
  content: string
  imageUrl?: string | null
  published: boolean
  isPremium: boolean
  readingTime: number
  createdAt: Date | string
  author: Author
  category: { name: string } | null
  tags?: string[]
}

interface ArticleCardProps {
  article: Article
  idx: number
  dbUser: any
  isBookmarked: boolean
  isFollowed: boolean
  handleFollowToggle: (author: any) => void
  handleBookmarkToggle: (article: Article) => void
}

export function ArticleCard({
  article,
  idx,
  dbUser,
  isBookmarked,
  isFollowed,
  handleFollowToggle,
  handleBookmarkToggle,
}: ArticleCardProps) {
  const { addTab } = useTabStore()
  const isMicroPost = !article.title
  const host = article.author.customDomain || `${article.author.subdomain}.localhost:3000`
  const url = isMicroPost ? "#" : `http://${host}/article/${article.slug}`

  const handleOpenInTab = () => {
    addTab({
      id: `article-${article.slug}`,
      title: article.title,
      type: "article",
      slug: article.slug
    })
  }

  const handleOpenProfile = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const targetUsername = article.author.username || article.author.subdomain
    if (!targetUsername) return
    addTab({
      id: `profile-${targetUsername}`,
      title: `@${targetUsername}`,
      type: "profile",
      slug: targetUsername
    })
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ duration: 0.25, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
      className="bg-white rounded-xl p-5 md:p-6 border border-neutral-200/50 flex flex-col gap-4 relative group hover:border-[#EE4B2B]/20 hover:shadow-[0_2px_12px_rgba(0,0,0,0.01)] transition-all duration-300"
    >
      {/* Header Card */}
      <div className="flex items-center justify-between">
        <button 
          onClick={handleOpenProfile}
          className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer group/author outline-none text-left"
        >
          <div className="w-8 h-8 rounded-md overflow-hidden border border-neutral-200/45 shrink-0 shadow-xs">
            {article.author.logoUrl ? (
              <img src={article.author.logoUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full bg-[#EE4B2B]/5 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                {article.author.name?.substring(0, 2) || "NA"}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-neutral-800 leading-none group-hover/author:text-[#EE4B2B] transition-colors duration-200">
                {article.author.name}
              </span>
              {article.author.isCertified && (
                <span className="text-[#EE4B2B] text-[9px] font-black">✓</span>
              )}
            </div>
            <span className="text-[10px] text-neutral-400 block mt-1 font-mono">
              @{article.author.username || article.author.subdomain}
            </span>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-400 font-semibold font-mono">
            {new Date(article.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          
          {/* Follow toggle inside card with micro-vibration hover */}
          {dbUser && dbUser.id !== article.author.id && (
            <button
              onClick={() => handleFollowToggle(article.author)}
              className={cn(
                "text-[9px] font-bold px-2 py-1 rounded-md border transition-all duration-200 cursor-pointer",
                isFollowed 
                  ? "bg-neutral-100 border-neutral-200 text-neutral-500" 
                  : "bg-white border-neutral-200 text-neutral-600 hover:border-[#EE4B2B] hover:text-[#EE4B2B]"
              )}
            >
              {isFollowed ? <UserCheck className="w-2.5 h-2.5" /> : <UserPlus className="w-2.5 h-2.5" />}
            </button>
          )}

          {/* Bookmark toggle with active Vermillion stroke */}
          {!isMicroPost && (
            <button
              onClick={() => handleBookmarkToggle(article)}
              className={cn(
                "text-[9px] font-bold p-1 rounded-md border transition-all duration-200 cursor-pointer",
                isBookmarked 
                  ? "bg-[#EE4B2B]/5 border-[#EE4B2B]/20 text-[#EE4B2B]" 
                  : "bg-white border-neutral-200 text-neutral-400 hover:border-neutral-300 hover:text-[#EE4B2B]"
              )}
            >
              <Bookmark className="w-2.5 h-2.5" style={{ fill: isBookmarked ? "#EE4B2B" : "transparent" }} />
            </button>
          )}
        </div>
      </div>

      {/* Content block */}
      <div className="space-y-3">
        {isMicroPost ? (
          <div 
            onClick={() => {
              addTab({
                id: `post-${article.id}`,
                title: `${article.author.name || "Post"}: "${article.content.substring(0, 15)}..."`,
                type: "post"
              })
            }}
            className="text-[13px] text-neutral-700 leading-relaxed font-sans cursor-pointer hover:text-neutral-950 transition-colors duration-200"
          >
            {article.content}
          </div>
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className="block group/title">
            <h3 className="text-sm font-semibold text-neutral-900 tracking-tight leading-snug group-hover:text-[#EE4B2B] transition-colors duration-200 mb-2">
              {article.title}
            </h3>
            <p className="text-xs text-neutral-500 leading-relaxed line-clamp-3">
              {article.content.replace(/<[^>]*>?/gm, "").substring(0, 150)}...
            </p>
          </a>
        )}

        {isMicroPost && article.imageUrl && (
          <div className="rounded-lg border border-neutral-200/40 overflow-hidden bg-neutral-100 max-h-96">
            <img src={article.imageUrl} className="w-full h-full object-cover hover:scale-[1.01] transition-transform duration-300" alt="Image jointe" />
          </div>
        )}
      </div>

      {/* Footer Card */}
      <div className="flex items-center justify-between pt-3.5 border-t border-neutral-100 mt-1">
        <div className="flex items-center gap-2">
          {article.category && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-neutral-50 border border-neutral-200/30 rounded text-neutral-400 font-mono">
              {article.category.name}
            </span>
          )}
          {article.isPremium && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-[#EE4B2B]/5 border border-[#EE4B2B]/10 rounded text-[#EE4B2B] font-mono">
              Premium • 2,00 €
            </span>
          )}
        </div>

        {!isMicroPost && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenInTab}
              className="text-[10px] font-semibold text-neutral-500 hover:text-[#EE4B2B] flex items-center gap-1.5 transition-colors duration-200 cursor-pointer"
            >
              <FileText className="w-3 h-3" /> Ouvrir dans un onglet
            </button>
            <span className="text-neutral-200 text-xs">|</span>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-semibold text-neutral-500 hover:text-[#EE4B2B] flex items-center gap-1.5 transition-colors duration-200"
            >
              Lire l'article <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </motion.article>
  )
}
