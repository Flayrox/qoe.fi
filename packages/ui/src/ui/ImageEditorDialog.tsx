'use client';

/**
 * 🖼️ ImageEditorDialog — le modal d'édition d'image partagé
 * =====================================================================
 * Un seul geste pour tous les formats : logo, bannière, couverture,
 * image d'article. Le cadrage est verrouillé sur le preset choisi, le
 * zoom et la rotation restent libres, et le fichier produit fait
 * exactement `preset.width × preset.height`.
 *
 * 📖 Pourquoi un composant séparé de `ImageUploader` : le modal ne sait
 *    rien de l'upload. Il rend un `File`, l'appelant décide où l'envoyer.
 *    Le UI Lab peut ainsi le monter sans réseau, et les flux qui n'ont
 *    pas encore de bouton d'upload peuvent le réutiliser tel quel.
 *
 * 🎯 Le rendu passe par un canvas : le fichier source n'est jamais
 *    modifié, l'EXIF est perdu (le serveur le strippe déjà), et la sortie
 *    est en WebP (ou PNG si le navigateur ne sait pas l'encoder).
 * =====================================================================
 */

import * as React from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import {
  Check,
  Circle,
  Crop,
  Image as ImageIcon,
  Loader2,
  RectangleHorizontal,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../primitives/dialog/dialog';
import { Button } from '../primitives/button/button';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const PREVIEW_MAX_WIDTH = 360;

export type ImageEditorShape = 'rect' | 'circle';

export interface ImageEditorPreset {
  id: string;
  label: string;
  /** Ratio largeur / hauteur. Le cadrage est verrouillé dessus. */
  aspect: number;
  /** Largeur exacte du fichier produit, en pixels. */
  width: number;
  /** Hauteur exacte du fichier produit, en pixels. */
  height: number;
  /** Forme de l'aperçu ; la sortie reste un rectangle. */
  shape?: ImageEditorShape;
  /** Petite précision affichée dans la carte de format. */
  hint?: string;
}

export interface ImageEditorResult {
  file: File;
  width: number;
  height: number;
}

export interface ImageEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** URL blob ou publique déjà chargée par l'appelant. */
  src: string | null;
  fileName?: string | null;
  presets: ImageEditorPreset[];
  initialPresetId?: string;
  title?: string;
  description?: string;
  quality?: number;
  onApply: (result: ImageEditorResult) => void | Promise<void>;
}

const FALLBACK_PRESET: ImageEditorPreset = {
  id: 'image',
  label: 'Image',
  aspect: 16 / 9,
  width: 1600,
  height: 900,
};

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error(t`Impossible de lire l’image.`)));
    image.src = src;
  });
}

function isWebpSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(t`Impossible d’encoder l’image.`));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

/**
 * Dessine l'image tournée dans un canvas, puis découpe la zone choisie
 * vers les dimensions exactes du preset. Le canvas de rotation évite de
 * dupliquer la géométrie de `react-easy-crop` dans le rendu final.
 */
async function renderCrop(
  src: string,
  area: Area,
  rotation: number,
  width: number,
  height: number
): Promise<HTMLCanvasElement> {
  const image = await loadImage(src);

  let source: CanvasImageSource = image;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (rotation % 360 !== 0) {
    const rotated = document.createElement('canvas');
    const rotatedContext = rotated.getContext('2d');
    if (!rotatedContext) throw new Error(t`Canvas indisponible.`);

    const bounds = rotateSize(sourceWidth, sourceHeight, rotation);
    rotated.width = Math.max(1, Math.ceil(bounds.width));
    rotated.height = Math.max(1, Math.ceil(bounds.height));

    rotatedContext.translate(rotated.width / 2, rotated.height / 2);
    rotatedContext.rotate(getRadianAngle(rotation));
    rotatedContext.translate(-sourceWidth / 2, -sourceHeight / 2);
    rotatedContext.drawImage(image, 0, 0);

    source = rotated;
    sourceWidth = rotated.width;
    sourceHeight = rotated.height;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));

  const context = canvas.getContext('2d');
  if (!context) throw new Error(t`Canvas indisponible.`);

  const sourceX = Math.max(0, Math.min(area.x, sourceWidth - 1));
  const sourceY = Math.max(0, Math.min(area.y, sourceHeight - 1));
  const cropWidth = Math.max(1, Math.min(area.width, sourceWidth - sourceX));
  const cropHeight = Math.max(1, Math.min(area.height, sourceHeight - sourceY));

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas;
}

function baseName(fileName: string | null | undefined): string {
  const withoutExtension = (fileName || 'image').replace(/\.[^.]+$/, '');
  return (
    withoutExtension
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'image'
  );
}

function formatAspect(aspect: number): string {
  const common: Array<[number, string]> = [
    [1, '1:1'],
    [16 / 9, '16:9'],
    [21 / 9, '21:9'],
    [4 / 3, '4:3'],
    [4 / 5, '4:5'],
    [16 / 10, '16:10'],
    [3 / 2, '3:2'],
    [2, '2:1'],
    [4, '4:1'],
  ];
  const known = common.find(([ratio]) => Math.abs(ratio - aspect) < 0.001);
  return known?.[1] ?? `${Math.round(aspect * 100) / 100}:1`;
}

