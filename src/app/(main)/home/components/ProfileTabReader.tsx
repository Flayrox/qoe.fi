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
  enter: { type: "spring" as const, stiffness: 450, damping: 30 }
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
        setData({ error: res.error || "Une erreur est survenue." })
      }
      setLoading(false)
    }
    loadProfile()
  }, [username])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 bg-white border border-neutral-200/50 rounded-xl shadow-xs">
        <Loader2 className="w-5 h-5 animate-spin text-[#EE4B2B]" />
        <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider font-mono">Chargement du profil...</span>
      </div>
    )
  }

  if (!data || data.error) {
    return (
      <div className="bg-white border border-neutral-200/50 rounded-xl p-12 text-center text-neutral-500 shadow-xs">
        <AlertCircle className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
        <p className="text-xs">Le profil demandé est introuvable.</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.enter}
      className="bg-white rounded-xl overflow-hidden shadow-xs border border-neutral-200/50"
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
