'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

import { cn } from '@qoe/utils';
import {
  Checkbox as AriaCheckbox,
  type CheckboxProps as AriaCheckboxProps,
} from 'react-aria-components';

import { type Size, type Tone } from '../contract';

// =====================================================================
// ☑️ Checkbox — une case qui dit trois choses
// =====================================================================
// 📖 Trois états, pas deux : coché, décoché, et indéterminé (une partie
//    des enfants est cochée). Le troisième n'est pas une décoration : un
//    « tout sélectionner » à moitié coché doit annoncer « mixed » au
//    lecteur d'écran, sinon il annonce « décoché » et ment.
//
// 🎯 react-aria pose la sémantique (l'input natif, sa propriété
//    `indeterminate`, la barre d'espace, le focus). Nous posons la peau.
//
// 🎨 Le parti pris de la refonte : plus de contour à 1 px sur fond blanc
//    (le look « formulaire Windows »). La case au repos est une petite
//    tuile pleine, avec un liseré *intérieur* — donc jamais rogné par le
//    centrage, et lisible sur carte blanche comme sur fond sombre. Cochée,
//    elle devient une pastille de couleur qui s'enfonce au clic ; le
//    glyphe apparaît en `starting:` (montage animé, aucune gestion d'état
//    en plus).
// =====================================================================

/** Côté et rayon de la case, par densité. Plus la case est grande, plus
 *  le rayon suit : un rayon fixe rend les petites cases rondes et les
 *  grandes carrées. */
const BOX_SIZES: Record<Size, string> = {
  xs: 'size-[15px] rounded-[5px]',
  sm: 'size-4 rounded-[5px]',
  md: 'size-[18px] rounded-[6px]',
  lg: 'size-5 rounded-[7px]',
};

/** Décalage vertical : la case est centrée sur la première ligne du libellé. */
const BOX_OFFSET: Record<Size, string> = {
  xs: 'mt-[1px]',
  sm: 'mt-0',
  md: 'mt-0',
  lg: 'mt-0',
};

const TEXT_SIZES: Record<Size, string> = {
  xs: 'type-control-xs',
  sm: 'type-control-sm',
  md: 'type-control-md',
  lg: 'type-control-lg',
};

/**
 * Peau de la case cochée, par ton.
 *
 * `inset-ring-0` n'est pas décoratif : sans lui, le liseré du repos reste
 * et borde la couleur d'un filet gris. Le `shadow` bas est l'unique relief
 * du système — la case se pose sur la page, elle ne flotte pas.
 */
const CHECKED_SURFACE =
  'inset-ring-0 shadow-[0_1px_2px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.28)]';

const CHECKED_TONES: Record<Tone, string> = {
  neutral: `bg-foreground text-background ${CHECKED_SURFACE}`,
  brand: `bg-primary text-primary-foreground ${CHECKED_SURFACE}`,
  vivid: `bg-brand-vivid text-brand-vivid-foreground ${CHECKED_SURFACE}`,
  danger: `bg-destructive text-destructive-foreground ${CHECKED_SURFACE}`,
  success: `bg-success text-success-foreground ${CHECKED_SURFACE}`,
};

const ICON_SIZES: Record<Size, string> = {
  xs: 'size-2.5',
  sm: 'size-3',
  md: 'size-3.5',
  lg: 'size-3.5',
};

/** Le trait de l'indéterminé : une barre, pas une icône « moins » — les
 *  bouts ronds évitent l'air de bouton de contrôle de volume. */
const MIXED_SIZES: Record<Size, string> = {
  xs: 'h-[1.5px] w-[7px]',
  sm: 'h-[1.5px] w-2',
  md: 'h-[2px] w-[9px]',
  lg: 'h-[2px] w-2.5',
};

/** Le point, pour une sélection unique. Il hérite de la couleur du texte. */
const DOT_SIZES: Record<Size, string> = {
  xs: 'size-1.5',
  sm: 'size-[5px]',
  md: 'size-[6px]',
  lg: 'size-2',
};

/**
 * Ce que la case montre quand elle est cochée.
 *
 * - `check` : la coche, le cas par défaut — sans ambiguïté dans une liste.
 * - `dot`   : un point plein. Plus calme, et le seul indicateur qui reste
 *             lisible sur une case de 14 px ; c'est aussi ce qui permet de
 *             réutiliser la primitive là où la forme « radio » est attendue
 *             (colonne de sélection unique) sans en dupliquer une seconde.
 * - `none`  : rien. La couleur de la case EST l'état.
 *
 * ⚠️ `none` ne cache jamais l'indéterminé : un état partiel qui
 * ressemblerait à un état plein mentirait. Le trait reste, seule la coche
 * disparaît. Le nom accessible, lui, ne change jamais.
 */
