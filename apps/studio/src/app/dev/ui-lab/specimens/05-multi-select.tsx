'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@qoe/utils';
import { Variant } from '../specimen-frame';

const TAGS = [
  { id: 'climat', label: 'Climat' },
  { id: 'enquete', label: 'Enquête' },
  { id: 'essai', label: 'Essai' },
  { id: 'entretien', label: 'Entretien' },
  { id: 'data', label: 'Données' },
  { id: 'photo', label: 'Photo' },
];

export function MultiSelectSpecimen() {
  const [selected, setSelected] = useState<string[]>(['enquete', 'data']);
  const [single, setSingle] = useState<string | null>('essai');

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));

  return (
    <div className="grid gap-10">
      <Variant
        label="Chips à bascule"
        kind="candidat"
        hint="Choix multiple pour les filtres et les étiquettes. Rayon de l’échelle (rounded-md, pas de pilule), sélection portée par la surface et non par un contour coloré."
      >
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((tag) => {
              const active = selected.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggle(tag.id)}
                  aria-pressed={active}
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12.5px] transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                    active
                      ? 'border-transparent bg-foreground text-background'
                      : 'border-border/50 bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  )}
                >
                  {tag.label}
                  {active && <X className="size-3 opacity-70" strokeWidth={2} />}
                </button>
              );
            })}
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            {selected.length} sélectionné{selected.length > 1 ? 's' : ''} sur {TAGS.length}
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="ml-2 text-foreground underline-offset-2 hover:underline"
              >
                Tout effacer
              </button>
            )}
          </p>
        </div>
      </Variant>

      <Variant
        label="Choix unique en chips"
        kind="variante"
        hint="Même composant, sémantique exclusive. Utile quand une liste déroulante serait trop lourde (3 à 6 options visibles en permanence)."
      >
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Format">
          {TAGS.slice(0, 4).map((tag) => {
            const active = single === tag.id;
            return (
              <button
                key={tag.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSingle(tag.id)}
                className={cn(
                  'flex h-7 items-center rounded-md border px-2 text-[12.5px] transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                  active
                    ? 'border-foreground/60 bg-muted/40 font-medium text-foreground'
                    : 'border-border/50 bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                )}
              >
                {tag.label}
              </button>
            );
          })}
        </div>
      </Variant>
    </div>
  );
}
