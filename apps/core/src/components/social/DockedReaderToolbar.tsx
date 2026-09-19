'use client';

import React from 'react';
import { Bookmark, BookMarked, Share2, Check, MoreHorizontal, Share } from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { TextToSpeechPlayer, ReadingSettingsSheet } from '@qoe/ui/reader';
import { Popover, PopoverContent, PopoverTrigger } from '@qoe/ui';
import { useReaderToolbar } from './ReaderToolbarContext';

export interface DockedReaderToolbarProps {
  articleTitle: string;
  className?: string;
}

export function DockedReaderToolbar({ articleTitle, className = '' }: DockedReaderToolbarProps) {
  const toolbar = useReaderToolbar();

  if (!toolbar) return null;

  const { bookmarked, toggleBookmark, copied, handleShare } = toolbar;

  return (
    <div className={cn('flex items-center gap-1.5 pointer-events-auto select-none', className)}>
      {/* 🖥️ DESKTOP : Exactement le même ordre et placement que la ligne d'auteur (Signet -> Partager -> Écouter -> Aa) */}
      <div className="hidden md:flex items-center gap-2">
        {/* 1. Signet */}
        <button
          type="button"
          onClick={toggleBookmark}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          title={bookmarked ? t`Supprimer des signets` : t`Mettre en signet`}
        >
          {bookmarked ? (
            <BookMarked className="w-4 h-4 fill-current text-primary" />
          ) : (
            <Bookmark className="w-4 h-4" />
          )}
        </button>

        {/* 2. Partager */}
        <button
          type="button"
          onClick={handleShare}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          title={copied ? t`Lien copié !` : t`Partager l'article`}
        >
          {copied ? <Check className="w-4 h-4 text-success" /> : <Share2 className="w-4 h-4" />}
        </button>

        {/* 3. Écouter (TTS) */}
        <TextToSpeechPlayer articleTitle={articleTitle} articleContentSelector="#article-content" />

        {/* 4. Typographie & Accessibilité */}
        <ReadingSettingsSheet />
      </div>

      {/* 📱 MOBILE (< md) : TTS direct + Menu 3 petits points Popover */}
      <div className="flex md:hidden items-center gap-1">
        {/* TTS direct compact */}
        <TextToSpeechPlayer articleTitle={articleTitle} articleContentSelector="#article-content" />

        {/* Menu 3 petits points pour les options supplémentaires */}
        <Popover>
          <PopoverTrigger
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground bg-background/80 hover:bg-muted border border-border/20 shadow-xs backdrop-blur-sm transition-all cursor-pointer"
            title={t`Plus d'options de lecture`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </PopoverTrigger>

          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-56 p-2 rounded-2xl bg-popover/95 backdrop-blur-xl border border-border/40 shadow-2xl space-y-1 text-xs"
          >
            <button
              type="button"
              onClick={toggleBookmark}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left font-medium text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
            >
              {bookmarked ? (
                <BookMarked className="w-4 h-4 fill-primary text-primary" />
              ) : (
                <Bookmark className="w-4 h-4 text-muted-foreground" />
              )}
              <span>{bookmarked ? t`Supprimer des signets` : t`Mettre en signet`}</span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left font-medium text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
            >
              {copied ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Share className="w-4 h-4 text-muted-foreground" />
              )}
              <span>{copied ? t`Lien copié !` : t`Partager l'article`}</span>
            </button>

            <div className="pt-1 border-t border-border/25">
              <ReadingSettingsSheet className="w-full justify-start h-9 px-2.5 text-xs bg-muted/40 hover:bg-muted/80 border-border/30" />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
