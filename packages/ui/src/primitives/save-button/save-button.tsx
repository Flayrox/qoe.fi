'use client';

import { forwardRef, useState, type ButtonHTMLAttributes } from 'react';
import { Bookmark } from 'lucide-react';

import { cn } from '@qoe/utils';

import { buttonClasses } from '../button/button';
import type { Size, Tone, Variant } from '../contract';

// =====================================================================
// 🔖 SaveButton — enregistrer, avec un état qui se voit
// =====================================================================
// 📖 Porté de la famille « bookmark-save-button » d'opensourceui : un
//    bouton à bascule, pas un bouton qui déclenche une action. Le signet
//    se remplit, le libellé passe de « Enregistrer » à « Enregistré ».
//
// 🎯 L'état est porté par `aria-pressed`, pas par la couleur. Un bouton
//    qui ne change que d'apparence est, pour un lecteur d'écran, un bouton
//    qui n'a rien fait.
//
// ⚠️ La référence animait aussi la taille de l'icône (scale 1.1) et sa
//    `drop-shadow` colorée. Ici seule l'icône se remplit : trois effets
//    simultanés sur un contrôle de 28 px, c'est du bruit.
//
// 📐 Contrôlé ou non : `saved` + `onSavedChange` pour un état serveur,
//    `defaultSaved` pour un cas local.
// =====================================================================

export interface SaveButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'value'
> {
  /** État contrôlé. */
  saved?: boolean;
  /** État initial quand le bouton gère lui-même sa bascule. */
  defaultSaved?: boolean;
  /** Appelé à chaque bascule, avant la mise à jour visuelle. */
  onSavedChange?: (saved: boolean) => void;
  /** Libellé au repos. Défaut « Enregistrer ». */
  label?: string;
  /** Libellé une fois enregistré. Défaut « Enregistré ». */
  savedLabel?: string;
  variant?: Variant;
  tone?: Tone;
  size?: Size;
  className?: string;
}

const LAYER = 'col-start-1 row-start-1 text-left transition-opacity duration-200 ease-out';

export const SaveButton = forwardRef<HTMLButtonElement, SaveButtonProps>(function SaveButton(
  {
    saved,
    defaultSaved = false,
    onSavedChange,
    label = 'Enregistrer',
    savedLabel = 'Enregistré',
    variant = 'soft',
    tone = 'neutral',
    size = 'sm',
    className,
    onClick,
    type = 'button',
    ...props
  },
  ref
) {
  const [internal, setInternal] = useState(defaultSaved);
  const isSaved = saved ?? internal;

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    const next = !isSaved;
    if (saved === undefined) setInternal(next);
    onSavedChange?.(next);
  };

  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={isSaved}
      data-saved={isSaved || undefined}
      onClick={handleClick}
      className={cn(buttonClasses({ variant, tone, size, className }))}
      {...props}
    >
      <Bookmark
        aria-hidden
        className={cn(
          'size-3.5 shrink-0 transition-[fill,color,transform] duration-200 ease-out',
          'motion-reduce:transition-none',
          isSaved ? 'scale-100 fill-current' : 'scale-95 fill-transparent'
        )}
        strokeWidth={1.75}
      />

      <span className="grid">
        <span aria-hidden={isSaved} className={cn(LAYER, isSaved ? 'opacity-0' : 'opacity-100')}>
          {label}
        </span>
        <span
          aria-hidden={!isSaved}
          className={cn(LAYER, 'text-primary', isSaved ? 'opacity-100' : 'opacity-0')}
        >
          {savedLabel}
        </span>
      </span>
    </button>
  );
});
