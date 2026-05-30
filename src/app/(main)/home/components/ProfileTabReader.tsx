"use client"

import React, { useState, useEffect } from "react"
import { Loader2, AlertCircle } from "lucide-react"
import { getProfileData } from "../actions"
import { ProfileDashboard } from "@/app/[locale]/ProfileDashboard"
import { motion } from "framer-motion"

interface ProfileTabReaderProps {
  username: string
  currentUserId: string | null
}

const springs = {
  enter: { type: "spring" as const, stiffness: 420, damping: 32 }
}

export function ProfileTabReader({ username, currentUserId }: ProfileTabReaderProps) {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProfile() {
      setLoading(true)
      const res = await getProfileData(username)
      if (res.success && res.data) {
        setData(res.data)
      } else {
        setData(null)
      }
      setLoading(false)
    }
    loadProfile()
  }, [username])

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center py-32 gap-3 bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-card)]"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        {/* Skeleton header */}
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <div className="w-16 h-16 rounded-[var(--radius-element)] bg-[var(--surface-2)] animate-pulse" />
          <div className="w-32 h-3 bg-[var(--surface-2)] rounded-full animate-pulse" />
          <div className="w-24 h-2.5 bg-[var(--surface-2)] rounded-full animate-pulse opacity-60" />
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--qoe-vermillion)]" />
          <span className="text-[9px] text-[var(--text-tertiary)] font-bold uppercase tracking-[0.14em] font-mono">
            Chargement du profil…
          </span>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div
        className="bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-card)] p-16 text-center"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <AlertCircle className="w-8 h-8 text-[var(--text-quaternary)] mx-auto mb-3" />
        <p className="text-xs font-semibold text-[var(--text-secondary)]">
          Le profil demandé est introuvable.
        </p>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
          @{username}
        </p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.enter}
      className="bg-[var(--surface-0)] rounded-[var(--radius-card)] overflow-hidden border border-[var(--border-default)]"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <ProfileDashboard 
        profileUser={data.profileUser}
        currentUserId={currentUserId}
        isFollowing={data.isFollowing}
        followersCount={data.followersCount}
        followingCount={data.followingCount}
        postsCount={data.postsCount}
        posts={data.posts}
        articles={data.articles}
        highlights={data.highlights}
        letters={data.letters}
        initialMutedWords={data.initialMutedWords}
        linkedProviders={[]}
      />
    </motion.div>
  )
}
