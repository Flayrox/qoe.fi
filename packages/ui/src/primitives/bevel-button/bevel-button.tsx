'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@qoe/utils';

import { DISABLED, FOCUS_RING, ICON_SLOT, SIZE_CLASSES, type Size, type Tone } from '../contract';

// =====================================================================
// 🔘 BevelButton — un bouton qu'on sent sous le doigt
// =====================================================================
// 📖 Porté de la famille « three-d-button » d'opensourceui. L'idée n'est
//    pas l'ombre portée (tous les boutons en ont une) mais le biseau : un
//    liseré clair en haut, une ombre intérieure en bas, et une recette
//    *enfoncée* au relâchement. Le contrôle a une épaisseur.
//
// 🎯 Ce qui a été repris : la pile de trois ombres externes + deux
//    internes, l'ombre qui s'inverse au clic, et la transition qui porte
//    sur `box-shadow` (jamais sur `transition: all`, qui anime le texte).
//
// ⚠️ Ce qui n'a PAS été repris : les gris codés en dur (`neutral-800`,
//    `neutral-50`, les `rgba(255,255,255,0.35)` posés au hasard). Ici le
//    biseau est une recette unique, posée sur les tokens du thème, sinon
//    le bouton jure dès qu'on change de ton ou de thème.
//
// 🌓 En thème sombre, le biseau clair doit rester plus faible que le
//    remplissage, sinon le bouton paraît éclairé de l'intérieur. La
//    recette `soft` s'appuie donc sur `--card` et un liseré de bord : elle
//    fonctionne dans les deux thèmes sans variante.
// =====================================================================

/** Bords + relief haut, pour une surface claire (ou une carte). */
const BEVEL_LIGHT =
  'shadow-[0_0_0_1px_var(--border),0_1px_1px_rgba(0,0,0,0.05),0_2px_3px_rgba(0,0,0,0.07),inset_0_1px_1px_rgba(255,255,255,0.65),inset_0_-2px_3px_rgba(0,0,0,0.06)]';
const PRESSED_LIGHT =
  'active:shadow-[0_0_0_1px_var(--border),inset_0_1px_2px_rgba(0,0,0,0.10),inset_0_2px_4px_rgba(0,0,0,0.05)]';

/** Relief profond, pour une surface pleine (le bouton « touche »). */
const BEVEL_DARK =
  'shadow-[0_1px_1px_rgba(0,0,0,0.30),0_3px_6px_rgba(0,0,0,0.22),0_8px_16px_rgba(0,0,0,0.16),inset_0_1px_2px_rgba(255,255,255,0.22),inset_0_-3px_6px_rgba(0,0,0,0.35)]';
const PRESSED_DARK =
  'active:shadow-[0_1px_2px_rgba(0,0,0,0.20),inset_0_2px_6px_rgba(0,0,0,0.40),inset_0_-1px_1px_rgba(255,255,255,0.08)]';

const SOLID_TONES: Record<Tone, string> = {
  neutral: 'bg-foreground text-background',
  brand: 'bg-primary text-primary-foreground',
  vivid: 'bg-brand-vivid text-brand-vivid-foreground',
  danger: 'bg-destructive text-destructive-foreground',
  success: 'bg-success text-success-foreground',
};

const SOFT_TONES: Record<Tone, string> = {
  neutral: 'bg-card text-foreground hover:bg-secondary',
  brand: 'bg-primary/10 text-primary hover:bg-primary/15',
  vivid: 'bg-brand-vivid/15 text-brand-vivid-strong hover:bg-brand-vivid/20',
  danger: 'bg-destructive/10 text-destructive-text hover:bg-destructive/15',
  success: 'bg-success/15 text-success-text hover:bg-success/25',
};

export interface BevelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `solid` = touche sombre, `soft` = touche claire. Défaut `solid`. */
  variant?: 'solid' | 'soft';
  tone?: Tone;
  size?: Size;
  /** Bouton carré, sans padding horizontal (l'icône seule). */
  iconOnly?: boolean;
}

export const BevelButton = forwardRef<HTMLButtonElement, BevelButtonProps>(function BevelButton(
  {
    variant = 'solid',
    tone = 'neutral',
    size = 'md',
    iconOnly = false,
    className,
    type = 'button',
    ...props
  },
  ref
) {
  const solid = variant === 'solid';

  return (
    <button
      ref={ref}
      type={type}
      data-bevel={variant}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center rounded-control font-medium select-none',
        'transition-[background-color,box-shadow,color,transform] duration-200 ease-out',
        'motion-reduce:transition-none',
        SIZE_CLASSES[size],
        iconOnly && 'aspect-square px-0',
        solid ? SOLID_TONES[tone] : SOFT_TONES[tone],
        solid ? BEVEL_DARK : BEVEL_LIGHT,
        solid ? PRESSED_DARK : PRESSED_LIGHT,
        // Le contrôle s'enfonce d'un pixel : c'est ce qui distingue un
        // bouton d'une image de bouton, plus que l'ombre elle-même.
        'active:translate-y-px',
        FOCUS_RING,
        DISABLED,
        ICON_SLOT,
        className
      )}
      {...props}
    />
  );
});
