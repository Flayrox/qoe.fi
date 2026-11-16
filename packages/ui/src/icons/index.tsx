'use client';

import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import { cn } from '@qoe/utils';

import { ICON_SIZES, ICON_STROKE, type IconSize } from '../primitives/contract';
import { ICONS, type IconName } from './registry';

// =====================================================================
// 🧭 Icon — une icône nommée, jamais un dessin importé au hasard
// =====================================================================
// 📖 `<Icon name="trash" />` remplace `import { Trash2 } from 'lucide-react'`.
//
//    Trois garanties qu'un import direct ne donne pas :
//    - le nom est typé : une icône absente du registre ne compile pas ;
//    - la taille vient de l'échelle (xs → lg), pas d'un `size-4` local ;
//    - l'épaisseur de trait est unique (1.5), donc deux icônes voisines ne
//      se disputent jamais la graisse.
//
// 🎯 Une icône est décorative par défaut (`aria-hidden`). Elle ne devient
//    signifiante que si l'appelant fournit `label` : dans ce cas elle porte
//    `role="img"` et son nom. Un bouton icône seul doit passer par
//    `<IconButton label="…">`, qui pose le nom sur le bouton.
// =====================================================================

export interface IconProps extends Omit<LucideProps, 'ref' | 'size'> {
  /** Clé du registre (`arrow-up-right`, `circle-check`…). */
  name: IconName;
  /** Densité : xs 12 px, sm 14 px, md 16 px, lg 20 px. */
  size?: IconSize;
  /**
   * Nom accessible. Omis = icône décorative. Ne jamais le passer quand un
   * texte voisin dit déjà la même chose.
   */
  label?: string;
}

export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, size = 'sm', label, strokeWidth = ICON_STROKE.regular, className, ...props },
  ref
) {
  const Glyph = ICONS[name];

  return (
    <Glyph
      {...props}
      ref={ref}
      strokeWidth={strokeWidth}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(ICON_SIZES[size], 'shrink-0', className)}
    />
  );
});

export { ICONS, ICON_NAMES, ICON_GROUPS, type IconName } from './registry';
