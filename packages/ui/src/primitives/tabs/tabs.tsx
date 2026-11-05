'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  type Key,
  type TabsProps as AriaTabsProps,
} from 'react-aria-components';

import { cn } from '@qoe/utils';

import { DISABLED, FOCUS_RING, ICON_SLOT, SIZE_CLASSES, type Size } from '../contract';

// =====================================================================
// 🗂️ Tabs — sélecteur segmenté en creux & onglets soulignés sobres
// =====================================================================
// 📖 Une seule mécanique (react-aria `Tabs` : `role="tablist"`, navigation
//    aux flèches, Home/End, liaison `aria-controls` ↔ `aria-labelledby`),
//    deux peaux validées dans le Spécimen 03 :
//    - `segmented` : rail en creux (`bg-muted/40`), l'onglet actif remonte
//      en surface (`bg-background shadow-xs`). Supporte également `iconOnly`
//      avec infobulle flottante au survol.
//    - `segmented-square` : alias rétrocompatible du format segmenté en creux.
//    - `underline` : trait bas sobre (`border-foreground`, jamais primaire :
//      on signale un lieu, pas une action) à hauteur fixe (`h-control-*`).
//      Pour les sections d'une page (Profil, Réglages, Analytics).
// =====================================================================

export type TabsVariant = 'segmented' | 'segmented-square' | 'underline';

interface TabsStyleContextValue {
  variant: TabsVariant;
  size: Size;
}

const TabsStyleContext = createContext<TabsStyleContextValue>({
  variant: 'segmented',
  size: 'sm',
});

/**
 * Dans un rail `segmented` doté de `p-0.5` (2 px haut + 2 px bas = 4 px),
 * l'onglet intérieur perd 4 px pour que le rail entier tombe pile sur
 * `h-control-*` (24 / 28 / 32 / 36 px) à côté d'un `Button` de même densité.
 */
const SEGMENTED_ITEM_SIZES: Record<Size, string> = {
  xs: 'h-5 gap-1 px-2 type-control-xs',
  sm: 'h-6 gap-1.5 px-2.5 type-control-sm',
  md: 'h-7 gap-1.5 px-3 type-control-md',
  lg: 'h-8 gap-2 px-3.5 type-control-lg',
};

const UNDERLINE_ITEM_SIZES: Record<Size, string> = {
  xs: cn(SIZE_CLASSES.xs, 'px-0.5'),
  sm: cn(SIZE_CLASSES.sm, 'px-0.5'),
  md: cn(SIZE_CLASSES.md, 'px-0.5'),
  lg: cn(SIZE_CLASSES.lg, 'px-0.5'),
};

export interface TabsProps extends Omit<
  AriaTabsProps,
  'children' | 'className' | 'selectedKey' | 'defaultSelectedKey' | 'onSelectionChange'
