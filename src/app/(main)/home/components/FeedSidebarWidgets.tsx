"use client"

import React from "react"
import { Hash, Sparkles, Compass } from "lucide-react"
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
  tagsList: string[]
  selectedTag: string | null
  onTagClick: (tag: string) => void
  suggestedCreators: SuggestedCreator[]
  onFollowToggle: (creator: SuggestedCreator) => void
}

export function FeedSidebarWidgets({
  tagsList,
  selectedTag,
  onTagClick,
  suggestedCreators,
  onFollowToggle,
}: FeedSidebarWidgetsProps) {
  const { addTab } = useTabStore()

  return (
    <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-12 select-none pl-4">
      {/* Popular Hashtags */}
      <div className="flex flex-col gap-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 flex items-center gap-2">
          <Hash className="w-3.5 h-3.5 text-neutral-300" strokeWidth={2} /> Thématiques
        </span>
        
        <div className="flex flex-wrap gap-2">
          {tagsList.map(tag => (
            <button
              key={tag}
              onClick={() => onTagClick(tag)}
              className={cn(
                "text-[10px] font-bold px-3 py-1.5 rounded-full transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30 outline-none",
                selectedTag === tag
                  ? "bg-[#EE4B2B] text-white shadow-sm"
                  : "bg-neutral-200/40 hover:bg-neutral-200/80 text-neutral-500 hover:text-neutral-900"
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Actualités */}
      <div className="flex flex-col gap-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-neutral-300" strokeWidth={2} /> Actualités
        </span>
        
        <div className="space-y-5">
          {[
            { title: "Calibrage vectoriel", desc: "L'Algorithme de Sérendipité pgvector a été synchronisé.", date: "Aujourd'hui" },
            { title: "Sanctuaire Attentionnel", desc: "Déploiement du carnet de notes monastique finalisé.", date: "Hier" },
            { title: "Croissance", desc: "QOE.FI dépasse les 10 000 lecteurs mensuels souverains.", date: "24 Mai" }
          ].map((news, i) => (
            <div key={i} className="flex flex-col gap-1 border-l-[1.5px] border-neutral-200 hover:border-[#EE4B2B] pl-3.5 transition-colors duration-300 group">
              <span className="text-[9px] text-neutral-400 font-bold block leading-none font-mono tracking-wider">{news.date}</span>
              <span className="text-[13px] font-bold text-neutral-800 group-hover:text-[#EE4B2B] transition-colors duration-300 block leading-tight mt-1">{news.title}</span>
              <span className="text-[11px] text-neutral-500 leading-relaxed block mt-0.5">{news.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Suggested creators discovery */}
      {suggestedCreators.length > 0 && (
        <div className="flex flex-col gap-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 flex items-center gap-2">
            <Compass className="w-3.5 h-3.5 text-neutral-300" strokeWidth={2} /> À Découvrir
          </span>
          
          <div className="space-y-4">
            {suggestedCreators.map(creator => {
              return (
                <div key={creator.id} className="flex items-center justify-between gap-3 group/sug">
                  <div 
                    onClick={() => addTab({
                      id: `profile-${creator.username || creator.subdomain}`,
                      title: creator.name || `@${creator.username || creator.subdomain}`,
                      type: "profile",
                      username: creator.username || creator.subdomain || ""
                    })}
                    className="flex items-center gap-3 min-w-0 hover:opacity-85 transition-opacity cursor-pointer flex-1"
                  >
                    <div className="w-9 h-9 rounded-[10px] overflow-hidden border-[0.5px] border-neutral-200/50 shrink-0 shadow-sm transition-transform duration-300 group-hover/sug:scale-105">
                      {creator.logoUrl ? (
                        <img src={creator.logoUrl} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full bg-[#EE4B2B]/5 flex items-center justify-center font-bold text-[10px] text-[#EE4B2B]">
                          {creator.name?.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[13px] font-bold text-neutral-900 block leading-none truncate group-hover/sug:text-[#EE4B2B] transition-colors duration-200">{creator.name}</span>
                      <span className="text-[10px] text-neutral-400 block truncate mt-1 font-mono uppercase tracking-wider">@{creator.username || creator.subdomain}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onFollowToggle(creator)}
                    className="bg-neutral-100 hover:bg-[#EE4B2B] text-neutral-500 hover:text-white font-bold text-[10px] px-3 py-1.5 rounded-lg transition-colors duration-300 shrink-0 cursor-pointer"
                  >
                    Suivre
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

