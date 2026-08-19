'use client';

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar, Clock, Share2, AlertCircle, Bookmark } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { sanitizeHtml } from '@/lib/sanitize';

export interface Article {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  isPremium?: boolean;
  slug?: string;
  author: {
    name?: string;
    logoUrl?: string | null;
  };
  category?: {
    name?: string;
  } | null;
}

interface ArticlePreviewModalProps {
  article: Article;
  onClose: () => void;
}

export const ArticlePreviewModal = ({ article, onClose }: ArticlePreviewModalProps) => {
  // Close on Escape press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-xl"
      />

      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', bounce: 0.1, duration: 0.5 }}
        className="relative w-full max-w-4xl h-[85vh] bg-card border border-border/60 rounded-[3rem] shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
      >
        {/* Header toolbar */}
        <div className="flex justify-between items-center px-8 py-6 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-[9px] font-sans font-bold uppercase tracking-wider rounded-full">
              {t`Mode Lecture Intégrale`}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label={t`Close modal`}
            className="p-2 hover:bg-muted rounded-full transition-all border border-border/50 text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Article Body Scroll Pane */}
        <div className="flex-1 overflow-y-auto p-8 md:p-16 custom-scrollbar space-y-12">
          {/* Editorial Hero */}
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <div className="flex items-center justify-center gap-6 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />{' '}
                {new Date(article.createdAt).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> {t`5 min read`}
              </span>
            </div>

            <h1 className="font-classical text-4xl md:text-5xl lg:text-6xl text-foreground leading-[1.1] tracking-tight">
              {article.title}
            </h1>

            <div className="flex items-center justify-center gap-3 pt-4">
              <div className="w-9 h-9 rounded-full bg-muted border border-border/60 flex items-center justify-center text-xs font-mono font-bold text-foreground">
                {article.author.name?.charAt(0)}
              </div>
              <div className="text-left">
                <span className="block text-xs font-semibold text-foreground">
                  {article.author.name}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {t`Média Certifié Souverain`}
                </span>
              </div>
            </div>
          </div>

          <div className="max-w-2xl mx-auto h-[1px] bg-border/40" />

          {/* Actual contents with modular layouts */}
          <div className="max-w-2xl mx-auto space-y-8 font-classical text-lg md:text-xl text-foreground/90 leading-relaxed">
            {/* HTML Content injection */}
            <div
              className="space-y-6 ProseMirror"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }}
            />

            {/* Premium Callout Block */}
            <div className="p-8 rounded-[2rem] bg-primary/5 border border-primary/20 flex gap-4 my-10 items-start">
              <AlertCircle className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
              <div className="font-sans text-sm space-y-2">
                <h4 className="font-bold text-primary">{t`Note de la rédaction`}</h4>
                <p className="text-muted-foreground leading-relaxed">
                  {t`Cet article est libre de toute influence corporative ou étatique. qoe.fi est entièrement financé par ses lecteurs, nous permettant de produire un travail intègre et indépendant.`}
                </p>
              </div>
            </div>

            <p className="opacity-60 italic text-base text-center pt-8">
              {t`Fin de la démonstration de l'article.`}
            </p>
          </div>
        </div>

        {/* Floating Actions Bar at bottom of modal */}
        <div className="px-8 py-5 border-t border-border/40 bg-card flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 border border-border/50 rounded-lg hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer">
              <Share2 className="w-3.5 h-3.5" /> {t`Partager`}
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-border/50 rounded-lg hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer">
              <Bookmark className="w-3.5 h-3.5" /> {t`Sauvegarder`}
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary text-white font-semibold text-xs rounded-lg hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            {t`S'abonner à l'auteur`}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
