"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslate } from "@tolgee/react";
import { Bookmark, ArrowUpRight, Sparkles, EyeOff } from "lucide-react";

interface DiscoveryFeedProps {
  articles: any[];
  mutedWords?: string[];
}

export const DiscoveryFeed = ({ articles, mutedWords = [] }: DiscoveryFeedProps) => {
  const { t } = useTranslate();

  const checkIsMuted = (content: string, title: string) => {
    const fullText = (content + " " + title).toLowerCase();
    return mutedWords.some(word => fullText.includes(word.toLowerCase()));
  };

  return (
    <section className="py-24 px-6 bg-background">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
          <div className="max-w-2xl text-left">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              className="text-[10px] tracking-[0.3em] text-neutral-400 uppercase font-semibold mb-4 block"
            >
              {t("feed_tagline", "Curations Récentes")}
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-5xl text-neutral-900 font-bold tracking-tight"
            >
              {t("feed_title", "Explorez les publications.")}
            </motion.h2>
          </div>
        </div>

        {/* Articles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence mode="popLayout">
            {articles.map((article, index) => {
              const isMuted = checkIsMuted(article.content, article.title);
              
              return (
                <motion.div
                  layout
                  key={article.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                  className="group relative h-full flex flex-col bg-white border border-neutral-200 rounded-3xl overflow-hidden hover:border-[#EE4B2B]/40 shadow-sm hover:shadow-md transition-all duration-300"
                >
                  <div className="p-8 flex-1 flex flex-col">
                    
                    {/* Card Header */}
                    <div className="flex items-center justify-between mb-6">
                       <div className="flex items-center gap-3">
                          {article.author.logoUrl ? (
                            <img src={article.author.logoUrl} className="w-8 h-8 rounded-full object-cover border border-neutral-200" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-sans text-neutral-600 border border-neutral-200">
                              {article.author.name?.charAt(0)}
                            </div>
                          )}
                          <span className="text-xs font-semibold text-neutral-600">{article.author.name}</span>
                       </div>
                       <button className="w-9 h-9 rounded-full bg-neutral-50 border border-neutral-200 flex items-center justify-center text-neutral-400 hover:bg-neutral-100 hover:text-[#EE4B2B] transition-colors relative z-20">
                         <Bookmark className="w-3.5 h-3.5" />
                       </button>
                    </div>

                    {/* Content */}
                    <h3 className="text-xl font-bold text-neutral-900 mb-4 group-hover:text-[#EE4B2B] transition-colors duration-300 line-clamp-2">
                      {article.title}
                    </h3>
                    
                    <p className="text-neutral-500 text-sm leading-relaxed line-clamp-3 mb-6">
                      {article.content.replace(/<[^>]*>?/gm, '')}
                    </p>

                    {/* Footer */}
                    <div className="mt-auto pt-6 border-t border-neutral-100 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-sans text-neutral-400 font-medium">
                          {new Date(article.createdAt).toLocaleDateString()}
                        </span>
                        {article.isPremium && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <Sparkles className="w-2.5 h-2.5" /> Premium
                          </span>
                        )}
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-neutral-300 group-hover:text-[#EE4B2B] group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                    </div>
                  </div>

                  {/* Muted Overlay */}
                  {isMuted && (
                    <div className="absolute inset-0 z-20 backdrop-blur-lg bg-white/95 flex flex-col items-center justify-center p-6 text-center">
                       <EyeOff className="w-10 h-10 text-neutral-300 mb-4" />
                       <h4 className="text-neutral-900 font-bold text-lg mb-2">{t("feed_muted_title", "Contenu filtré")}</h4>
                       <p className="text-neutral-500 text-xs mb-6 max-w-[240px] leading-relaxed">{t("feed_muted_desc", "Cet article contient des mots bannis de votre espace.")}</p>
                       <button className="px-4 py-2 border border-neutral-200 rounded-lg text-xs text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer font-semibold relative z-30">
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

      </div>
    </section>
  );
};
