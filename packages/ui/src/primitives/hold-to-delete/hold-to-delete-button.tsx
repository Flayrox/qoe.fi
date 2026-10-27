'use client';

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Check, Trash2 } from 'lucide-react';

import { cn } from '@qoe/utils';

import { DISABLED, FOCUS_RING, ICON_SLOT } from '../contract';

// =====================================================================
// 🗑️ HoldToDeleteButton — la suppression qui demande un geste
// =====================================================================
// 📖 Porté de la famille « hold-to-delete » d'opensourceui. L'intention
//    est meilleure qu'une boîte de dialogue : au lieu d'un « Êtes-vous
//    sûr ? » qu'on valide par réflexe, il faut *tenir* le bouton le temps
//    que le remplissage traverse. Relâcher avant la fin annule.
//
// 🎯 Ce qui a été repris : le remplissage qui balaie de gauche à droite
//    pendant que le libellé glisse en sens inverse (l'impression d'être
//    rogné par le bord), et l'état final qui prend la place du libellé.
//
// ⚠️ Ce qui a été corrigé : la durée. La référence recopiait des classes
//    Tailwind figées pour chaque durée (500, 700, 1000 ms…) parce que
//    Tailwind ne compile pas une classe construite à l'exécution. Un
//    `transitionDuration` en style fait la même chose sans plafonner la
//    prop à six valeurs, et sans compiler six variantes.
//
// ⌨️ Au clavier, une pression maintenue sur Entrée ou Espace déclenche le
//    même compte à rebours : sans ça, l'action serait impossible sans
//    souris. Le résultat est annoncé dans une zone `aria-live`.
// =====================================================================

export interface HoldToDeleteButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'children'
> {
  /** Libellé au repos. Défaut « Supprimer ». */
  label?: string;
  /** Libellé une fois l'action faite. Défaut « Supprimé ». */
  doneLabel?: string;
  /** Durée de maintien, en millisecondes. Défaut 1000. */
  holdMs?: number;
  /** Appelé quand le maintien va au bout. */
  onHoldComplete?: () => void;
  /** Icône au repos. Défaut la corbeille. */
  icon?: ReactNode;
  className?: string;
}

export const HoldToDeleteButton = forwardRef<HTMLButtonElement, HoldToDeleteButtonProps>(
  function HoldToDeleteButton(
    {
      label = 'Supprimer',
      doneLabel = 'Supprimé',
      holdMs = 1000,
      onHoldComplete,
      icon,
      className,
      disabled,
      ...props
    },
    ref
  ) {
    const [state, setState] = useState<'idle' | 'holding' | 'done'>('idle');
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clear = () => {
      if (timerRef.current !== null) {
        globalThis.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    useEffect(() => clear, []);

    const start = () => {
      if (state === 'done' || disabled || timerRef.current !== null) return;
      setState('holding');
      timerRef.current = globalThis.setTimeout(() => {
        timerRef.current = null;
        setState('done');
        onHoldComplete?.();
      }, holdMs);
    };

    const cancel = () => {
      if (timerRef.current === null) return;
      clear();
      setState('idle');
    };

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.repeat) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        start();
      }
    };

    const handleKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === ' ' || event.key === 'Enter') cancel();
    };

    const active = state !== 'idle';
    const done = state === 'done';
    // La durée ne peut pas être une classe Tailwind construite à
    // l'exécution : on la pose en style.
    const motion = {
      transitionDuration: active ? `${holdMs}ms` : '300ms',
    } as const;

    return (
      <button
        ref={ref}
        type="button"
        data-state={state}
        disabled={disabled || done}
        aria-label={done ? doneLabel : `${label} (maintenir pour confirmer)`}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onContextMenu={(event) => event.preventDefault()}
        className={cn(
          'relative flex h-control-lg touch-none items-center justify-center overflow-hidden rounded-control',
          'bg-card px-4 type-control-md font-medium select-none',
          'shadow-[0_0_0_1px_var(--border),0_1px_1px_rgba(0,0,0,0.05),0_2px_3px_rgba(0,0,0,0.07),inset_0_1px_1px_rgba(255,255,255,0.6)]',
          'transition-shadow duration-300 ease-out motion-reduce:transition-none',
          active &&
            'shadow-[0_0_0_1px_var(--border),inset_0_1px_2px_rgba(0,0,0,0.10),inset_0_2px_4px_rgba(0,0,0,0.05)]',
          done ? 'cursor-default' : 'cursor-pointer',
          FOCUS_RING,
          DISABLED,
          className
        )}
        {...props}
      >
        {/* Libellé au repos : texte rouge d'état, pas de fond. */}
        <span
          aria-hidden={active}
          className={cn(
            'flex items-center gap-2 text-destructive-text transition-opacity duration-200',
            active && 'opacity-0'
          )}
        >
          <span aria-hidden className={cn('flex shrink-0 items-center', ICON_SLOT)}>
            {icon ?? <Trash2 className="size-3.5" strokeWidth={2} />}
          </span>
          {label}
        </span>

        {/* Remplissage destructif : il balaie vers la droite, et son
            contenu glisse en sens inverse pour être « rogné » par le bord. */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 overflow-hidden bg-destructive transition-transform ease-linear motion-reduce:transition-none',
            active ? 'translate-x-0' : '-translate-x-full'
          )}
          style={motion}
        >
          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center gap-2 text-destructive-foreground transition-transform ease-linear',
              active ? 'translate-x-0' : 'translate-x-full'
            )}
            style={motion}
          >
            <span
              className={cn('flex shrink-0 items-center text-destructive-foreground', ICON_SLOT)}
            >
              {icon ?? <Trash2 className="size-3.5" strokeWidth={2} />}
            </span>
            <span className={cn('transition-opacity duration-200', done && 'opacity-0')}>
              {label}
            </span>
            <span
              className={cn(
                'absolute inset-0 flex items-center justify-center gap-2 transition-opacity duration-300',
                done ? 'opacity-100' : 'opacity-0'
              )}
            >
              <Check className="size-3.5" strokeWidth={2.5} />
              {doneLabel}
            </span>
          </span>
        </span>

        <span className="sr-only" aria-live="polite">
          {done ? doneLabel : ''}
        </span>
      </button>
    );
  }
);
