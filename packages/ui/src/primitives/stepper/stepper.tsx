import type { ReactNode } from 'react';
import { cn } from '@qoe/utils';

import { Icon } from '../../icons';

// =====================================================================
// 🪜 Stepper — où en est le parcours, et ce qui reste
// =====================================================================
// 📖 Un formulaire en plusieurs étapes (publication, onboarding, import)
//    n'a pas besoin d'un composant de plus : il a besoin d'un repère.
//    `Stepper` calcule l'état de chaque étape à partir d'un seul index
//    courant — `complete`, `current`, `upcoming` — au lieu de laisser
//    l'appelant peindre trois couleurs.
//
// 🎯 `aria-current="step"` sur l'étape courante, une liste ordonnée, et
//    un numéro qui devient une coche une fois l'étape passée. L'état ne
//    repose jamais sur la seule couleur.
// =====================================================================

export type StepStatus = 'complete' | 'current' | 'upcoming';

export interface Step {
  /** Identifiant stable ; à défaut, l'index. */
  id?: string;
  label: string;
  description?: ReactNode;
  /** Force l'état au lieu de le déduire de `current`. */
  status?: StepStatus;
}

export interface StepperProps {
  steps: Step[];
  /** Index de l'étape courante (0-indexé). */
  current?: number;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

const MARKERS: Record<StepStatus, string> = {
  complete: 'border-primary bg-primary text-primary-foreground',
  current: 'border-foreground bg-foreground text-background',
  upcoming: 'border-border bg-card text-muted-foreground',
};

export function Stepper({
  steps,
  current = 0,
  orientation = 'horizontal',
  className,
}: StepperProps) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <ol
      className={cn(
        isHorizontal ? 'grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]' : 'grid gap-0',
        className
      )}
    >
      {steps.map((step, index) => {
        const status: StepStatus =
          step.status ??
          (index < current ? 'complete' : index === current ? 'current' : 'upcoming');
        const isLast = index === steps.length - 1;

        return (
          <li
            key={step.id ?? `${step.label}-${index}`}
            aria-current={status === 'current' ? 'step' : undefined}
            className={cn(
              'relative flex min-w-0 gap-2.5',
              isHorizontal ? 'items-start' : 'pb-4 last:pb-0'
            )}
          >
            {/* Rail vertical : un seul trait, entre la marque et la suivante. */}
            {!isHorizontal && !isLast && (
              <span aria-hidden className="absolute top-6 bottom-0 left-[9px] w-px bg-border/60" />
            )}
            {/* Rail horizontal : trait pointillé jusqu'au bord de la cellule. */}
            {isHorizontal && !isLast && (
              <span
                aria-hidden
                className="absolute top-[11px] right-2 left-7 hidden h-px bg-border/60 sm:block"
              />
            )}

            <span
              className={cn(
                'relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-control border',
                'font-mono text-[10px] font-medium tabular-nums',
                MARKERS[status]
              )}
            >
              {status === 'complete' ? (
                <Icon name="check" size="xs" aria-hidden />
              ) : (
                <span aria-hidden>{index + 1}</span>
              )}
            </span>

            <div className="min-w-0">
              <p
                className={cn(
                  'text-[12px] leading-snug',
                  status === 'upcoming' ? 'text-muted-foreground' : 'font-medium text-foreground'
                )}
              >
                {step.label}
                {status === 'current' && <span className="sr-only"> (étape courante)</span>}
              </p>
              {step.description && (
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
