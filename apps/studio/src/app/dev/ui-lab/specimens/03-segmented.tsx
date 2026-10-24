'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@qoe/utils';
import { DefectList, Variant } from '../specimen-frame';

const OPTIONS = [
  { id: 'articles', label: 'Articles', count: 128 },
  { id: 'categories', label: 'Catégories', count: 12 },
  { id: 'medias', label: 'Médias', count: 340 },
];

export function SegmentedSpecimen() {
  const [a, setA] = useState('articles');
  const [b, setB] = useState('articles');
  const [c, setC] = useState('articles');

  return (
    <div className="grid gap-10">
      <Variant
        label="Onglets soulignés"
        kind="actuel"
        hint="C’est le pattern réellement utilisé dans les réglages du Studio : bordure basse de 2 px, couleur primaire sur le trait et l’icône."
      >
        <div className="flex gap-5 border-b border-border/40">
          {OPTIONS.map((option) => {
            const selected = a === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setA(option.id)}
                className={cn(
                  '-mb-px flex items-center gap-1.5 border-b-2 pt-1 pb-2.5 text-xs transition-colors',
                  selected
                    ? 'border-primary font-semibold text-foreground'
                    : 'border-transparent font-medium text-muted-foreground hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <DefectList
          items={[
            'Le trait primaire colore un état de navigation, pas une action',
            'Aucune gestion clavier : pas de role=tablist, pas de flèches',
            'La hauteur dépend du contenu (pt-1 pb-2.5) au lieu d’une échelle fixe',
          ]}
        />
      </Variant>

      <Variant
        label="Segmenté en creux"
        kind="candidat"
        hint="Rayon de l’échelle (rounded-lg, pas de pilule) : le fond creux porte la sélection, l’élément actif remonte en surface. C’est la variante la plus proche de ce que le reste de l’app fait déjà."
      >
        <Segmented id="segmente" options={OPTIONS} value={b} onChange={setB} />
      </Variant>

      <Variant
        label="Pilule glissante animée"
        kind="ecart"
        hint="Ce que font beaucoup de produits (macOS / Linear) : pastille qui glisse à l’activation. Séduisant, mais c’est un écart : aujourd’hui l’app n’utilise des pilules que pour des badges, jamais pour un sélecteur. À valider comme exception, pas comme défaut."
      >
        <SegmentedPill id="pillule" options={OPTIONS} value={c} onChange={setC} />
      </Variant>
    </div>
  );
}

function Segmented({
  id,
  options,
  value,
  onChange,
}: {
  id: string;
  options: { id: string; label: string; count: number }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filtrer la liste"
      className="inline-flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5"
    >
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            role="tab"
            aria-selected={selected}
            id={`${id}-${option.id}`}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-[min(var(--radius-md),10px)] px-2.5 text-[12.5px] transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
              selected
                ? 'bg-background font-medium text-foreground shadow-xs'
                : 'font-normal text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
            <span
              className={cn(
                'font-mono text-[10.5px] tabular-nums',
                selected ? 'text-muted-foreground' : 'text-muted-foreground/70'
              )}
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SegmentedPill({
  id,
  options,
  value,
  onChange,
}: {
  id: string;
  options: { id: string; label: string; count: number }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filtrer la liste"
      className="inline-flex items-center gap-1 rounded-full bg-muted/50 p-1"
    >
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            role="tab"
            aria-selected={selected}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              'relative flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
              selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {selected && (
              <motion.span
                layoutId={`${id}-pill`}
                className="absolute inset-0 rounded-full bg-background shadow-sm"
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
