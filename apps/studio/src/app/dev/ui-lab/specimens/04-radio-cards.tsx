'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@qoe/utils';
import { Variant } from '../specimen-frame';

const LAYOUTS = [
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Une colonne, beaucoup de blanc, titres discrets.',
    preview: (
      <div className="h-full w-full bg-muted/40 p-2">
        <div className="mb-1 h-1.5 w-2/3 rounded-sm bg-foreground/25" />
        <div className="mb-1 h-1 w-full rounded-sm bg-foreground/10" />
        <div className="h-1 w-5/6 rounded-sm bg-foreground/10" />
      </div>
    ),
  },
  {
    id: 'magazine',
    label: 'Magazine',
    description: 'Grille éditoriale, images larges, chapô affirmé.',
    preview: (
      <div className="grid h-full w-full grid-cols-3 gap-1 bg-muted/40 p-2">
        <div className="col-span-2 row-span-2 rounded-sm bg-foreground/15" />
        <div className="rounded-sm bg-foreground/10" />
        <div className="rounded-sm bg-foreground/10" />
      </div>
    ),
  },
  {
    id: 'dossier',
    label: 'Dossier',
    description: 'Sommaire permanent, lecture longue, notes latérales.',
    preview: (
      <div className="flex h-full w-full gap-1 bg-muted/40 p-2">
        <div className="w-1/3 space-y-1">
          <div className="h-1 rounded-sm bg-foreground/15" />
          <div className="h-1 w-2/3 rounded-sm bg-foreground/10" />
          <div className="h-1 w-3/4 rounded-sm bg-foreground/10" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="h-1.5 w-full rounded-sm bg-foreground/20" />
          <div className="h-1 w-full rounded-sm bg-foreground/10" />
          <div className="h-1 w-4/5 rounded-sm bg-foreground/10" />
        </div>
      </div>
    ),
  },
];

export function RadioCardsSpecimen() {
  const [withCheck, setWithCheck] = useState('magazine');
  const [borderOnly, setBorderOnly] = useState('minimal');

  return (
    <div className="grid gap-10">
      <Variant
        label="Bordure + coche"
        kind="candidat"
        hint="La sélection est portée par deux signaux : la bordure passe en foreground et une coche apparaît. Le survol ne change que la surface."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {LAYOUTS.map((layout) => {
            const selected = withCheck === layout.id;
            return (
              <button
                key={layout.id}
                type="button"
                onClick={() => setWithCheck(layout.id)}
                aria-pressed={selected}
                className={cn(
                  'group relative grid overflow-hidden rounded-lg border text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                  selected
                    ? 'border-foreground/70 bg-card'
                    : 'border-border/50 bg-card hover:border-border hover:bg-muted/20'
                )}
              >
                <div className="h-20 border-b border-border/40">{layout.preview}</div>
                <div className="grid gap-0.5 p-3">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                    {layout.label}
                    {selected && <Check className="size-3.5 text-foreground" strokeWidth={2} />}
                  </span>
                  <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                    {layout.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Variant>

      <Variant
        label="Bordure seule"
        kind="variante"
        hint="Moins bavard : aucun signe ajouté, seule la bordure et la couleur du titre changent. Plus sobre, mais demande un contraste de bordure suffisant en thème clair."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {LAYOUTS.map((layout) => {
            const selected = borderOnly === layout.id;
            return (
              <button
                key={layout.id}
                type="button"
                onClick={() => setBorderOnly(layout.id)}
                aria-pressed={selected}
                className={cn(
                  'grid overflow-hidden rounded-lg border text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                  selected
                    ? 'border-foreground bg-muted/20'
                    : 'border-border/50 bg-card hover:bg-muted/20'
                )}
              >
                <div className="h-20 border-b border-border/40">{layout.preview}</div>
                <div className="grid gap-0.5 p-3">
                  <span
                    className={cn(
                      'text-[13px]',
                      selected
                        ? 'font-semibold text-foreground'
                        : 'font-medium text-muted-foreground'
                    )}
                  >
                    {layout.label}
                  </span>
                  <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                    {layout.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Variant>
    </div>
  );
}
