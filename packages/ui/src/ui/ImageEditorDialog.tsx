'use client';

/**
 * 🖼️ ImageEditorDialog — le modal d'édition d'image partagé
 * =====================================================================
 * Un seul geste pour tous les formats : logo, bannière, couverture,
 * image d'article. Le cadrage est verrouillé sur le preset choisi, le
 * zoom et la rotation restent libres, et le fichier produit fait
 * exactement `preset.width × preset.height`.
 *
 * 📖 Le modal est volontairement compact : le stage garde la place
 *    principale, les formats et l'aperçu final tiennent dans une colonne
 *    étroite, et les réglages fréquents restent sous la main.
 *
 * 🎯 Le rendu passe par un canvas : le fichier source n'est jamais
 *    modifié, l'EXIF est perdu (le serveur le strippe déjà), et la sortie
 *    est en WebP (ou PNG si le navigateur ne sait pas l'encoder).
 * =====================================================================
 */

import * as React from 'react';
import Cropper, { type Area, type MediaSize } from 'react-easy-crop';
import {
  Image as ImageIcon,
  Loader2,
  Move,
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
import { Select } from '../primitives/select/select';
import { Switch } from '../primitives/switch/switch';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const PREVIEW_MAX_WIDTH = 320;

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
  const [showGrid, setShowGrid] = React.useState(true);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);
  const [mediaSize, setMediaSize] = React.useState<MediaSize | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [isReady, setIsReady] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const activePreset = safePresets.find((preset) => preset.id === presetId) ?? safePresets[0];

  // Chaque nouvelle source ou chaque ouverture repart d'un cadrage propre.
  React.useEffect(() => {
    if (!open) return;
    setPresetId(resolvedInitialPresetId);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setShowGrid(true);
    setCroppedAreaPixels(null);
    setMediaSize(null);
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
    setShowGrid(true);
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
    const key = event.key.toLowerCase();

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
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      adjustZoom(ZOOM_STEP);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      adjustZoom(-ZOOM_STEP);
    } else if (key === 'r') {
      event.preventDefault();
      setRotation((current) => (current + 90) % 360);
    } else if (key === '0') {
      event.preventDefault();
      resetCrop();
    }
  };

  const previewShape =
    activePreset.shape === 'circle'
      ? 'rounded-full'
      : activePreset.aspect > 2
        ? 'rounded-md'
        : 'rounded-sm';

  return (
    <Dialog open={open} onOpenChange={onOpenChange} isDismissable={!isProcessing}>
      <DialogContent className="max-sm:p-0 gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-border/50 px-4 py-3 pr-12 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <DialogTitle className="truncate text-[15px]">{title ?? t`Éditer l’image`}</DialogTitle>
            <span className="hidden shrink-0 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
              {formatAspect(activePreset.aspect)} · {activePreset.width} × {activePreset.height}
            </span>
          </div>
          <DialogDescription className="line-clamp-1 text-[11px]">
            {description ??
              t`Choisissez le format, ajustez le cadrage, puis vérifiez l’aperçu avant d’envoyer.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_228px]">
          <div className="min-w-0 p-3 sm:p-4">
            <div
              className="relative w-full overflow-hidden rounded-lg border border-border/50 bg-muted/35"
              style={{ height: 'clamp(240px, 38vh, 340px)' }}
              tabIndex={0}
              role="group"
              aria-label={t`Zone de recadrage. Utilisez les flèches pour déplacer l’image, la molette pour zoomer.`}
              aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0 R"
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
                  zoomWithScroll
                  zoomSpeed={0.5}
                  showGrid={showGrid}
                  roundCropAreaPixels
                  classes={{ containerClassName: 'cursor-grab active:cursor-grabbing' }}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onRotationChange={setRotation}
                  onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
                  onMediaLoaded={(size) => {
                    setMediaSize(size);
                    setIsReady(true);
                  }}
                  style={{ containerStyle: { background: 'transparent' } }}
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="size-6" strokeWidth={1.5} />
                </div>
              )}

              <div className="pointer-events-none absolute top-2 left-2 rounded-md border border-border/40 bg-background/80 px-2 py-1 text-[10px] font-medium text-foreground shadow-xs backdrop-blur-xs">
                {activePreset.label}
                <span className="ml-1 font-mono text-muted-foreground">
                  {formatAspect(activePreset.aspect)}
                </span>
              </div>

              <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-xs">
                <Move className="size-3" />
                {t`Glisser · molette · pincer`}
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex min-w-[180px] flex-1 items-center gap-1.5">
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
                  aria-valuetext={`${Math.round(zoom * 100)} %`}
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
                <span className="w-9 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                  {Math.round(zoom * 100)} %
                </span>
              </div>

              <span aria-hidden className="hidden h-4 w-px bg-border/60 sm:block" />

              <div className="flex items-center gap-1">
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
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="gap-1 px-2"
                  onClick={resetCrop}
                >
                  <RotateCcw className="size-3.5" />
                  <span className="hidden sm:inline">{t`Réinitialiser`}</span>
                </Button>
              </div>
            </div>

            <p className="mt-2 hidden text-[10px] text-muted-foreground sm:block">
              {t`Flèches : déplacer · +/− : zoom · R : pivoter · 0 : réinitialiser`}
            </p>
          </div>

          <aside className="min-w-0 border-t border-border/50 p-3.5 sm:p-4 lg:border-t-0 lg:border-l">
            <div className="space-y-3.5">
              <section>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[9px] font-medium tracking-wider text-muted-foreground uppercase">
                    {t`Format`}
                  </p>
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {activePreset.width} × {activePreset.height}
                  </span>
                </div>
                {safePresets.length > 1 ? (
                  <Select
                    label={t`Format`}
                    hideLabel
                    size="sm"
                    className="mt-1.5"
                    value={activePreset.id}
                    options={safePresets.map((preset) => ({
                      id: preset.id,
                      label: formatAspect(preset.aspect),
                      description: `${preset.label} · ${preset.width} × ${preset.height}`,
                    }))}
                    onValueChange={(nextId) => {
                      const next = safePresets.find((preset) => preset.id === nextId);
                      if (next) selectPreset(next);
                    }}
                  />
                ) : (
                  <div className="mt-1.5 flex items-center justify-between rounded-control border border-border/50 bg-muted/20 px-2.5 py-2">
                    <span className="font-mono text-xs font-medium">
                      {formatAspect(activePreset.aspect)}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {activePreset.width} × {activePreset.height}
                    </span>
                  </div>
                )}
              </section>

              <Switch
                size="sm"
                label={t`Grille`}
                aria-label={t`Afficher la grille`}
                isSelected={showGrid}
                onChange={setShowGrid}
                className="items-center rounded-control border border-border/40 bg-muted/20 px-2.5 py-1.5"
              />

              <section>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[9px] font-medium tracking-wider text-muted-foreground uppercase">
                    {t`Aperçu final`}
                  </p>
                  <span className="font-mono text-[9px] text-muted-foreground">WebP</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <div className="relative size-[72px] shrink-0 overflow-hidden rounded-md border border-border/50 bg-muted/30">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={t`Aperçu du recadrage`}
                        className={cn('size-full object-contain', previewShape)}
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
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium tabular-nums text-foreground">
                      {activePreset.width} × {activePreset.height}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {fileName || t`Image source`}
                    </p>
                    {mediaSize && (
                      <p className="truncate font-mono text-[9px] text-muted-foreground">
                        {t`Source`} {mediaSize.naturalWidth} × {mediaSize.naturalHeight}
                      </p>
                    )}
                    <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">
                      {activePreset.shape === 'circle'
                        ? t`Le fichier reste carré ; l’affichage applique le masque rond.`
                        : t`Fichier ré-encodé, sans métadonnées.`}
                    </p>
                  </div>
                </div>
              </section>

              <div className="rounded-md border border-border/40 bg-muted/20 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
                {t`Le fichier source reste intact.`}
              </div>
            </div>
          </aside>
        </div>

        {error && (
          <p
            role="alert"
            className="border-t border-destructive/20 bg-destructive/5 px-4 py-2.5 text-[11.5px] text-destructive-text sm:px-5"
          >
            {error}
          </p>
        )}

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/50 px-4 py-2.5 sm:px-5">
          <p className="hidden min-w-0 truncate text-[10px] text-muted-foreground sm:block">
            {t`Sortie`}{' '}
            <span className="font-mono tabular-nums">
              {activePreset.width} × {activePreset.height} px
            </span>
          </p>
          <div className="ml-auto flex items-center gap-1.5">
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