> {
  children: ReactNode;
  variant?: TabsVariant;
  size?: Size;
  selectedKey?: Key;
  defaultSelectedKey?: Key;
  onSelectionChange?: (key: Key) => void;
  /** Alias ergonomique pour les chaînes simples, symétrique à `Select` / `RadioGroup`. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

export function Tabs({
  children,
  variant = 'segmented',
  size = 'sm',
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  value,
  defaultValue,
  onValueChange,
  className,
  ...props
}: TabsProps) {
  const resolvedSelectedKey = selectedKey ?? value;
  const resolvedDefaultKey = defaultSelectedKey ?? defaultValue;

  const handleSelectionChange = (key: Key) => {
    onSelectionChange?.(key);
    onValueChange?.(String(key));
  };

  return (
    <TabsStyleContext.Provider value={{ variant, size }}>
      <AriaTabs
        selectedKey={resolvedSelectedKey}
        defaultSelectedKey={resolvedDefaultKey}
        onSelectionChange={handleSelectionChange}
        className={cn('flex flex-col', className)}
        {...props}
      >
        {children}
      </AriaTabs>
    </TabsStyleContext.Provider>
  );
}

export interface TabListProps {
  children: ReactNode;
  'aria-label'?: string;
  className?: string;
}

export function TabList({ children, 'aria-label': ariaLabel, className }: TabListProps) {
  const { variant } = useContext(TabsStyleContext);

  return (
    <AriaTabList
      aria-label={ariaLabel}
      data-variant={variant}
      className={cn(
        (variant === 'segmented' || variant === 'segmented-square') &&
          'inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-control bg-muted/40 p-0.5',
        variant === 'underline' &&
          'flex w-full items-center gap-5 overflow-x-auto border-b border-border/50',
        className
      )}
    >
      {children}
    </AriaTabList>
  );
}

export interface TabProps {
  id: string;
  /** Libellé. Reste le nom accessible quand l'onglet est en icône seule. */
  children: ReactNode;
  /** Icône affichée avant le libellé, ou seule. */
  icon?: LucideIcon;
  /**
   * Icône seule : le libellé quitte le rendu visuel et devient le nom
   * accessible (`aria-label`) et l'infobulle.
   */
  iconOnly?: boolean;
  /** Texte de l'infobulle. Par défaut, le libellé. */
  tooltip?: ReactNode;
  /** Compteur optionnel affiché en chasse fixe à droite du libellé. */
  count?: number | string;
  isDisabled?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Tab({
  id,
  children,
  icon: Icon,
  iconOnly = false,
  tooltip,
  count,
  isDisabled,
  disabled,
  className,
}: TabProps) {
  const { variant, size } = useContext(TabsStyleContext);
  const resolvedDisabled = isDisabled ?? disabled;
  const isIconOnly = iconOnly && Boolean(Icon);
  const labelText =
    typeof tooltip === 'string' ? tooltip : typeof children === 'string' ? children : undefined;
  const accessibleName = isIconOnly ? labelText : undefined;

  const tab = (
    <AriaTab
      id={id}
      isDisabled={resolvedDisabled}
      aria-label={accessibleName}
      className={cn(
        'group/tab relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap transition-colors',
        FOCUS_RING,
        DISABLED,
        ICON_SLOT,
        variant !== 'underline'
          ? [
              SEGMENTED_ITEM_SIZES[size],
              'rounded-[max(calc(var(--radius-button)-2px),4px)] font-normal text-muted-foreground hover:text-foreground',
              'data-[selected]:bg-background data-[selected]:font-medium data-[selected]:text-foreground data-[selected]:shadow-xs',
              isIconOnly && 'aspect-square px-0',
            ]
          : [
              UNDERLINE_ITEM_SIZES[size],
              '-mb-px border-b-2 border-transparent font-medium text-muted-foreground hover:text-foreground',
              'data-[selected]:border-foreground data-[selected]:font-semibold data-[selected]:text-foreground',
            ],
        className
      )}
    >
      {Icon && (
        <Icon
          aria-hidden
          className={cn('shrink-0', isIconOnly ? 'size-4' : 'size-3.5')}
          strokeWidth={1.75}
        />
      )}
      {!isIconOnly && <span>{children}</span>}
      {count !== undefined && !isIconOnly && (
        <span
          className={cn(
            'font-mono text-[10.5px] tabular-nums transition-colors',
            'text-muted-foreground/70 group-data-[selected]/tab:text-muted-foreground'
          )}
        >
          {count}
        </span>
      )}
      {isIconOnly && labelText && (
        <span
          role="tooltip"
          aria-hidden
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 hidden group-hover/tab:flex group-focus-visible/tab:flex whitespace-nowrap rounded-control bg-foreground px-2 py-1 type-control-xs font-medium text-background shadow-md transition duration-150"
        >
          {labelText}
        </span>
      )}
    </AriaTab>
  );

  return tab;
}

export interface TabPanelProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ id, children, className }: TabPanelProps) {
  return (
    <AriaTabPanel id={id} className={cn('mt-3 outline-none', FOCUS_RING, className)}>
      {children}
    </AriaTabPanel>
  );
}
