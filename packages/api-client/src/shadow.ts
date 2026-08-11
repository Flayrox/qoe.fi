"use client"

import { useEffect, useState, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"

/**
 * 📦 Module-level Shadow State Store & Emitter
 * Direct port of Bluesky's zero-refetch shadow architecture for qoe.fi.
 */
type ShadowState = Record<string, any>

const thoughtShadows = new Map<string, ShadowState>()
const profileShadows = new Map<string, ShadowState>()
const listeners = new Set<() => void>()

function notifyListeners() {
  listeners.forEach((fn) => fn())
}

export function updateThoughtShadow(thoughtId: string, patch: Partial<ShadowState>) {
  const current = thoughtShadows.get(thoughtId) || {}
  thoughtShadows.set(thoughtId, { ...current, ...patch })
  notifyListeners()
}

export function updateProfileShadow(userIdOrHandle: string, patch: Partial<ShadowState>) {
  const clean = userIdOrHandle.replace(/^@/, "")
  const current = profileShadows.get(clean) || {}
  profileShadows.set(clean, { ...current, ...patch })
  notifyListeners()
}

export function useThoughtShadow<T extends { id?: string; isLiked?: boolean; liked?: boolean; likeCount?: number; reposted?: boolean; repostCount?: number }>(thought: T): T {
  const [, setTick] = useState(0)

  useEffect(() => {
    const handleUpdate = () => setTick((t) => t + 1)
    listeners.add(handleUpdate)
    return () => {
      listeners.delete(handleUpdate)
    }
  }, [])

  return useMemo(() => {
    if (!thought || !thought.id) return thought
    const shadow = thoughtShadows.get(thought.id)
    if (!shadow) return thought

    return {
      ...thought,
      isLiked: shadow.isLiked !== undefined ? shadow.isLiked : thought.isLiked ?? thought.liked,
      liked: shadow.isLiked !== undefined ? shadow.isLiked : thought.liked ?? thought.isLiked,
      likeCount: shadow.likeCount !== undefined ? shadow.likeCount : thought.likeCount,
      reposted: shadow.reposted !== undefined ? shadow.reposted : thought.reposted,
      repostCount: shadow.repostCount !== undefined ? shadow.repostCount : thought.repostCount,
    }
  }, [thought])
}

export function useProfileShadow<T extends { id?: string; username?: string | null; subdomain?: string | null; isFollowing?: boolean }>(user: T): T {
  const [, setTick] = useState(0)

  useEffect(() => {
    const handleUpdate = () => setTick((t) => t + 1)
    listeners.add(handleUpdate)
    return () => {
      listeners.delete(handleUpdate)
    }
  }, [])

  return useMemo(() => {
    if (!user) return user
    const handle = user.username || user.subdomain || user.id || ""
    const clean = handle.replace(/^@/, "")
    const shadow = profileShadows.get(clean)
    if (!shadow) return user

    return {
      ...user,
      isFollowing: shadow.isFollowing !== undefined ? shadow.isFollowing : user.isFollowing,
    }
  }, [user])
}