export function ImageEditorDialog({
  open,
  onOpenChange,
  src,
  fileName,
  presets,
  initialPresetId,
  title,
  description,
  quality = 0.9,
  onApply,
}: ImageEditorDialogProps) {
  const safePresets = presets.length > 0 ? presets : [FALLBACK_PRESET];
  const resolvedInitialPresetId =
    initialPresetId && safePresets.some((preset) => preset.id === initialPresetId)
      ? initialPresetId
      : safePresets[0].id;
  const [presetId, setPresetId] = React.useState(resolvedInitialPresetId);
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [isReady, setIsReady] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const activePreset = safePresets.find((preset) => preset.id === presetId) ?? safePresets[0];

  // Chaque nouvelle source ou chaque ouverture repart d'un cadrage propre.
  // `presetKey` évite de réinitialiser sur un tableau recréé à chaque render.
  React.useEffect(() => {
    if (!open) return;
    setPresetId(resolvedInitialPresetId);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    setPreviewUrl(null);
    setIsReady(false);
    setError(null);
  }, [open, src, resolvedInitialPresetId]);

  // Aperçu réel du rendu final : on réutilise le même chemin canvas que
  // l'export, à une taille réduite, pour ne pas promettre autre chose.
  React.useEffect(() => {
    if (!open || !src || !croppedAreaPixels) {
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const previewHeight = Math.max(
        1,
        Math.round(PREVIEW_MAX_WIDTH / Math.max(activePreset.aspect, 0.01))
      );
      void renderCrop(src, croppedAreaPixels, rotation, PREVIEW_MAX_WIDTH, previewHeight)
        .then((canvas) => {
          if (!cancelled) setPreviewUrl(canvas.toDataURL('image/webp', 0.72));
        })
        .catch(() => {
          if (!cancelled) setPreviewUrl(null);
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, src, croppedAreaPixels, rotation, activePreset.aspect]);

  const resetCrop = React.useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    setPreviewUrl(null);
    setError(null);
  }, []);

  const selectPreset = React.useCallback((next: ImageEditorPreset) => {
    setPresetId(next.id);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setPreviewUrl(null);
    setError(null);
  }, []);

  const handleApply = React.useCallback(async () => {
    if (!src || !croppedAreaPixels || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    try {
      const mimeType = isWebpSupported() ? 'image/webp' : 'image/png';
      const extension = mimeType === 'image/webp' ? 'webp' : 'png';
      const canvas = await renderCrop(
        src,
        croppedAreaPixels,
        rotation,
        activePreset.width,
        activePreset.height
      );
      const blob = await canvasToBlob(canvas, mimeType, quality);
      const file = new File([blob], `${baseName(fileName)}-${activePreset.id}.${extension}`, {
        type: mimeType,
      });
      await onApply({
        file,
        width: activePreset.width,
        height: activePreset.height,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Impossible de préparer cette image.`);
    } finally {
      setIsProcessing(false);
    }
  }, [
    activePreset.height,
    activePreset.id,
    activePreset.width,
    croppedAreaPixels,
    fileName,
    isProcessing,
    onApply,
    quality,
    rotation,
    src,
  ]);

  const adjustZoom = (delta: number) => {
    setZoom((current) =>
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((current + delta) * 100) / 100))
    );
  };

  const handleStageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 24 : 8;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setCrop((current) => ({ ...current, x: current.x - step }));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setCrop((current) => ({ ...current, x: current.x + step }));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCrop((current) => ({ ...current, y: current.y - step }));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCrop((current) => ({ ...current, y: current.y + step }));
    }
  };

  const previewShape =
    activePreset.shape === 'circle'
      ? 'rounded-full'
      : activePreset.aspect > 2
        ? 'rounded-xl'
        : 'rounded-lg';

  return (
    <Dialog open={open} onOpenChange={onOpenChange} isDismissable={!isProcessing}>
      <DialogContent className="max-sm:p-0 gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border/50 px-5 pt-5 pb-4 pr-14 sm:px-6">
          <DialogTitle>{title ?? t`Éditer l’image`}</DialogTitle>
          <DialogDescription>
            {description ??
              t`Choisissez le format, ajustez le cadrage, puis vérifiez l’aperçu avant d’envoyer.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 p-4 sm:p-6">
            <div
              className="relative w-full overflow-hidden rounded-xl bg-muted/50"
              style={{
                aspectRatio: activePreset.aspect,
                maxHeight: 'min(48vh, 440px)',
              }}
              tabIndex={0}
              role="group"
              aria-label={t`Zone de recadrage. Utilisez les flèches pour déplacer l’image.`}
              onKeyDown={handleStageKeyDown}
            >
              {src ? (
                <Cropper
                  image={src}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={activePreset.aspect}
                  minZoom={MIN_ZOOM}
                  maxZoom={MAX_ZOOM}
                  zoomWithScroll={false}
                  showGrid
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onRotationChange={setRotation}
                  onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
                  onMediaLoaded={() => setIsReady(true)}
                  style={{ containerStyle: { background: 'transparent' } }}
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="size-6" strokeWidth={1.5} />
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Crop className="size-3.5" strokeWidth={1.75} />
                {t`Glissez l’image pour la repositionner`}
              </span>
              <span className="font-mono text-[10px] tabular-nums">
                {activePreset.width} × {activePreset.height} px
              </span>
            </div>
          </div>

          <aside className="min-w-0 border-t border-border/50 p-4 sm:p-5 lg:border-t-0 lg:border-l">
            <div className="space-y-5">
              <section>
                <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  {t`Format`}
                </p>
                <div className="mt-2 grid gap-1.5">
                  {safePresets.map((preset) => {
                    const selected = preset.id === activePreset.id;
                    const Icon = preset.shape === 'circle' ? Circle : RectangleHorizontal;
                    return (
                      <Button
                        key={preset.id}
                        type="button"
                        variant={selected ? 'soft' : 'ghost'}
                        tone={selected ? 'brand' : 'neutral'}
                        size="sm"
                        className={cn(
                          'h-auto justify-start gap-2 px-2.5 py-2 text-left',
                          selected && 'ring-1 ring-primary/20'
                        )}
                        aria-pressed={selected}
                        onClick={() => selectPreset(preset)}
                      >
                        <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">{preset.label}</span>
                          <span className="block font-mono text-[10px] font-normal text-muted-foreground">
                            {formatAspect(preset.aspect)} · {preset.width} × {preset.height}
                          </span>
                        </span>
                        {selected && <Check className="size-3.5 shrink-0" strokeWidth={2} />}
                      </Button>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                    {t`Aperçu`}
                  </p>
                  <span className="font-mono text-[10px] text-muted-foreground">WebP</span>
                </div>
                <div
                  className="mt-2 overflow-hidden rounded-lg border border-border/50 bg-muted/30"
                  style={{ aspectRatio: activePreset.aspect }}
                >
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={t`Aperçu du recadrage`}
                      className={cn('size-full object-cover', previewShape)}
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      {isReady ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ImageIcon className="size-4" strokeWidth={1.5} />
                      )}
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                  {activePreset.shape === 'circle'
                    ? t`L’aperçu est rond ; le fichier reste carré et détouré par le CSS.`
                    : t`Le fichier est ré-encodé sans métadonnées.`}
                </p>
              </section>

              <section className="space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                      {t`Zoom`}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {Math.round(zoom * 100)} %
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      shape="icon"
                      aria-label={t`Réduire`}
                      onClick={() => adjustZoom(-ZOOM_STEP)}
                      disabled={zoom <= MIN_ZOOM}
                    >
                      <ZoomOut className="size-3.5" />
                    </Button>
                    <input
                      type="range"
                      min={MIN_ZOOM}
                      max={MAX_ZOOM}
                      step={0.01}
                      value={zoom}
                      onChange={(event) => setZoom(Number(event.target.value))}
                      aria-label={t`Zoom`}
                      className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      shape="icon"
                      aria-label={t`Agrandir`}
                      onClick={() => adjustZoom(ZOOM_STEP)}
                      disabled={zoom >= MAX_ZOOM}
                    >
                      <ZoomIn className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                      {t`Rotation`}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {Math.round(rotation)}°
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      shape="icon"
                      aria-label={t`Pivoter à gauche`}
                      onClick={() => setRotation((current) => (current + 270) % 360)}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      step={1}
                      value={rotation}
                      onChange={(event) => setRotation(Number(event.target.value))}
                      aria-label={t`Rotation`}
                      className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      shape="icon"
                      aria-label={t`Pivoter à droite`}
                      onClick={() => setRotation((current) => (current + 90) % 360)}
                    >
                      <RotateCw className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <Button type="button" variant="ghost" size="xs" onClick={resetCrop}>
                  <RotateCcw className="size-3.5" />
                  {t`Réinitialiser`}
                </Button>
              </section>
            </div>
          </aside>
        </div>

        {error && (
          <p
            role="alert"
            className="border-t border-destructive/20 bg-destructive/5 px-5 py-2.5 text-[11.5px] text-destructive-text sm:px-6"
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border/50 px-5 py-3.5 sm:px-6">
          <p className="hidden text-[11px] text-muted-foreground sm:block">
            {t`Le fichier d’origine n’est pas modifié.`}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isProcessing}
            >
              {t`Annuler`}
            </Button>
            <Button
              type="button"
              variant="solid"
              tone="brand"
              size="sm"
              onClick={() => void handleApply()}
              loading={isProcessing}
              disabled={!src || !croppedAreaPixels || !isReady}
            >
              {isProcessing ? t`Préparation…` : t`Utiliser cette image`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
