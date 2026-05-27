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
    <div className="lg:col-span-4 lg:sticky lg:top-16 space-y-4 select-none">
      {/* Card 1: Popular Hashtags */}
      <div className="bg-white border border-neutral-200/50 rounded-xl p-5 shadow-xs hover:border-neutral-300 transition-all duration-300">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-400 block mb-4 flex items-center gap-1.5">
          <Hash className="w-3.5 h-3.5 text-[#EE4B2B]" /> Populaires & Hashtags
        </span>
        
        <div className="flex flex-wrap gap-1.5">
          {tagsList.map(tag => (
            <button
              key={tag}
              onClick={() => onTagClick(tag)}
              className={cn(
                "text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all border cursor-pointer",
                selectedTag === tag
                  ? "bg-[#EE4B2B] border-[#EE4B2B] text-white shadow-xs"
                  : "bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-500 hover:text-neutral-800"
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Card 2: Actualités with surgical Vermillion accents */}
      <div className="bg-white border border-neutral-200/50 rounded-xl p-5 shadow-xs hover:border-neutral-300 transition-all duration-300">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-400 block mb-4 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#EE4B2B]" /> Actualité & Souveraineté
        </span>
        
        <div className="space-y-4">
          {[
            { title: "Calibrage vectoriel", desc: "L'Algorithme de Sérendipité pgvector a été synchronisé.", date: "Aujourd'hui" },
            { title: "Sanctuaire Attentionnel", desc: "Déploiement du carnet de notes monastique finalisé.", date: "Hier" },
            { title: "Croissance", desc: "QOE.FI dépasse les 10 000 lecteurs mensuels souverains.", date: "24 Mai" }
          ].map((news, i) => (
            <div key={i} className="flex flex-col gap-1 border-l-2 border-neutral-100 hover:border-[#EE4B2B] pl-3 transition-colors duration-300 group">
              <span className="text-[9px] text-neutral-400 font-bold block leading-none font-mono">{news.date}</span>
              <span className="text-xs font-semibold text-neutral-800 group-hover:text-[#EE4B2B] transition-colors duration-300 block leading-tight mt-1">{news.title}</span>
              <span className="text-[10px] text-neutral-400 leading-relaxed block mt-0.5">{news.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Suggested creators discovery */}
      {suggestedCreators.length > 0 && (
        <div className="bg-white border border-neutral-200/50 rounded-xl p-5 shadow-xs hover:border-neutral-300 transition-all duration-300">
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-400 block mb-4 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-[#EE4B2B]" /> À Découvrir
          </span>
          
          <div className="space-y-3.5">
            {suggestedCreators.map(creator => {
              return (
                <div key={creator.id} className="flex items-center justify-between gap-3">
                  <div 
                    onClick={() => addTab({
                      id: `profile-${creator.username || creator.subdomain}`,
                      title: creator.name || `@${creator.username || creator.subdomain}`,
                      type: "profile",
                      username: creator.username || creator.subdomain || ""
                    })}
                    className="flex items-center gap-2.5 min-w-0 hover:opacity-85 transition-opacity cursor-pointer group/sug"
                  >
                    <div className="w-8 h-8 rounded-md overflow-hidden border border-neutral-200/30 shrink-0 shadow-xs">
                      {creator.logoUrl ? (
                        <img src={creator.logoUrl} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full bg-[#EE4B2B]/5 flex items-center justify-center font-bold text-[9px] text-[#EE4B2B]">
                          {creator.name?.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold block leading-none truncate group-hover/sug:text-[#EE4B2B] transition-colors duration-200">{creator.name}</span>
                      <span className="text-[9px] text-neutral-400 block truncate mt-1 font-mono">@{creator.username || creator.subdomain}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onFollowToggle(creator)}
                    className="bg-[#EE4B2B]/5 hover:bg-[#EE4B2B] hover:text-white border border-[#EE4B2B]/20 text-[#EE4B2B] font-bold text-[9px] px-2.5 py-1.5 rounded-md transition-all shrink-0 cursor-pointer"
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
