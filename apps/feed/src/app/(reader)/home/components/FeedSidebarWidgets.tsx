"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Compass, TrendingUp, UserCheck, UserPlus, BookOpen, Highlighter, Users } from "lucide-react"
import { cn } from "@qoe/utils"
import { useTranslate } from "@qoe/i18n"

import { routes } from "@qoe/config/routes"

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
    setFollowedLocally((prev) => {
      const next = new Set(prev)
      alreadyFollowed ? next.delete(creator.id) : next.add(creator.id)
      return next
    })
    onFollowToggle(creator)
  }

  return (
    <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-6 select-none">
      {/* ── Widget 1 : Votre Activité ── */}
      {userStats && (
        <div className="bg-card border border-border/60 rounded-xl p-5 shadow-xs space-y-5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} />
            {t("feed.your_week", "Votre semaine")}
          </span>
          <div className="grid grid-cols-3 gap-2">
            <StatCell icon={BookOpen} value={userStats.articlesRead} label={t("feed.stat_read", "Lus")} />
            <StatCell icon={Highlighter} value={userStats.highlights} label={t("feed.stat_highlights", "Surlignages")} />
            <StatCell icon={Users} value={userStats.following} label={t("feed.stat_following", "Abonnements")} />
          </div>

          <ActivitySparkline />
        </div>
      )}

      {/* ── Widget 2 : Créateurs suggérés ── */}
      {suggestedCreators.length > 0 && (
        <div className="bg-card border border-border/60 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Compass className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} />
              {t("feed.to_discover", "À Découvrir")}
            </span>
            <button
              type="button"
              className="text-[10px] font-semibold text-muted-foreground hover:text-primary transition-colors cursor-pointer outline-none"
            >
              {t("feed.see_more", "Voir +")}
            </button>
          </div>

          <div className="space-y-3.5">
            {suggestedCreators.slice(0, 3).map((creator) => {
              const isFollowedLocally = followedLocally.has(creator.id)
              const isJustFollowed = justFollowed === creator.id

              return (
                <div key={creator.id} className="flex items-center justify-between gap-3 group/sug">
                  <motion.button
                    type="button"
                    onClick={() => {
                      const username = creator.username || creator.subdomain || ""
                      if (onOpenProfile) {
                        onOpenProfile(username)
                      } else {
                        window.location.href = routes.feed.profile(username)
                      }
                    }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2.5 min-w-0 hover:opacity-85 transition-opacity cursor-pointer flex-1 outline-none text-left"
                  >
                    <div className="w-8 h-8 rounded-lg overflow-hidden border border-border/60 shrink-0 transition-transform duration-200 group-hover/sug:scale-105 bg-muted flex items-center justify-center font-bold text-xs text-primary">
                      {creator.logoUrl ? (
                        <img src={creator.logoUrl} className="w-full h-full object-cover" alt="" />
                      ) : (
                        creator.name?.charAt(0)
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-foreground block leading-tight truncate group-hover/sug:text-primary transition-colors">
                        {creator.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground block truncate mt-0.5 font-mono">
                        @{creator.username || creator.subdomain}
                      </span>
                    </div>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    transition={springs.follow}
                    onClick={() => handleFollow(creator)}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer outline-none",
                      isFollowedLocally
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary text-primary-foreground hover:opacity-90"
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
                          <UserCheck className="w-3.5 h-3.5" />
                          {t("feed.subscribed_alert", "Abonné !")}
                        </motion.span>
                      ) : isFollowedLocally ? (
                        <motion.span key="followed" className="flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" />
                          {t("feed.subscribed", "Abonné")}
                        </motion.span>
                      ) : (
                        <motion.span key="follow" className="flex items-center gap-1">
                          <UserPlus className="w-3.5 h-3.5" />
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

function ActivitySparkline() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const data = [1, 3, 2, 5, 2, 4, 3]
  const days = ["L", "M", "M", "J", "V", "S", "D"]
  const maxVal = Math.max(...data)

  return (
    <div className="pt-3.5 border-t border-border/50 flex flex-col gap-2">
      <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
        <span>Activité de lecture</span>
        <span className="text-primary font-semibold">
          {hoveredIndex !== null ? `${data[hoveredIndex]} écrits` : "7 derniers jours"}
        </span>
      </div>

      <div className="h-9 flex items-end justify-between gap-1.5 pt-1">
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
              <div className="w-full relative h-6 flex items-end">
                <motion.div
                  animate={{
                    height: `${Math.max(heightPercent, 12)}%`,
                  }}
                  transition={{ type: "spring", stiffness: 350, damping: 20 }}
                  className={cn(
                    "w-full rounded-xs transition-colors",
                    isHovered ? "bg-primary" : "bg-primary/20"
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[9px] font-medium transition-colors font-sans font-medium",
                  isHovered ? "text-primary" : "text-muted-foreground"
                )}
              >
                {days[idx]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
    <div className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-muted/50 border border-border/40">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
      <span className="text-base font-bold text-foreground leading-none tracking-tight">
        {value}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  )
}
