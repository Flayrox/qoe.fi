'use client';

import React from 'react';
import NextImage from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Crop as CropIcon, RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import type { ComposerImage } from './types';

interface ImageAttachmentsGridProps {
  images: ComposerImage[];
  onMove: (index: number, direction: 'left' | 'right') => void;
  onUpdateAlt: (id: string, altText: string) => void;
  onCrop: (image: ComposerImage) => void;
  onReplaceClick: (id: string) => void;
  onRemove: (id: string) => void;
}

export function ImageAttachmentsGrid({
  images,
  onMove,
  onUpdateAlt,
  onCrop,
  onReplaceClick,
  onRemove,
}: ImageAttachmentsGridProps) {
  if (images.length === 0) return null;

  return (
    <div className={cn('grid gap-2', images.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
      <AnimatePresence initial={false}>
        {images.map((img, idx) => (
          <motion.div
            key={img.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative aspect-video bg-muted/40 border border-border/40 group overflow-hidden rounded-xl"
          >
            <NextImage
              src={img.url}
              className={cn(
                'w-full h-full object-cover transition-all duration-500',
                img.isUploading ? 'blur-md scale-95' : 'blur-0 scale-100'
              )}
              alt=""
              sizes="(max-width: 768px) 100vw, 640px"
            />

            <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2.5 z-10">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1">
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => onMove(idx, 'left')}
                      className="bg-black/60 hover:bg-black/85 text-white p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                      title={t`Déplacer vers la gauche`}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {idx < images.length - 1 && (
                    <button
                      type="button"
                      onClick={() => onMove(idx, 'right')}
                      className="bg-black/60 hover:bg-black/85 text-white p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                      title={t`Déplacer vers la droite`}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const newAlt = prompt(
                        "Saisissez la description Alt-Text d'accessibilité pour cette image :",
                        img.altText || ''
                      );
                      if (newAlt !== null) {
                        onUpdateAlt(img.id, newAlt.trim());
                      }
                    }}
                    className={cn(
                      'px-2 py-1 rounded-[var(--radius-button)] text-[11px] font-bold cursor-pointer transition-colors border',
                      img.altText
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-black/60 hover:bg-black/85 text-white border-white/20'
                    )}
                    title={
                      img.altText ? `Alt-text: ${img.altText}` : t`Ajouter un texte d'accessibilité`
                    }
                  >
                    ALT
                  </button>
                  <button
                    type="button"
                    onClick={() => onCrop(img)}
                    className="bg-black/60 hover:bg-black/85 text-white p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                    title="Recadrer l'image"
                  >
                    <CropIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onReplaceClick(img.id)}
                    className="bg-black/60 hover:bg-black/85 text-white p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                    title="Remplacer l'image"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => onRemove(img.id)}
                  className="bg-destructive/80 hover:bg-destructive text-background p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                  title="Supprimer l'image"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
