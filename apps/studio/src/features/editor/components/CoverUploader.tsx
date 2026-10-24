'use client';

import React, { useRef, useState } from 'react';
import { ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';

export interface CoverUploaderProps {
  imageUrl: string | null;
  title: string;
  isUploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

export function CoverUploader({
  imageUrl,
  title,
  isUploading,
  onUpload,
  onRemove,
}: CoverUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = (file: File | undefined) => {
    if (!file) return;
    onUpload(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  const dropProps = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(true);
    },
    onDragLeave: (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);
      handleFiles(event.dataTransfer.files?.[0]);
    },
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={t`Choisir la couverture de l'article`}
        onChange={(event) => handleFiles(event.target.files?.[0])}
      />

      {imageUrl ? (
        <div
          {...dropProps}
          className={cn(
            'group relative w-full aspect-[21/9] sm:aspect-[16/7] overflow-hidden rounded-2xl border bg-muted/20 shadow-sm transition-all',
            isDragOver ? 'border-primary ring-2 ring-primary/40 scale-[1.005]' : 'border-border/50'
          )}
        >
          {/* `next/image` exigerait de lister le domaine Supabase Storage dans
              `images.remotePatterns` et de connaître les dimensions exactes :
              pour une couverture dont l'auteur vient de choisir le fichier,
              une balise native (déjà chargée depuis le blob local) est le bon
              outil. Le LCP de l'éditeur n'est pas en jeu. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={title || t`Couverture de l'article`}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.01]"
          />

          {isDragOver && (
            <div className="absolute inset-0 bg-primary/25 backdrop-blur-xs flex items-center justify-center font-sans text-xs font-bold text-foreground">
              {t`Déposez l'image pour remplacer la couverture`}
            </div>
          )}

          <div className="absolute inset-0 bg-background/30 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="px-3.5 py-1.5 rounded-xl bg-background/90 text-foreground font-sans text-xs font-semibold shadow-lg hover:bg-background transition-all flex items-center gap-1.5 cursor-pointer backdrop-blur-md border border-border/40"
            >
              <ImageIcon className="w-3.5 h-3.5 text-primary" />
              <span>{t`Changer l'image`}</span>
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="px-3.5 py-1.5 rounded-xl bg-background/90 text-destructive font-sans text-xs font-semibold shadow-lg hover:bg-destructive/10 hover:text-destructive transition-all flex items-center gap-1.5 cursor-pointer backdrop-blur-md border border-destructive/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t`Supprimer`}</span>
            </button>
          </div>
        </div>
      ) : (
        <div {...dropProps} className="inline-block">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className={cn(
              'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-dashed text-xs font-medium transition-all cursor-pointer shadow-2xs group',
              isDragOver
                ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                : 'border-border/60 hover:border-primary/50 bg-muted/10 hover:bg-muted/30 text-muted-foreground hover:text-foreground'
            )}
          >
            {isUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            )}
            <span>
              {isDragOver
                ? t`Déposez votre image ici`
                : t`+ Ajouter une image de couverture (ou glisser-déposer)`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
