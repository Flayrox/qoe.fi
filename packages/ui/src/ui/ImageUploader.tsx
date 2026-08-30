'use client';

/**
 * 🖼️ ImageUploader — Upload d'image natif avec éditeur intégré
 * =====================================================================
 * Remplace TOUT input URL d'image. Drag & drop + sélection, éditeur
 * (crop / zoom / rotation) via react-easy-crop, compression moderne
 * (browser-image-compression, Web Worker, sortie WebP quand supporté).
 *
 * Le composant est agnostique du backend : le consumer fournit `upload`,
 * qui appelle sa propre route d'upload et retourne l'URL finale (CDN).
 * =====================================================================
 */

import * as React from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import imageCompression from 'browser-image-compression';
import { ImagePlus, Loader2, RefreshCcw, Trash2, UploadCloud } from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';
import { Button } from './button';

const MAX_ZOOM = 4;

interface ImageUploaderProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  /** Fonction d'upload — retourne l'URL finale (CDN) */
  upload: (file: File) => Promise<string>;
  /** Ratio de crop (1 = carré, 16/9, 21/9…) ; undefined = libre */
  aspect?: number;
  /** Forme de la preview */
  shape?: 'circle' | 'rounded' | 'banner';
  /** Dimension max du côté le plus long en sortie (px) */
  maxDimension?: number;
  quality?: number;
  label?: string;
  className?: string;
}

function getRadianAngle(degreeValue: number): number {
  return (degreeValue * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad)) * width + Math.abs(Math.sin(rotRad)) * height,
    height: Math.abs(Math.sin(rotRad)) * width + Math.abs(Math.cos(rotRad)) * height,
  };
}

async function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    image.src = url;
  });
}

async function cropAndRotate(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number,
  maxDimension: number
): Promise<HTMLCanvasElement> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  const rotRad = getRadianAngle(rotation);
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) throw new Error('Canvas not supported');

  const scale = Math.min(1, maxDimension / Math.max(pixelCrop.width, pixelCrop.height));
  croppedCanvas.width = Math.max(1, Math.round(pixelCrop.width * scale));
  croppedCanvas.height = Math.max(1, Math.round(pixelCrop.height * scale));

  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    croppedCanvas.width,
    croppedCanvas.height
  );

  return croppedCanvas;
}

function isWebpSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

function canvasToFile(canvas: HTMLCanvasElement, baseName: string, quality: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const mimeType = isWebpSupported() ? 'image/webp' : 'image/jpeg';
    const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(t`Échec de l’encodage de l’image`));
          return;
        }
        resolve(new File([blob], `${baseName}.${ext}`, { type: mimeType }));
      },
      mimeType,
      quality
    );
  });
}

export function ImageUploader({
  value,
  onChange,
  upload,
  aspect,
  shape = 'rounded',
  maxDimension = 1400,
  quality = 0.85,
  label,
  className,
}: ImageUploaderProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isEditorOpen, setIsEditorOpen] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);

  const resetEditor = React.useCallback(() => {
    setIsEditorOpen(false);
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
  }, []);

  const handleFile = React.useCallback(
    async (file: File) => {
      setError(null);
      if (!file.type.startsWith('image/')) {
        setError(t`Le fichier doit être une image.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(t`L’image ne doit pas dépasser 10 Mo.`);
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      if (file.type === 'image/gif') {
        // Pas d'éditeur pour les GIFs animés : upload direct
        await performUpload(file);
        return;
      }
      setImageSrc(objectUrl);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setIsEditorOpen(true);
    },
    [upload, onChange]
  );

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
    [upload, onChange]
  );

  const handleApply = React.useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    try {
      const croppedCanvas = await cropAndRotate(
        imageSrc,
        croppedAreaPixels,
        rotation,
        maxDimension
      );
      const baseName = `image-${Date.now()}`;
      const rawFile = await canvasToFile(croppedCanvas, baseName, quality);
      // Pass moderne de compression (Web Worker)
      const compressed = await imageCompression(rawFile, {
        maxWidthOrHeight: maxDimension,
        initialQuality: quality,
        useWebWorker: true,
        fileType: isWebpSupported() ? 'image/webp' : 'image/jpeg',
      });
      resetEditor();
      await performUpload(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Impossible de traiter l’image.`);
      resetEditor();
    }
  }, [imageSrc, croppedAreaPixels, rotation, maxDimension, quality, resetEditor, performUpload]);

  const onCropComplete = React.useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleRemove = React.useCallback(() => {
    onChange(null);
  }, [onChange]);

  const previewClass =
    shape === 'circle'
      ? 'size-24 rounded-full'
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
              size="sm"
              onClick={handleRemove}
              className="text-xs text-destructive hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t`Supprimer`}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
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

      {error && <p className="text-xs text-destructive">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      <Dialog open={isEditorOpen} onOpenChange={(open) => !open && resetEditor()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t`Éditer l'image`}</DialogTitle>
            <DialogDescription>{t`Recadrez, zoomez et faites pivoter votre image.`}</DialogDescription>
          </DialogHeader>

          <div className="relative h-72 w-full overflow-hidden rounded-xl bg-black/40">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={aspect}
                minZoom={1}
                maxZoom={MAX_ZOOM}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={onCropComplete}
                showGrid
                style={{
                  containerStyle: { background: 'rgba(0,0,0,0.55)' },
                }}
              />
            )}
          </div>

          <div className="space-y-3 pt-1">
            <label className="flex items-center gap-3 text-xs text-muted-foreground">
              <ImagePlus className="w-3.5 h-3.5 shrink-0" />
              {t`Zoom`}
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </label>
            <label className="flex items-center gap-3 text-xs text-muted-foreground">
              <RefreshCcw className="w-3.5 h-3.5 shrink-0" />
              {t`Rotation`}
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={resetEditor}>
              {t`Annuler`}
            </Button>
            <Button type="button" size="sm" onClick={handleApply}>
              {t`Appliquer`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
