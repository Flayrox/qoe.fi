'use client';

import React, { useRef, useState } from 'react';
import { ImageIcon, ImageOff, Images, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import {
  ImageEditorDialog,
  type ImageEditorPreset,
  type ImageEditorResult,
} from '@qoe/ui/ui/ImageEditorDialog';
import { MediaAssetPickerDialog } from './MediaAssetPickerDialog';
import { CheckboxInput } from '@qoe/ui/checkbox';

export interface CoverUploaderProps {
  imageUrl: string | null;
  title: string;
  /** Description alternative de la couverture (B4). */
  coverAlt?: string;
  /** Couverture décorative : le reader pose alt="" sans repli sur le titre. */
  coverDecorative?: boolean;
  onCoverAltChange?: (value: string) => void;
  onCoverDecorativeChange?: (value: boolean) => void;
  isUploading: boolean;
  onUpload: (file: File) => void;
  /** Choisit une image existante de la médiathèque (sans upload). */
  onSelectImage?: (url: string) => void;
  onRemove: () => void;
}

export function CoverUploader({
  imageUrl,
  title,
  coverAlt = '',
  coverDecorative = false,
  onCoverAltChange,
  onCoverDecorativeChange,
  isUploading,
  onUpload,
  onSelectImage,
  onRemove,
}: CoverUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; src: string } | null>(null);

  const coverPreset: ImageEditorPreset = {
    id: 'cover',
    label: t`Couverture`,
    aspect: 21 / 9,
    width: 1600,
    height: 686,
    shape: 'rect',
  };

  const closeEditor = () => {
    setPendingImage((current) => {
      if (current) URL.revokeObjectURL(current.src);
      return null;
    });
  };

  const handleFiles = (file: File | undefined) => {
    if (!file) return;
    const src = URL.createObjectURL(file);
    setPendingImage((current) => {
      if (current) URL.revokeObjectURL(current.src);
      return { file, src };
    });
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleApply = ({ file }: ImageEditorResult) => {
    closeEditor();
    onUpload(file);
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
      <Input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal "
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
          {/* eslint-disable-next-line @next/next/no-img-element -- URL utilisateur distante arbitraire, non déclarable dans next.config. */}
          <img
            src={imageUrl}
            alt={coverDecorative ? '' : coverAlt.trim() || title || t`Couverture de l'article`}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.01]"
          />

          {isDragOver && (
            <div className="absolute inset-0 bg-primary/25 backdrop-blur-xs flex items-center justify-center font-sans text-xs font-bold text-foreground">
              {t`Déposez l'image pour remplacer la couverture`}
            </div>
          )}

          <div className="absolute inset-0 bg-background/30 backdrop-blur-[2px] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="soft"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="rounded-xl border border-border/40 bg-background/90 px-3.5 py-1.5 shadow-lg backdrop-blur-md h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
            >
              <ImageIcon className="w-3.5! h-3.5! text-primary" />
              <span>{t`Changer l'image`}</span>
            </Button>
            {onSelectImage ? (
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={() => setShowLibrary(true)}
                disabled={isUploading}
                className="rounded-xl border border-border/40 bg-background/90 px-3.5 py-1.5 shadow-lg backdrop-blur-md h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
              >
                <Images className="h-3.5! w-3.5! text-primary" />
                <span>{t`Médiathèque`}</span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="soft"
              tone="danger"
              size="sm"
              onClick={onRemove}
              className="rounded-xl border border-destructive/30 bg-background/90 px-3.5 py-1.5 shadow-lg backdrop-blur-md h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
            >
              <Trash2 className="w-3.5! h-3.5!" />
              <span>{t`Supprimer`}</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div {...dropProps} className="inline-block max-w-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className={cn(
                'max-w-full rounded-xl border-dashed px-3.5 py-2 text-left shadow-2xs h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! ',
                isDragOver
                  ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                  : 'border-border/60 bg-muted/10 text-muted-foreground hover:border-primary/50 hover:bg-muted/30 hover:text-foreground h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block '
              )}
            >
              {isUploading ? (
                <Loader2 className="w-3.5! h-3.5! shrink-0 animate-spin text-primary" />
              ) : (
                <ImageIcon className="w-3.5! h-3.5! shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              )}
              <span className="min-w-0">
                {isDragOver
                  ? t`Déposez votre image ici`
                  : t`+ Ajouter une image de couverture (ou glisser-déposer)`}
              </span>
            </Button>
          </div>
          {onSelectImage ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowLibrary(true)}
              disabled={isUploading}
            >
              <Images className="h-3.5 w-3.5 text-primary" />
              {t`Choisir dans la médiathèque`}
            </Button>
          ) : null}
        </div>
      )}

      {imageUrl && onCoverAltChange && onCoverDecorativeChange ? (
        <div className="space-y-2 rounded-xl border border-border/50 bg-muted/10 p-3">
          <label htmlFor="cover-alt" className="block space-y-1">
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              {t`Description de la couverture (alt)`}
            </span>
            <Input
              className=" h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
              id="cover-alt"
              type="text"
              size="sm"
              value={coverDecorative ? '' : coverAlt}
              disabled={coverDecorative}
              onChange={(event) => onCoverAltChange(event.target.value)}
              placeholder={
                coverDecorative
                  ? t`Couverture décorative : aucune description nécessaire`
                  : t`Décrivez la couverture pour les lecteurs d'écran`
              }
            />
          </label>
          {!coverDecorative && !coverAlt.trim() ? (
            <p className="flex items-center gap-1 text-[10px] font-medium text-highlight">
              <ImageOff className="size-3 shrink-0" aria-hidden="true" />
              {t`Alt manquant : le titre sera utilisé comme repli.`}
            </p>
          ) : null}
          <label className="flex cursor-pointer items-start gap-2 text-[11px] text-muted-foreground">
            <CheckboxInput
              checked={coverDecorative}
              onChange={(event) => onCoverDecorativeChange(event.target.checked)}
              className="mt-0.5 size-3.5! rounded border-border accent-primary [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
            />
            <span>
              {t`Image purement décorative`}
              <span className="block text-[10px] text-muted-foreground/70">
                {t`Le reader ne l'annoncera pas aux lecteurs d'écran (alt vide).`}
              </span>
            </span>
          </label>
        </div>
      ) : null}

      <MediaAssetPickerDialog
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        onSelect={(asset) => onSelectImage?.(asset.url)}
        title={t`Choisir une couverture`}
      />

      <ImageEditorDialog
        open={Boolean(pendingImage)}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        src={pendingImage?.src ?? null}
        fileName={pendingImage?.file.name}
        presets={[coverPreset]}
        initialPresetId={coverPreset.id}
        title={t`Recadrer la couverture`}
        description={t`Ajustez le cadrage au format 21:9 avant de remplacer l’image.`}
        onApply={handleApply}
      />
    </div>
  );
}
