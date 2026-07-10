"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Compass, TrendingUp, UserCheck, UserPlus, BookOpen, Highlighter, Users } from "lucide-react"
import { cn } from "@qoe/utils"

import { useTranslate } from "@qoe/i18n"

interface SuggestedCreator {
  id: string
  name: string | null
  username: string | null
  subdomain: string | null
  logoUrl: string | null
}

interface FeedSidebarWidgetsProps {
  suggestedCreators: SuggestedCreator[]
  onFollowToggle: (creator: SuggestedCreator) => void
  onOpenProfile?: (username: string) => void
  userStats?: {
    articlesRead: number
    highlights: number
    following: number
  }
}

const springs = {
  follow: { type: "spring" as const, stiffness: 480, damping: 30, mass: 0.6 },
}

export function FeedSidebarWidgets({
  suggestedCreators,
  onFollowToggle,
  onOpenProfile,
  userStats,
}: FeedSidebarWidgetsProps) {
  const { t } = useTranslate()
  const [followedLocally, setFollowedLocally] = useState<Set<string>>(new Set())
  const [justFollowed, setJustFollowed] = useState<string | null>(null)

  const handleFollow = (creator: SuggestedCreator) => {
    const alreadyFollowed = followedLocally.has(creator.id)
    if (!alreadyFollowed) {
      setJustFollowed(creator.id)
      setTimeout(() => setJustFollowed(null), 1800)
    }
    setFollowedLocally(prev => {
      const next = new Set(prev)
      alreadyFollowed ? next.delete(creator.id) : next.add(creator.id)
      return next
    })
    onFollowToggle(creator)
  }

  return (
    <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-6 select-none">

      {/* ── Widget 1 : Votre Activité (Feuille Blanche) ── */}
      {userStats && (
        <div className="bg-white border border-[var(--border-subtle)] rounded-md p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01),0_10px_35px_rgba(0,0,0,0.02)] space-y-5">
          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] flex items-center gap-2">
            <TrendingUp className="w-3 h-3 text-[var(--qoe-vermillion)]" strokeWidth={2.5} />
            {t("feed.your_week", "Votre semaine")}
          </span>
          <div className="grid grid-cols-3 gap-2.5">
            <StatCell icon={BookOpen} value={userStats.articlesRead} label={t("feed.stat_read", "Lus")} />
            <StatCell icon={Highlighter} value={userStats.highlights} label={t("feed.stat_highlights", "Surlignages")} />
            <StatCell icon={Users} value={userStats.following} label={t("feed.stat_following", "Abonnements")} />
          </div>

          {/* Interactive sparkline graph */}
          <ActivitySparkline />
        </div>
      )}

      {/* ── Widget 2 : Créateurs suggérés (Feuille Blanche) ── */}
      {suggestedCreators.length > 0 && (
        <div className="bg-white border border-[var(--border-subtle)] rounded-md p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01),0_10px_35px_rgba(0,0,0,0.02)] space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] flex items-center gap-2">
              <Compass className="w-3 h-3 text-[var(--qoe-vermillion)]" strokeWidth={2.5} />
              {t("feed.to_discover", "À Découvrir")}
            </span>
            <button className="text-[9px] font-bold text-[var(--text-tertiary)] hover:text-[var(--qoe-vermillion)] transition-colors cursor-pointer outline-none">
              {t("feed.see_more", "Voir +")}
            </button>
          </div>

          <div className="space-y-4">
            {suggestedCreators.slice(0, 3).map(creator => {
              const isFollowedLocally = followedLocally.has(creator.id)
              const isJustFollowed = justFollowed === creator.id

              return (
                <div key={creator.id} className="flex items-center justify-between gap-3 group/sug">
                  {/* Profile */}
                  <motion.button
                    onClick={() => {
                      const username = creator.username || creator.subdomain || ''
                      if (onOpenProfile) {
                        onOpenProfile(username)
                      } else {
                        window.location.href = `/profile/${username}`
                      }
                    }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2.5 min-w-0 hover:opacity-85 transition-opacity cursor-pointer flex-1 outline-none text-left"
                  >
                    <div className="w-8 h-8 rounded-[var(--radius-icon)] overflow-hidden border border-[var(--border-subtle)] shrink-0 transition-transform duration-300 group-hover/sug:scale-105">
                      {creator.logoUrl ? (
                        <img src={creator.logoUrl} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-[10px] text-[var(--qoe-vermillion)]">
                          {creator.name?.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[12px] font-bold text-[var(--text-primary)] block leading-tight truncate group-hover/sug:text-[var(--qoe-vermillion)] transition-colors duration-200">
                        {creator.name}
                      </span>
                      <span className="text-[9px] text-[var(--text-tertiary)] block truncate mt-0.5 uppercase tracking-wider font-sans">
                        @{creator.username || creator.subdomain}
                      </span>
                    </div>
                  </motion.button>

                  {/* Follow button with spring dynamics */}
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    transition={springs.follow}
                    onClick={() => handleFollow(creator)}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 text-[9px] font-bold px-2.5 py-1.5 rounded-[var(--radius-button)]",
                      "transition-colors duration-300 cursor-pointer outline-none",
                      "focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30",
                      isFollowedLocally
                        ? "bg-[var(--surface-2)] text-[var(--text-tertiary)]"
                        : "bg-[var(--qoe-vermillion)] text-white hover:bg-[#d63c1e]"
                    )}
                  >
                    <AnimatePresence mode="wait">
                      {isJustFollowed ? (
                        <motion.span
                          key="check"
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: [1.3, 1], opacity: 1 }}
                          exit={{ scale: 0.6, opacity: 0 }}
                          transition={springs.follow}
                          className="flex items-center gap-1"
                        >
                          <UserCheck className="w-3 h-3" />
                          {t("feed.subscribed_alert", "Abonné !")}
                        </motion.span>
                      ) : isFollowedLocally ? (
                        <motion.span key="followed" className="flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />
                          {t("feed.subscribed", "Abonné")}
                        </motion.span>
                      ) : (
                        <motion.span key="follow" className="flex items-center gap-1">
                          <UserPlus className="w-3 h-3" />
                          {t("feed.subscribe", "Suivre")}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </aside>
  )
}

// ── ActivitySparkline component ──
function ActivitySparkline() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const data = [1, 3, 2, 5, 2, 4, 3]
  const days = ["L", "M", "M", "J", "V", "S", "D"]
  const maxVal = Math.max(...data)

  return (
    <div className="pt-4 border-t border-neutral-100/60 flex flex-col gap-2">
      <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-wider text-neutral-400">
        <span>Activité de lecture</span>
        <span className="text-[var(--qoe-vermillion)] font-sans tracking-tight">
          {hoveredIndex !== null ? `${data[hoveredIndex]} écrits` : "7 derniers jours"}
        </span>
      </div>

      <div className="h-10 flex items-end justify-between gap-1.5 pt-1">
        {data.map((val, idx) => {
          const heightPercent = maxVal > 0 ? (val / maxVal) * 100 : 0
          const isHovered = hoveredIndex === idx

          return (
            <div
              key={idx}
              className="flex-1 flex flex-col items-center gap-1 group cursor-pointer"
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="w-full relative h-7 flex items-end">
                <motion.div
                  animate={{
                    height: `${Math.max(heightPercent, 12)}%`,
                    backgroundColor: isHovered ? "var(--qoe-vermillion)" : "rgba(238, 75, 43, 0.12)"
                  }}
                  transition={{ type: "spring", stiffness: 350, damping: 20 }}
                  className="w-full rounded-sm"
                />
              </div>
              <span className={cn(
                "text-[8px] font-bold transition-colors duration-150 font-sans",
                isHovered ? "text-[var(--qoe-vermillion)]" : "text-neutral-450"
              )}>
                {days[idx]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── StatCell sub-component ───────────────────────────────────────────────────
function StatCell({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType
  value: number
  label: string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-3 rounded-md bg-[var(--surface-1)] border border-[var(--border-subtle)]">
      <Icon className="w-3.5 h-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
      <span className="text-[17px] font-bold text-[var(--text-primary)] leading-none font-sans tracking-tight">
        {value}
      </span>
      <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] font-sans">
        {label}
      </span>
    </div>
  )
}
