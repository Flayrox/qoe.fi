"use client"

import React from "react"
import { useTabStore } from "@/lib/use-tab-store"
import { TextParser } from "@/components/ui/TextParser"

export interface MicroPostData {
  id: string
  content: string
  imageUrl?: string | null
  createdAt: string | Date
  author: {
    id: string
    name: string | null
    username: string | null
    subdomain?: string | null
    logoUrl: string | null
    isCertified?: boolean
  }
}

export function MicroPostCard({ post }: { post: MicroPostData }) {
  const { addTab } = useTabStore()

  const handleOpenProfile = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const targetUsername = post.author.username || post.author.subdomain
    if (!targetUsername) return
    addTab({
      id: `profile-${targetUsername}`,
      title: `@${targetUsername}`,
      type: "profile",
      username: targetUsername
    })
  }

  const handleOpenPost = () => {
    addTab({
      id: `post-${post.id}`,
      title: `${post.author.name || "Post"}`,
      type: "post"
    })
  }

  return (
    <div className="bg-white rounded-xl p-5 md:p-6 shadow-xs border border-neutral-200/50 flex flex-col gap-4 hover:border-neutral-300 transition-all duration-300">
      <div className="flex items-center justify-between">
        <button 
          onClick={handleOpenProfile}
          className="flex items-center gap-2.5 hover:opacity-90 transition-opacity cursor-pointer group/author outline-none text-left"
        >
          <div className="w-8 h-8 rounded-md overflow-hidden border border-neutral-200/30 shrink-0">
            {post.author.logoUrl ? (
              <img src={post.author.logoUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full bg-[#EE4B2B]/5 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                {post.author.name?.charAt(0) || "U"}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-neutral-800 block leading-none group-hover/author:text-[#EE4B2B] transition-colors">{post.author.name}</span>
              {post.author.isCertified && <span className="text-[#EE4B2B] text-[9px] font-black">✓</span>}
            </div>
            <span className="text-[10px] text-neutral-400 block mt-1 font-mono">@{post.author.username || post.author.subdomain}</span>
          </div>
        </button>
        <span className="text-[10px] text-neutral-400 font-mono">
          {new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </div>

      <div 
        onClick={handleOpenPost}
        className="text-[13px] text-neutral-700 leading-relaxed font-sans cursor-pointer hover:text-neutral-950 transition-colors duration-200"
      >
        <TextParser content={post.content} />
      </div>

      {post.imageUrl && (
        <div className="rounded-lg border border-neutral-200/40 overflow-hidden bg-neutral-100 max-h-96 cursor-pointer" onClick={handleOpenPost}>
          <img src={post.imageUrl} className="w-full h-full object-cover hover:scale-[1.01] transition-transform duration-300" alt="Image jointe" />
        </div>
      )}
    </div>
  )
}
