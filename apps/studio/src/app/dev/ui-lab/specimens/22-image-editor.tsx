'use client';

import { useEffect, useState } from 'react';
import { Crop, Image as ImageIcon, RectangleHorizontal, Square } from 'lucide-react';
import { Button } from '@qoe/ui/button';
import {
  ImageEditorDialog,
  type ImageEditorPreset,
  type ImageEditorResult,
} from '@qoe/ui/ui/ImageEditorDialog';
import { DefectList, Variant } from '../specimen-frame';

/**
 * Spécimen 22 — l'éditeur d'image mixte.
 *
 * 📖 Le même modal porte le logo carré, la bannière large et l'image
 *    d'article. Le format verrouille le cadrage, mais le zoom et la
 *    rotation restent disponibles. L'aperçu de droite est le rendu réel
 *    du canvas, pas une approximation CSS.
 *
 * 🎯 Le code de sortie n'est jamais le fichier source : l'image est
 *    ré-encodée aux dimensions exactes du preset.
 */

const SAMPLES = [
  {
    id: 'city',
    label: 'Ville',
    src: '/lab/editorial-city.svg',
    fileName: 'editorial-city.svg',
  },
  {
    id: 'archive',
    label: 'Archive',
    src: '/lab/editorial-archive.svg',
    fileName: 'editorial-archive.svg',
  },
  {
    id: 'transit',
    label: 'Transit',
    src: '/lab/editorial-transit.svg',
    fileName: 'editorial-transit.svg',
  },
] as const;

const PRESETS: ImageEditorPreset[] = [
  {
    id: 'logo',
    label: 'Logo',
    aspect: 1,
    width: 512,
    height: 512,
    shape: 'circle',
    hint: 'Carré, affiché en rond',
  },
  {
    id: 'banner',
    label: 'Bannière',
    aspect: 21 / 9,
    width: 1600,
    height: 686,
    shape: 'rect',
    hint: 'En-tête de média',
  },
  {
    id: 'article',
    label: 'Article',
    aspect: 16 / 9,
    width: 1600,
    height: 900,
    shape: 'rect',
    hint: 'Couverture éditoriale',
  },
  {
    id: 'gallery',
    label: 'Galerie',
    aspect: 4 / 3,
    width: 1200,
    height: 900,
    shape: 'rect',
    hint: 'Grille d’article',
  },
  {
    id: 'portrait',
    label: 'Portrait',
    aspect: 4 / 5,
    width: 1200,
    height: 1500,
    shape: 'rect',
    hint: 'Format vertical',
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} Ko`;
  return `${Math.round(bytes / (1024 * 102.4)) / 10} Mo`;
}

export function ImageEditorSpecimen() {
  const [open, setOpen] = useState(false);
  const [sampleId, setSampleId] = useState<(typeof SAMPLES)[number]['id']>('city');
  const [initialPresetId, setInitialPresetId] = useState('article');
  const [result, setResult] = useState<{
    url: string;
    file: File;
    width: number;
    height: number;
  } | null>(null);

  const sample = SAMPLES.find((item) => item.id === sampleId) ?? SAMPLES[0];

  // Les object URLs du spécimen sont locaux : on les rend au navigateur
  // dès qu'ils sont remplacés ou que le spécimen est démonté.
  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  const openEditor = (presetId: string) => {
    setInitialPresetId(presetId);
    setOpen(true);
  };

  const handleApply = ({ file, width, height }: ImageEditorResult) => {
    if (result) URL.revokeObjectURL(result.url);
    setResult({
      url: URL.createObjectURL(file),
      file,
      width,
      height,
    });
    setOpen(false);
  };

  return (
    <div className="grid gap-10">
      <Variant
        label="Un modal, cinq destinations"
        kind="candidat"
        hint="Le format est une décision de destination, pas un réglage caché : le cadre se verrouille sur 1:1, 21:9, 16:9, 4:5 ou 4:3. Le stage reste la pièce principale ; les formats et l’aperçu final tiennent dans une colonne étroite. Molette et pincer zooment, le clavier déplace et pivote."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <div className="overflow-hidden rounded-xl border border-border/50 bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element -- assets SVG locaux du Lab, pas de Next/Image nécessaire. */}
              <img
                src={result?.url ?? sample.src}
                alt="Aperçu de l’image à recadrer"
                className="aspect-[16/9] w-full object-cover"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-muted-foreground">
              <span className="font-mono">{sample.fileName}</span>
              <span aria-hidden>·</span>
              <span>{result ? 'Rendu recadré' : 'Image source'}</span>
              {result && (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-mono tabular-nums">
                    {result.width} × {result.height} px
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div>
              <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                Image d’entrée
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SAMPLES.map((item) => (
                  <Button
                    key={item.id}
                    variant={item.id === sampleId ? 'soft' : 'outline'}
                    tone={item.id === sampleId ? 'brand' : 'neutral'}
                    size="sm"
                    aria-pressed={item.id === sampleId}
                    onClick={() => {
                      setSampleId(item.id);
                      setResult(null);
                    }}
                  >
                    <ImageIcon className="size-3.5" strokeWidth={1.75} />
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                Destination
              </p>
              <div className="mt-1.5 grid gap-1.5">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    variant="ghost"
                    size="sm"
                    className="h-auto justify-start gap-2 px-2.5 py-2 text-left"
                    onClick={() => openEditor(preset.id)}
                  >
                    {preset.shape === 'circle' ? (
                      <Square className="size-3.5 shrink-0" strokeWidth={1.75} />
                    ) : (
                      <RectangleHorizontal className="size-3.5 shrink-0" strokeWidth={1.75} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium">{preset.label}</span>
                      <span className="block font-mono text-[10px] font-normal text-muted-foreground">
                        {preset.width} × {preset.height} · {preset.hint}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                <Crop className="size-3.5 text-primary" strokeWidth={1.75} />
                Sortie exacte
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                {result ? (
                  <>
                    {result.file.name} · {formatBytes(result.file.size)} · WebP
                  </>
                ) : (
                  'Le fichier source reste intact ; l’éditeur produit un nouveau fichier.'
                )}
              </p>
            </div>

            <Button block variant="solid" tone="brand" onClick={() => openEditor('article')}>
              <Crop className="size-3.5" strokeWidth={1.75} />
              Ouvrir l’éditeur
            </Button>
          </div>
        </div>

        <DefectList
          items={[
            'Le cadrage est verrouillé sur le format de destination : aucun rendu déformé possible',
            'Les dimensions de sortie sont celles du preset, pas celles du fichier d’origine',
            'L’aperçu est produit par le même canvas que l’export, à une taille réduite',
            'La molette et le pincer zooment directement ; les flèches déplacent, +/− zooment, R pivote et 0 réinitialise',
            'La grille se masque depuis le stage et le panneau de format reste compact',
            'Un GIF animé ne passe pas par le canvas : son animation serait détruite',
          ]}
        />
      </Variant>

      <ImageEditorDialog
        open={open}
        onOpenChange={setOpen}
        src={sample.src}
        fileName={sample.fileName}
        presets={PRESETS}
        initialPresetId={initialPresetId}
        title="Recadrer l’image"
        description="Choisissez le format de destination, cadrez, zoomez, puis vérifiez le rendu."
        onApply={handleApply}
      />
    </div>
  );
}
