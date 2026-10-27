'use client';

import type { ReactNode } from 'react';
import { cn } from '@qoe/utils';

/**
 * Cadre d'un spécimen numéroté du UI Lab.
 * Le numéro est stable : c'est l'identifiant qu'on utilise pour discuter
 * (« sur le #03, ... ») et il ne doit jamais être réattribué.
 */
export function SpecimenFrame({
  id,
  index,
  title,
  question,
  sources,
  notes,
  children,
}: {
  id: string;
  index: string;
  title: string;
  question: string;
  sources?: string[];
  notes?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {index}
            </span>
            <h2 className="text-[17px] font-semibold tracking-tight text-foreground">{title}</h2>
          </div>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            {question}
          </p>
        </div>
      </div>

      <div className="mt-4 min-w-0 overflow-hidden rounded-xl border border-border/40 bg-card">
        {/* Les démos contiennent des largeurs fixes (menus, selects) : on
            contient le débordement ici plutôt que de faire déborder la page. */}
        <div className="grid min-w-0 gap-8 overflow-x-auto p-6 sm:p-7">{children}</div>
      </div>

      {sources && sources.length > 0 && (
        <ul className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
          <li className="text-[11px] text-muted-foreground">Sources :</li>
          {sources.map((source) => (
            <li
              key={source}
              className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
            >
              {source}
            </li>
          ))}
        </ul>
      )}

      {notes && <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{notes}</p>}
    </section>
  );
}

type VariantKind = 'actuel' | 'candidat' | 'variante' | 'ecart';

const KIND_STYLES: Record<VariantKind, string> = {
  actuel: 'border-border/60 bg-muted/40 text-muted-foreground',
  candidat: 'border-primary/30 bg-primary/10 text-primary',
  variante: 'border-border/60 bg-transparent text-foreground',
  ecart: 'border-destructive/30 bg-destructive/10 text-destructive-text',
};

const KIND_LABEL: Record<VariantKind, string> = {
  actuel: 'actuel',
  candidat: 'candidat',
  variante: 'variante',
  ecart: 'écart',
};

/**
 * Une variante d'un spécimen : le libellé porte le statut (ce qui existe
 * aujourd'hui vs la proposition à valider), pour qu'on ne confonde jamais
 * un état constaté avec une décision.
 */
export function Variant({
  label,
  kind = 'candidat',
  hint,
  children,
}: {
  label: string;
  kind?: VariantKind;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
        <span
          className={cn(
            'rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide',
            KIND_STYLES[kind]
          )}
        >
          {KIND_LABEL[kind]}
        </span>
      </div>
      <div className="min-w-0">{children}</div>
      {hint && <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** État constaté : liste courte de défauts observés dans le code actuel. */
export function DefectList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-1">
      {items.map((item) => (
        <li key={item} className="flex gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          <span
            aria-hidden
            className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/60"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
