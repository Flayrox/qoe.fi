'use client';

import type { Key, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button as AriaButton, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';

import { buttonClasses } from '../button/button';
import { MENU_POPOVER_WIDTH, MENU_SIZES, type Size, type Tone, type Variant } from '../contract';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Raccourci affiché à droite (`E`, `⌘K`). Purement informatif. */
  shortcut?: string;
  /** `danger` colore l'item et son survol, sans changer sa sémantique. */
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onAction: () => void;
}

export interface DropdownProps {
  /** Contenu du déclencheur (libellé, icône, avatar…). */
  label: ReactNode;
  /**
   * Nom accessible du déclencheur — donc du menu, que react-aria nomme par
   * son déclencheur (`aria-labelledby`). Obligatoire : un `⋯` sans nom est
   * annoncé « bouton », et le menu « menu ».
   */
  ariaLabel: string;
  items: DropdownItem[];
  align?: 'start' | 'end';
  /** Peau du déclencheur, alignée sur celle des boutons. */
  variant?: Variant;
  tone?: Tone;
  size?: Size;
  /** Icône de fin du déclencheur. `false` pour la retirer (ex. avatar). */
  chevron?: boolean;
  className?: string;
}

/**
 * Menu d'actions standard de qoe.fi.
 *
 * Le comportement (ouverture, navigation aux flèches, Échap, retour du focus
 * au déclencheur, clic extérieur, positionnement) vient de react-aria : on
 * ne le réimplémente pas. Ce qui est à nous : la densité, les tons, les
 * rayons et le rendu — tout en tokens.
 *
 * Remplace les menus maison (`useState(isOpen)` + `div absolute`) recensés
 * dans le lab : 18 fichiers gèrent encore leur ouverture à la main.
 */
export function Dropdown({
  label,
  ariaLabel,
  items,
  align = 'start',
  variant = 'outline',
  tone = 'neutral',
  size = 'sm',
  chevron = true,
  className,
}: DropdownProps) {
  const handleAction = (key: Key) => {
    items.find((item) => item.id === key)?.onAction();
  };

  return (
    <MenuTrigger>
      <AriaButton
        aria-label={ariaLabel}
        className={buttonClasses({
          variant,
          tone,
          size,
          className: className,
        })}
      >
        {label}
        {chevron && <ChevronDown className="text-muted-foreground" strokeWidth={1.5} />}
      </AriaButton>

      <Popover
        placement={align === 'end' ? 'bottom end' : 'bottom start'}
        offset={4}
        className={`${MENU_POPOVER_WIDTH} rounded-panel border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-hidden`}
      >
        <Menu aria-label={ariaLabel} onAction={handleAction} className="outline-hidden">
          {items.map((item) => (
            <MenuItem
              key={item.id}
              id={item.id}
              textValue={item.label}
              isDisabled={item.disabled}
              className={({ isFocused, isDisabled }) =>
                [
                  MENU_SIZES[size],
                  'flex cursor-default items-center gap-2 rounded-control outline-hidden select-none',
                  'transition-colors',
                  isDisabled && 'pointer-events-none opacity-50',
                  isFocused && (item.tone === 'danger' ? 'bg-destructive/10' : 'bg-secondary'),
                  item.tone === 'danger' ? 'text-destructive-text' : 'text-foreground',
                ]
                  .filter(Boolean)
                  .join(' ')
              }
            >
              {item.icon && (
                <span
                  className={
                    item.tone === 'danger'
                      ? 'flex size-4 shrink-0 items-center justify-center text-destructive-text [&_svg]:size-3.5'
                      : 'flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5'
                  }
                >
                  {item.icon}
                </span>
              )}
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <span className="ml-auto shrink-0 font-mono type-control-xs text-muted-foreground">
                  {item.shortcut}
                </span>
              )}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
