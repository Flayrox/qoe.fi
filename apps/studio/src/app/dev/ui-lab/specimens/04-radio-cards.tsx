'use client';

import { useState } from 'react';
import { RadioGroup, RadioCard } from '@qoe/ui/radio-group';
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
        label="Bordure + coche (@qoe/ui/radio-group)"
        kind="candidat"
        hint="Clavier par flèches directionnelles, bordure d'accent, coche animée — et aperçu de mise en page dans la carte."
      >
        <RadioGroup
          aria-label="Mise en page avec coche"
          value={withCheck}
          onChange={setWithCheck}
          variant="check"
          className="grid gap-3 sm:grid-cols-3"
        >
          {LAYOUTS.map((layout) => (
            <RadioCard
              key={layout.id}
              value={layout.id}
              title={layout.label}
              description={layout.description}
              preview={layout.preview}
            />
          ))}
        </RadioGroup>
      </Variant>

      <Variant
        label="Bordure seule (@qoe/ui/radio-group)"
        kind="variante"
        hint="Variante sans coche graphique : le contraste de bordure et la surface distinguent l'option choisie."
      >
        <RadioGroup
          aria-label="Mise en page bordure seule"
          value={borderOnly}
          onChange={setBorderOnly}
          variant="border-only"
          className="grid gap-3 sm:grid-cols-3"
        >
          {LAYOUTS.map((layout) => (
            <RadioCard
              key={layout.id}
              value={layout.id}
              title={layout.label}
              description={layout.description}
              preview={layout.preview}
            />
          ))}
        </RadioGroup>
      </Variant>
    </div>
  );
}
