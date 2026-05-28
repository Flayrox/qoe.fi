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
    <div className="bg-white rounded-[28px] p-6 sm:p-8 border-[0.5px] border-neutral-200/40 flex flex-col gap-5 hover:shadow-xl hover:shadow-neutral-200/40 hover:scale-[1.002] transition-all duration-500 ease-[0.16,1,0.3,1]">
      <div className="flex items-center justify-between">
        <button 
          onClick={handleOpenProfile}
          className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer group/author outline-none text-left"
        >
          <div className="w-9 h-9 rounded-[10px] overflow-hidden border-[0.5px] border-neutral-200/50 shrink-0 transition-transform duration-500 group-hover/author:scale-105">
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
              <span className="text-[13px] font-bold text-neutral-900 block leading-none group-hover/author:text-[#EE4B2B] transition-colors">{post.author.name}</span>
              {post.author.isCertified && <span className="text-[#EE4B2B] text-[10px] font-black">✓</span>}
            </div>
            <span className="text-[10px] text-neutral-400 block mt-1 font-mono uppercase tracking-wider">@{post.author.username || post.author.subdomain}</span>
          </div>
        </button>
        <span className="text-[10px] text-neutral-400 font-medium font-mono">
          {new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </div>

      <div 
        onClick={handleOpenPost}
        className="text-[15px] sm:text-[16px] text-neutral-800 leading-relaxed font-sans cursor-pointer hover:text-neutral-950 transition-colors duration-200 pt-1"
      >
        <TextParser content={post.content} />
      </div>

      {post.imageUrl && (
        <div className="rounded-[16px] border-[0.5px] border-neutral-200/40 overflow-hidden bg-neutral-100 max-h-96 cursor-pointer mt-1" onClick={handleOpenPost}>
          <img src={post.imageUrl} className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-700 ease-[0.16,1,0.3,1]" alt="Image jointe" />
        </div>
      )}
    </div>
  )
}
