'use client';

import React from 'react';
import { X, Calendar, Clock, Share2, AlertCircle, Bookmark } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { sanitizeHtml } from '@/lib/sanitize';
import { SafeAvatar } from '@qoe/ui';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@qoe/ui/dialog';

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
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="xl"
    >
      <DialogContent
        aria-label={article.title}
        showCloseButton={false}
        className="w-full sm:max-w-4xl h-[85vh] bg-card border border-border/60 sm:rounded-[3rem] shadow-2xl flex flex-col gap-0 p-0 sm:p-0 overflow-hidden"
      >
        {/* Header toolbar */}
        <div className="flex justify-between items-center px-8 py-6 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-3">
            <Badge variant="outline" tone="brand" shape="pill" size="sm">
              {t`Mode Lecture Intégrale`}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            shape="icon"
            onClick={onClose}
            aria-label={t`Close modal`}
            className="rounded-full"
          >
            <X />
          </Button>
        </div>

        {/* Article Body Scroll Pane */}
        <DialogBody className="flex-1 overflow-y-auto p-8 md:p-16 custom-scrollbar space-y-12">
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
              <SafeAvatar
                src={article.author.logoUrl}
                name={article.author.name}
                size={36}
                shape="circle"
              />
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
              <AlertCircle className="w-6 h-6 text-primary shrink-0 mt-1" />
              <div className="font-sans text-sm space-y-2">
                <h4 className="font-bold text-primary">{t`Note de la rédaction`}</h4>
                <p className="text-muted-foreground leading-relaxed">
                  {t`Cet article est libre de toute influence corporative ou étatique. qoefi est entièrement financé par ses lecteurs, nous permettant de produire un travail intègre et indépendant.`}
                </p>
              </div>
            </div>

            <p className="opacity-60 italic text-base text-center pt-8">
              {t`Fin de la démonstration de l'article.`}
            </p>
          </div>
        </DialogBody>

        {/* Floating Actions Bar at bottom of modal */}
        <DialogFooter className="px-8 py-5 border-t border-border/40 bg-card flex sm:flex-row items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">
              <Share2 /> {t`Partager`}
            </Button>
            <Button variant="outline" size="sm">
              <Bookmark /> {t`Sauvegarder`}
            </Button>
          </div>

          <Button variant="solid" tone="brand" size="sm" onClick={onClose}>
            {t`S'abonner à l'auteur`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
