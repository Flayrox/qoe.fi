"use client"

import React, { useState } from "react"
import { Bookmark, UserPlus, UserCheck, BookmarkCheck, HelpCircle } from "lucide-react"
import { toggleFollowCreator, toggleBookmarkArticle } from "./actions"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

interface ReaderActionsProps {
  articleId: string;
  creatorId: string;
  creatorName: string;
  isAuthenticated: boolean;
  initialBookmarked: boolean;
  initialFollowed: boolean;
  mainAppUrl: string;
}

export function ReaderActions({
  articleId,
  creatorId,
  creatorName,
  isAuthenticated,
  initialBookmarked,
  initialFollowed,
  mainAppUrl
}: ReaderActionsProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [followed, setFollowed] = useState(initialFollowed)
  const [loadingBookmark, setLoadingBookmark] = useState(false)
  const [loadingFollow, setLoadingFollow] = useState(false)

  const handleLoginRedirect = () => {
    window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`
  }

  const handleBookmark = async () => {
    if (!isAuthenticated) {
      handleLoginRedirect()
      return
    }
    setLoadingBookmark(true)
    try {
      const res = await toggleBookmarkArticle(articleId)
      if (res.success) {
        setBookmarked(!!res.bookmarked)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingBookmark(false)
    }
  }

  const handleFollow = async () => {
    if (!isAuthenticated) {
      handleLoginRedirect()
      return
    }
    setLoadingFollow(true)
    try {
      const res = await toggleFollowCreator(creatorId)
      if (res.success) {
        setFollowed(!!res.followed)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingFollow(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-neutral-200/80 dark:border-zinc-800/80 shadow-2xl rounded-2xl p-2.5 flex items-center gap-3 transition-all duration-300 pointer-events-auto select-none max-w-[90%] sm:max-w-md"
    >
      {/* Bookmark Action */}
      <button
        onClick={handleBookmark}
        disabled={loadingBookmark}
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer",
          bookmarked
            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "hover:bg-neutral-100 dark:hover:bg-zinc-800 text-muted-foreground hover:text-foreground"
        )}
        title="Sauvegarder dans le sanctuaire"
      >
        {bookmarked ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
      </button>

      <div className="w-px h-5 bg-neutral-200 dark:bg-zinc-800" />

      {/* Follow Action */}
      <button
        onClick={handleFollow}
        disabled={loadingFollow}
        className={cn(
          "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
          followed
            ? "bg-neutral-100 dark:bg-zinc-800 text-muted-foreground hover:text-foreground"
            : "bg-[#EE4B2B] text-white hover:bg-[#d63d20] shadow-sm shadow-[#EE4B2B]/20"
        )}
      >
        {followed ? (
          <>
            <UserCheck className="w-3.5 h-3.5" /> Abonné
          </>
        ) : (
          <>
            <UserPlus className="w-3.5 h-3.5" /> Suivre {creatorName}
          </>
        )}
      </button>

      <div className="w-px h-5 bg-neutral-200 dark:bg-zinc-800 hidden sm:block" />

      {/* Tooltip highlighting instruction */}
      <div className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground px-2 font-medium">
        <HelpCircle className="w-3 h-3 text-neutral-400 shrink-0" />
        <span>Surlignez du texte pour l'ajouter à vos notes</span>
      </div>
    </motion.div>
  )
}
