"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Compass, TrendingUp, UserCheck, UserPlus, BookOpen, Highlighter, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTabStore } from "@/lib/use-tab-store"

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
  // Stats utilisateur (optionnelles)
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
  userStats,
}: FeedSidebarWidgetsProps) {
  const { addTab } = useTabStore()
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
    <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-8 select-none">

      {/* ── Widget 1 : Votre Activité ───────────────────── */}
      {userStats && (
        <div className="pb-6 border-b border-[var(--border-default)]">
          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] flex items-center gap-2 mb-4">
            <TrendingUp className="w-3 h-3" strokeWidth={2.5} />
            Votre semaine
          </span>
          <div className="grid grid-cols-3 gap-3">
            <StatCell icon={BookOpen} value={userStats.articlesRead} label="Lus" />
            <StatCell icon={Highlighter} value={userStats.highlights} label="Surlignages" />
            <StatCell icon={Users} value={userStats.following} label="Abonnements" />
          </div>
        </div>
      )}

      {/* ── Widget 2 : Créateurs suggérés ──────────────── */}
      {suggestedCreators.length > 0 && (
        <div className="pb-6 border-b border-[var(--border-default)]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] flex items-center gap-2">
              <Compass className="w-3 h-3" strokeWidth={2.5} />
              À Découvrir
            </span>
            <button className="text-[9px] font-bold text-[var(--text-tertiary)] hover:text-[var(--qoe-vermillion)] transition-colors">
              Voir +
            </button>
          </div>

          <div className="space-y-4">
            {suggestedCreators.slice(0, 5).map(creator => {
              const isFollowedLocally = followedLocally.has(creator.id)
              const isJustFollowed = justFollowed === creator.id

              return (
                <div key={creator.id} className="flex items-center justify-between gap-3 group/sug">
                  {/* Profile */}
                  <button
                    onClick={() => addTab({
                      id: `profile-${creator.username || creator.subdomain}`,
                      title: creator.name || `@${creator.username || creator.subdomain}`,
                      type: "profile",
                      username: creator.username || creator.subdomain || ""
                    })}
                    className="flex items-center gap-2.5 min-w-0 hover:opacity-85 transition-opacity cursor-pointer flex-1 outline-none text-left"
                  >
                    <div className="w-8 h-8 rounded-[var(--radius-icon)] overflow-hidden border border-[var(--border-default)] shrink-0 transition-transform duration-300 group-hover/sug:scale-105">
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
                      <span className="text-[9px] text-[var(--text-tertiary)] block truncate mt-0.5 font-mono uppercase tracking-wider">
                        @{creator.username || creator.subdomain}
                      </span>
                    </div>
                  </button>

                  {/* Follow button avec micro-animation */}
                  <motion.button
                    whileTap={{ scale: 0.9 }}
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
                          Abonné !
                        </motion.span>
                      ) : isFollowedLocally ? (
                        <motion.span key="followed" className="flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />
                          Abonné
                        </motion.span>
                      ) : (
                        <motion.span key="follow" className="flex items-center gap-1">
                          <UserPlus className="w-3 h-3" />
                          Suivre
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
    <div className="flex flex-col items-center gap-1.5 py-3 rounded-[var(--radius-element)] bg-[var(--surface-1)]">
      <Icon className="w-3.5 h-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
      <span className="text-[18px] font-black text-[var(--text-primary)] leading-none font-mono tabular-nums">
        {value}
      </span>
      <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </span>
    </div>
  )
}
