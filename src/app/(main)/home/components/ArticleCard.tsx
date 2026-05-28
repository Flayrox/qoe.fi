"use client"

import React from "react"
import { motion } from "framer-motion"
import { ExternalLink, UserPlus, UserCheck, Bookmark, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTabStore } from "@/lib/use-tab-store"
import { MicroPostCard } from "@/components/social/MicroPostCard"

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

  if (isMicroPost) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.99 }}
        transition={{ duration: 0.25, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
      >
        <MicroPostCard post={article} />
      </motion.div>
    )
  }

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
      className="bg-white rounded-[28px] p-6 sm:p-8 border-[0.5px] border-neutral-200/40 flex flex-col gap-5 relative group hover:shadow-2xl hover:shadow-neutral-200/40 hover:scale-[1.002] transition-all duration-500 ease-[0.16,1,0.3,1]"
    >
      {/* Header Card */}
      <div className="flex items-center justify-between">
        <button 
          onClick={handleOpenProfile}
          className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer group/author outline-none text-left focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30 rounded-xl"
        >
          <div className="w-9 h-9 rounded-[10px] overflow-hidden border-[0.5px] border-neutral-200/50 shrink-0 shadow-sm transition-transform duration-500 ease-[0.16,1,0.3,1] group-hover/author:scale-105">
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
              <span className="text-[13px] font-bold text-neutral-900 tracking-tight leading-none group-hover/author:text-[#EE4B2B] transition-colors duration-200">
                {article.author.name}
              </span>
              {article.author.isCertified && (
                <span className="text-[#EE4B2B] text-[10px] font-black">✓</span>
              )}
            </div>
            <span className="text-[10px] text-neutral-400 block mt-1 font-mono uppercase tracking-wider">
              @{article.author.username || article.author.subdomain}
            </span>
          </div>
        </button>

        <div className="flex items-center gap-2.5">
          <span className="text-[10px] text-neutral-400 font-medium font-mono mr-2">
            {new Date(article.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          
          {/* Follow toggle inside card with micro-vibration hover */}
          {dbUser && dbUser.id !== article.author.id && (
            <button
              onClick={() => handleFollowToggle(article.author)}
              className={cn(
                "text-[10px] font-bold px-2 py-1.5 rounded-xl transition-all duration-300 ease-[0.16,1,0.3,1] cursor-pointer focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30 outline-none",
                isFollowed 
                  ? "bg-neutral-50 text-neutral-400" 
                  : "bg-white text-neutral-500 hover:bg-neutral-50 hover:text-[#EE4B2B]"
              )}
            >
              {isFollowed ? <UserCheck className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
            </button>
          )}

          {/* Bookmark toggle with active Vermillion stroke */}
          <button
            onClick={() => handleBookmarkToggle(article)}
            className={cn(
              "text-[10px] font-bold p-1.5 rounded-xl transition-all duration-300 ease-[0.16,1,0.3,1] cursor-pointer focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30 outline-none",
              isBookmarked 
                ? "bg-[#EE4B2B]/5 text-[#EE4B2B]" 
                : "bg-white text-neutral-400 hover:bg-neutral-50 hover:text-[#EE4B2B]"
            )}
          >
            <Bookmark className="w-3 h-3" style={{ fill: isBookmarked ? "#EE4B2B" : "transparent" }} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Content block */}
      <div className="space-y-3 pt-2">
        <a href={url} target="_blank" rel="noreferrer" className="block group/title">
          <h3 className="font-serif text-xl sm:text-[22px] font-bold text-neutral-900 leading-snug group-hover:text-[#EE4B2B] transition-colors duration-300 mb-3">
            {article.title}
          </h3>
          <p className="font-serif text-[15px] text-neutral-600 leading-loose line-clamp-3">
            {article.content.replace(/<[^>]*>?/gm, "").substring(0, 200)}...
          </p>
        </a>
      </div>

      {/* Footer Card */}
      <div className="flex items-center justify-between pt-4 mt-2">
        <div className="flex items-center gap-2">
          {article.category && (
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-neutral-400 font-mono">
              {article.category.name}
            </span>
          )}
          {article.isPremium && (
            <>
              <span className="text-neutral-300 text-xs">|</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#EE4B2B] font-mono flex items-center gap-1">
                Premium
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenInTab}
            className="text-[10px] font-semibold text-neutral-400 hover:text-[#EE4B2B] flex items-center gap-1.5 transition-colors duration-300 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30 rounded-lg p-1"
          >
            <FileText className="w-3 h-3" strokeWidth={1.5} /> Onglet
          </button>
          <span className="text-neutral-200 text-xs">|</span>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-semibold text-neutral-400 hover:text-[#EE4B2B] flex items-center gap-1.5 transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30 rounded-lg p-1"
          >
            Lire <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
          </a>
        </div>
      </div>
    </motion.article>
  )
}
