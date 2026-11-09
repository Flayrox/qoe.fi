'use client';

/**
 * 🖼️ ImageUploader — sélection, cadrage puis upload
 * =====================================================================
 * Le geste d'import reste ici (drag & drop, validation, upload), mais
 * l'édition est déléguée à `ImageEditorDialog`. Tous les logos, bannières
 * et avatars qui passent par ce composant bénéficient donc du même
 * cadrage, du même zoom et des mêmes dimensions de sortie.
 *
 * 📖 Un GIF animé court-circuite l'éditeur : le recadrer en canvas
 *    détruirait l'animation. Il part directement à l'upload.
 * =====================================================================
 */

import * as React from 'react';
import { Loader2, RefreshCcw, Trash2, UploadCloud } from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { Button } from '../primitives/button/button';
import {
  ImageEditorDialog,
  type ImageEditorPreset,
  type ImageEditorResult,
} from './ImageEditorDialog';

interface ImageUploaderProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  /** Fonction d'upload — retourne l'URL finale (CDN). */
  upload: (file: File) => Promise<string>;
  /** Ratio de crop (1 = carré, 16/9, 21/9…). Défaut 16/9. */
  aspect?: number;
  /** Forme de la preview. */
  shape?: 'circle' | 'rounded' | 'banner' | 'square';
  /**
   * Dimension maximale du côté le plus long, quand `outputWidth` /
   * `outputHeight` ne sont pas fournis.
   */
  maxDimension?: number;
  /** Largeur exacte du fichier produit. Prioritaire sur `maxDimension`. */
  outputWidth?: number;
  /** Hauteur exacte du fichier produit. Prioritaire sur `maxDimension`. */
  outputHeight?: number;
  quality?: number;
  label?: string;
  className?: string;
}

function buildPreset({
  aspect,
  shape,
  maxDimension,
  outputWidth,
  outputHeight,
  label,
}: {
  aspect: number;
  shape: NonNullable<ImageUploaderProps['shape']>;
  maxDimension: number;
  outputWidth?: number;
  outputHeight?: number;
  label: string;
}): ImageEditorPreset {
  const safeAspect = aspect > 0 ? aspect : 16 / 9;
  const hasExactSize = Boolean(outputWidth && outputHeight);
  const width = hasExactSize
    ? (outputWidth as number)
    : safeAspect >= 1
      ? maxDimension
      : Math.round(maxDimension * safeAspect);
  const height = hasExactSize
    ? (outputHeight as number)
    : safeAspect >= 1
      ? Math.round(maxDimension / safeAspect)
      : maxDimension;

  return {
    id: 'image',
    label,
    aspect: hasExactSize ? width / height : safeAspect,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    shape: shape === 'circle' ? 'circle' : 'rect',
  };
}

export function ImageUploader({
  value,
  onChange,
  upload,
  aspect = 16 / 9,
  shape = 'rounded',
  maxDimension = 1400,
  outputWidth,
  outputHeight,
  quality = 0.9,
  label,
  className,
}: ImageUploaderProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isEditorOpen, setIsEditorOpen] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);

  const preset = React.useMemo(
    () =>
      buildPreset({
        aspect,
        shape,
        maxDimension,
        outputWidth,
        outputHeight,
        label: shape === 'circle' ? t`Logo` : shape === 'banner' ? t`Bannière` : t`Image`,
      }),
    [aspect, maxDimension, outputHeight, outputWidth, shape]
  );

  const resetEditor = React.useCallback(() => {
    setIsEditorOpen(false);
    setPendingFile(null);
    setImageSrc((current) => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
      return null;
    });
  }, []);

  const performUpload = React.useCallback(
    async (file: File) => {
      try {
        setIsUploading(true);
        setError(null);
        const url = await upload(file);
        onChange(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : t`Échec de l’upload de l’image.`);
      } finally {
        setIsUploading(false);
      }
    },
    [onChange, upload]
  );

  const handleFile = React.useCallback(
    (file: File) => {
      setError(null);
      if (!file.type.startsWith('image/')) {
        setError(t`Le fichier doit être une image.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(t`L’image ne doit pas dépasser 10 Mo.`);
        return;
      }

      if (file.type === 'image/gif') {
        // Pas d'éditeur pour les GIFs animés : upload direct.
        void performUpload(file);
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      setPendingFile(file);
      setImageSrc((current) => {
        if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
        return objectUrl;
      });
      setIsEditorOpen(true);
    },
    [performUpload]
  );

  const handleApply = React.useCallback(
    async ({ file }: ImageEditorResult) => {
      resetEditor();
      await performUpload(file);
    },
    [performUpload, resetEditor]
  );

  const handleDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const previewClass =
    shape === 'circle'
      ? 'size-24 rounded-full'
      : shape === 'square'
        ? 'size-24 rounded-lg'
        : shape === 'banner'
          ? 'w-full h-28 rounded-lg'
          : 'w-full h-24 rounded-lg';

  return (
    <div className={cn('space-y-2', className)}>
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}

      {value ? (
        <div className="flex items-center gap-3">
          <img
            src={value}
            alt={t`Aperçu de l'image`}
            className={cn(previewClass, 'object-cover border border-border/40 bg-muted/30')}
          />
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-xs"
            >
              {isUploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="w-3.5 h-3.5" />
              )}
              {t`Remplacer`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              tone="danger"
              size="sm"
              onClick={() => onChange(null)}
            >
              <Trash2 />
              {t`Supprimer`}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          disabled={isUploading}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors cursor-pointer',
            shape === 'banner' ? 'w-full h-28' : shape === 'circle' ? 'size-24' : 'w-full h-24',
            isDragging
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-muted/20',
            isUploading && 'opacity-60 pointer-events-none'
          )}
        >
          {isUploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <UploadCloud className="w-5 h-5" strokeWidth={1.5} />
          )}
          <span className="text-[11px] font-medium">
            {isUploading ? t`Upload…` : t`Glisser ou cliquer pour ajouter`}
          </span>
        </button>
      )}

      {error && <p className="text-xs text-destructive-text">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
          event.target.value = '';
        }}
      />

      <ImageEditorDialog
        open={isEditorOpen && Boolean(imageSrc)}
        onOpenChange={(open) => {
          if (!open) resetEditor();
        }}
        src={imageSrc}
        fileName={pendingFile?.name}
        presets={[preset]}
        initialPresetId={preset.id}
        quality={quality}
        onApply={handleApply}
      />
    </div>
  );
}
