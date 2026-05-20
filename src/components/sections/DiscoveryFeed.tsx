"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslate } from "@tolgee/react";
import { Bookmark, ArrowUpRight, Sparkles, EyeOff, Info } from "lucide-react";

interface DiscoveryFeedProps {
  articles: any[];
  serendiptyArticles: any[];
  mutedWords?: string[];
}

export const DiscoveryFeed = ({ articles, serendiptyArticles, mutedWords = [] }: DiscoveryFeedProps) => {
  const { t } = useTranslate();
  const [isSerendipityMode, setIsSerendipityMode] = useState(false);
  const displayArticles = isSerendipityMode ? serendiptyArticles : articles;

  const checkIsMuted = (content: string, title: string) => {
    const fullText = (content + " " + title).toLowerCase();
    return mutedWords.some(word => fullText.includes(word.toLowerCase()));
  };

  return (
    <section className="py-32 px-6 bg-black">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-24 gap-12">
          <div className="max-w-2xl">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              className="font-mono text-[10px] tracking-[0.4em] text-white/40 uppercase font-semibold mb-6 block"
            >
              {t("feed_tagline", "Curations Souveraines")}
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              className="font-classical text-4xl md:text-6xl text-white font-medium tracking-tight mb-8"
            >
              {t("feed_title", "Explorez le réseau.")}
            </motion.h2>
          </div>

          {/* Serendipity Toggle */}
          <div className="flex items-center gap-4 p-2 bg-neutral-900/40 backdrop-blur-2xl border border-white/5 rounded-full shadow-2xl">
             <span className="pl-4 text-[10px] font-mono text-white/40 uppercase tracking-widest">
               {t("feed_toggle_label", "Mode Hors-Piste")}
             </span>
             <button
               onClick={() => setIsSerendipityMode(!isSerendipityMode)}
               className={`relative w-16 h-8 rounded-full transition-colors duration-500 ${isSerendipityMode ? "bg-emerald-500" : "bg-white/5"}`}
             >
               <motion.div
                 animate={{ x: isSerendipityMode ? 32 : 4 }}
                 className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-xl"
                 transition={{ type: "spring", stiffness: 500, damping: 30 }}
               />
             </button>
          </div>
        </div>

        {/* Articles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence mode="popLayout">
            {displayArticles.map((article, index) => {
              const isMuted = checkIsMuted(article.content, article.title);
              
              return (
                <motion.div
                  layout
                  key={article.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                  className="group relative h-full flex flex-col bg-neutral-900/40 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] overflow-hidden hover:border-white/20 transition-all duration-500"
                >
                  <div className="p-10 flex-1 flex flex-col">
                    
                    {/* Card Header */}
                    <div className="flex items-center justify-between mb-8">
                       <div className="flex items-center gap-3">
                         {article.author.logoUrl ? (
                           <img src={article.author.logoUrl} className="w-8 h-8 rounded-full object-cover border border-white/10" />
                         ) : (
                           <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-mono border border-white/10">
                             {article.author.name?.charAt(0)}
                           </div>
                         )}
                         <span className="text-xs font-medium text-white/60">{article.author.name}</span>
                       </div>
                       <button className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:bg-white hover:text-black transition-all">
                         <Bookmark className="w-4 h-4" />
                       </button>
                    </div>

                    {/* Content */}
                    <h3 className="font-classical text-2xl text-white mb-6 group-hover:text-emerald-400 transition-colors duration-500">
                      {article.title}
                    </h3>
                    
                    <p className="font-sans text-white/40 text-sm leading-relaxed line-clamp-3 mb-8">
                      {article.content.replace(/<[^>]*>?/gm, '')}
                    </p>

                    {/* Footer */}
                    <div className="mt-auto pt-8 border-t border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
                          {new Date(article.createdAt).toLocaleDateString()}
                        </span>
                        {article.isPremium && (
                          <Sparkles className="w-3 h-3 text-amber-400" />
                        )}
                      </div>
                      <ArrowUpRight className="w-5 h-5 text-white/20 group-hover:text-white group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                    </div>
                  </div>

                  {/* Muted Overlay */}
                  {isMuted && (
                    <div className="absolute inset-0 z-20 backdrop-blur-3xl bg-black/60 flex flex-col items-center justify-center p-8 text-center">
                       <EyeOff className="w-12 h-12 text-white/20 mb-6" />
                       <h4 className="text-white font-classical text-xl mb-4">{t("feed_muted_title", "Contenu filtré")}</h4>
                       <p className="text-white/40 text-sm mb-8">{t("feed_muted_desc", "Cet article contient des mots que vous avez choisi de bannir de votre sanctuaire.")}</p>
                       <button className="px-6 py-2 border border-white/10 rounded-full text-[10px] font-mono text-white/60 hover:bg-white/5 uppercase tracking-widest transition-all">
                         {t("feed_muted_show", "Voir quand même")}
                       </button>
                    </div>
                  )}

                  <a href={`/article/${article.slug}`} className="absolute inset-0 z-10" />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Serendipity Info Overlay */}
        <AnimatePresence>
          {isSerendipityMode && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-12 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-[2rem] flex items-start gap-4"
            >
              <Info className="w-6 h-6 text-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-emerald-500 font-bold mb-1">{t("feed_serendipity_title", "Exploration Hors-Piste active")}</p>
                <p className="text-emerald-500/60 text-sm">{t("feed_serendipity_desc", "L'algorithme injecte des perspectives divergentes pour stimuler votre esprit critique et briser votre bulle de filtres.")}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </section>
  );
};
