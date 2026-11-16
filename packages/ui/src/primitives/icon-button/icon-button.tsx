'use client';

import { forwardRef, type ReactNode } from 'react';

import { Button, type ButtonProps } from '../button/button';
import { Tooltip, type TooltipPlacement } from '../tooltip/tooltip';

// =====================================================================
// 🔲 IconButton — une action sans libellé, mais jamais sans nom
// =====================================================================
// 📖 `<Button shape="icon">` existe déjà ; `IconButton` ajoute la partie
//    qu'on oublie systématiquement : le nom accessible.
//
//    `label` est obligatoire et sert deux fois — `aria-label` sur le bouton
//    (le lecteur d'écran), et l'infobulle (le voyant). Un bouton icône sans
//    nom est invisible pour un lecteur d'écran ; le rendre obligatoire par
//    le type supprime la catégorie entière d'oubli.
//
// 🎯 Le bouton reste carré par construction (`aspect-square`, padding
//    horizontal nul) et suit les densités du contrat : 24, 28, 32, 36 px.
// =====================================================================

export interface IconButtonProps extends Omit<
  ButtonProps,
  'shape' | 'children' | 'aria-label' | 'block'
> {
  /** Nom accessible, aussi affiché en infobulle. Obligatoire. */
  label: string;
  /** L'icône, passée comme enfant : `<IconButton label="Fermer"><Icon name="x" /></IconButton>`. */
  children: ReactNode;
  /** `false` retire l'infobulle quand le contexte est déjà évident (barre d'outils dense). */
  tooltip?: boolean;
  tooltipPlacement?: TooltipPlacement;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    children,
    tooltip = true,
    tooltipPlacement = 'top',
    variant = 'ghost',
    size = 'sm',
    ...props
  },
  ref
) {
  return (
    <Tooltip content={tooltip ? label : null} placement={tooltipPlacement}>
      <Button {...props} ref={ref} shape="icon" size={size} variant={variant} aria-label={label}>
        {children}
      </Button>
    </Tooltip>
  );
});
