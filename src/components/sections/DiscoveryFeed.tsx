"use client"

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, FilterX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function DiscoveryFeed({ articles, serendiptyArticles }: { articles: any[], serendiptyArticles: any[] }) {
  const [isSerendipityMode, setIsSerendipityMode] = useState(false);

  const displayArticles = isSerendipityMode ? serendiptyArticles : articles;

  if (displayArticles.length === 0) return null;

  return (
    <section className="py-24 bg-zinc-50 dark:bg-zinc-950 transition-colors duration-500 relative">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 md:mb-16 gap-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4 flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-primary" />
              Independent Voices
            </h2>
            <p className="text-xl text-muted-foreground">
              Discover the latest sovereign publications across the network.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-card border rounded-full px-4 py-2 shadow-sm">
              <label htmlFor="serendipity-toggle" className="text-sm font-semibold cursor-pointer select-none">
                Éclateur de bulle
              </label>
              <button 
                id="serendipity-toggle"
                onClick={() => setIsSerendipityMode(!isSerendipityMode)}
                className={`w-12 h-6 rounded-full p-1 transition-colors ${isSerendipityMode ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <motion.div 
                  className="w-4 h-4 bg-white rounded-full shadow-sm"
                  layout
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  animate={{ x: isSerendipityMode ? 24 : 0 }}
                />
              </button>
            </div>
          </div>
        </div>

        {isSerendipityMode && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-primary/10 text-primary border border-primary/20 rounded-xl flex items-start gap-3"
          >
            <FilterX className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold">Mode Hors-Piste Activé</p>
              <p className="text-sm opacity-90">L'algorithme injecte actuellement des articles hors de vos centres d'intérêts habituels pour stimuler votre esprit critique.</p>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
          <AnimatePresence mode="popLayout">
            {displayArticles.map((article) => {
              const authorHost = article.author.customDomain 
                ? article.author.customDomain
                : `${article.author.subdomain}.qoe.fi`;
              
              const protocol = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://' : 'https://';
              const localHost = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? `${article.author.subdomain}.localhost:3000` : authorHost;
              const articleUrl = `${protocol}${localHost}/article/${article.slug}`;

              return (
                <motion.a 
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  key={article.id} 
                  href={articleUrl}
                  target="_blank"
                  className="group flex flex-col h-full border border-border bg-card rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="p-6 md:p-8 flex-1 flex flex-col">
                    <div className="flex items-center gap-3 mb-6">
                      {article.author.logoUrl ? (
                        <img src={article.author.logoUrl} alt="" className="w-8 h-8 rounded-md object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase">
                          {article.author.name?.substring(0,2) || 'NA'}
                        </div>
                      )}
                      <span className="font-semibold text-sm">{article.author.name}</span>
                      
                      {article.author.isCertified && (
                        <span className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px]">✓</span>
                      )}

                      {article.category && (
                        <span className="ml-auto text-xs font-semibold px-2 py-1 bg-muted rounded-md text-muted-foreground">
                          {article.category.name}
                        </span>
                      )}
                    </div>
                    
                    <h3 className="text-2xl font-bold mb-4 leading-tight group-hover:text-primary transition-colors">
                      {article.title}
                    </h3>
                    
                    <p className="text-muted-foreground line-clamp-3 mb-6 flex-1">
                      {article.content.replace(/<[^>]*>?/gm, '').substring(0, 150)}...
                    </p>
                    
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground pt-4 border-t border-border mt-auto">
                      <time dateTime={article.createdAt.toISOString()}>
                        {new Date(article.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </time>
                      <span className="group-hover:text-primary transition-colors flex items-center gap-1">
                        Lire l'article <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </motion.a>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