export type CheckboxIndicator = 'check' | 'dot' | 'none';

export interface CheckboxProps extends Omit<AriaCheckboxProps, 'className' | 'children' | 'style'> {
  /** Libellé visible. Omis pour une case seule (colonne de tableau). */
  label?: ReactNode;
  /** Nom accessible quand il n'y a pas de libellé visible. */
  'aria-label'?: string;
  /** Texte secondaire, sous le libellé. */
  description?: ReactNode;
  size?: Size;
  /** Couleur de l'état coché. `neutral` par défaut : une case n'est pas un CTA. */
  tone?: Tone;
  /** Marque de l'état coché. Voir `CheckboxIndicator`. Défaut `check`. */
  indicator?: CheckboxIndicator;
  invalid?: boolean;
  className?: string;
}

export function Checkbox({
  label,
  description,
  size = 'md',
  tone = 'neutral',
  indicator = 'check',
  invalid = false,
  className,
  ...props
}: CheckboxProps) {
  return (
    <AriaCheckbox
      {...props}
      isInvalid={invalid}
      className={({ isDisabled }) =>
        cn(
          'group flex w-fit cursor-pointer items-start gap-2.5 select-none',
          isDisabled && 'cursor-not-allowed',
          className
        )
      }
    >
      {({ isSelected, isIndeterminate, isDisabled, isFocusVisible, isHovered, isPressed }) => (
        <>
          <span
            aria-hidden
            data-state={isIndeterminate ? 'mixed' : isSelected ? 'checked' : 'unchecked'}
            className={cn(
              'flex shrink-0 items-center justify-center',
              'transition-[background-color,box-shadow,color,scale] duration-150 ease-out',
              BOX_SIZES[size],
              BOX_OFFSET[size],
              // L'état est porté par la case, pas par une icône qui va et
              // vient : fond, liseré et glyphe suivent le même chemin.
              isSelected || isIndeterminate
                ? CHECKED_TONES[invalid ? 'danger' : tone]
                : cn(
                    // Un liseré intérieur plutôt qu'une bordure : il ne
                    // décale pas la case de 1 px au pivot, et il se voit
                    // aussi bien sur `--card` que sur `--background`.
                    'bg-foreground/[0.07] inset-ring-1 inset-ring-foreground/25',
                    invalid && 'inset-ring-destructive/60',
                    isHovered && 'bg-foreground/10 inset-ring-foreground/35',
                    isPressed && 'bg-foreground/15'
                  ),
              // ⚠️ Pas `FOCUS_RING` ici : ses variantes sont `focus-visible:*`,
              // or l'élément focalisé est l'input natif, pas ce span. Le ring
              // ne s'affichait donc jamais au clavier.
              isFocusVisible && 'ring-2 ring-ring/50 ring-offset-2 ring-offset-background',
              isPressed && 'scale-[0.92]',
              isDisabled && 'opacity-45'
            )}
          >
            {isIndeterminate ? (
              // Le trait, pas la coche : « partiel » ne doit pas ressembler
              // à « tout », même de loin. Il survit à `indicator="none"`.
              <span data-mixed className={cn('rounded-full bg-current', MIXED_SIZES[size])} />
            ) : isSelected ? (
              indicator === 'check' ? (
                <Check
                  className={cn(
                    ICON_SIZES[size],
                    // Montage animé : la coche sort de la case en grandissant.
                    // `motion-reduce` coupe l'effet, pas l'état.
                    'starting:scale-50 starting:opacity-0 transition-[transform,opacity] duration-150 ease-out motion-reduce:transition-none'
                  )}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : indicator === 'dot' ? (
                <span aria-hidden className={cn('rounded-full bg-current', DOT_SIZES[size])} />
              ) : null
            ) : null}
          </span>

          {(label || description) && (
            <span className="flex min-w-0 flex-col gap-0.5">
              {label && (
                <span
                  className={cn(
                    TEXT_SIZES[size],
                    'font-medium text-foreground',
                    isDisabled && 'opacity-45'
                  )}
                >
                  {label}
                </span>
              )}
              {description && (
                <span
                  className={cn(
                    'type-control-xs text-muted-foreground',
                    isDisabled && 'opacity-45'
                  )}
                >
                  {description}
                </span>
              )}
            </span>
          )}
        </>
      )}
    </AriaCheckbox>
  );
}

/** Alias d'import pour les évènements : `onChange` reçoit un booléen. */
export type { AriaCheckboxProps as CheckboxPrimitiveProps };
