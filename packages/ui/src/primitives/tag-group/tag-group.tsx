'use client';

import { XIcon } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';
import {
  Button as AriaButton,
  Label as AriaLabel,
  Tag as AriaTag,
  TagGroup as AriaTagGroup,
  TagList as AriaTagList,
  type Key,
  type Selection,
  type TagGroupProps as AriaTagGroupProps,
} from 'react-aria-components';

import { cn } from '@qoe/utils';

import { DISABLED, FOCUS_RING, ICON_SLOT } from '../contract';

// =====================================================================
// 🏷️ TagGroup — chips de filtrage et d'étiquettes, sur react-aria
// =====================================================================
// 📖 Spécimen 05 : rayon de l'échelle (`rounded-control`, jamais pilule),
//    sélection portée par la surface :
//    - en choix `multiple` : fond franc (`bg-foreground text-background`)
//      + croix discrète signalant qu'un second clic retire le filtre ;
//    - en choix `single` : surface creusée (`border-foreground/60 bg-muted/40`)
//      pour distinguer visuellement l'exclusivité d'un cumul de filtres.
//    Navigation aux flèches, Espace/Entrée pour basculer, Retour arrière /
//    Suppr quand `onRemove` est fourni.
// =====================================================================

export type TagSize = 'xs' | 'sm' | 'md';
export type TagSelectionMode = 'none' | 'single' | 'multiple';

interface TagGroupStyleContextValue {
  size: TagSize;
  selectionMode: TagSelectionMode;
}

const TagGroupStyleContext = createContext<TagGroupStyleContextValue>({
  size: 'sm',
  selectionMode: 'multiple',
});

const TAG_SIZES: Record<TagSize, string> = {
  xs: 'h-control-xs gap-1 px-2 type-control-xs',
  sm: 'h-control-sm gap-1.5 px-2.5 type-control-sm',
  md: 'h-control-md gap-1.5 px-3 type-control-md',
};

export interface TagGroupProps extends Omit<AriaTagGroupProps, 'children' | 'className'> {
  children: ReactNode;
  label?: ReactNode;
  size?: TagSize;
  selectionMode?: TagSelectionMode;
  selectedKeys?: 'all' | Iterable<Key>;
  defaultSelectedKeys?: 'all' | Iterable<Key>;
  onSelectionChange?: (keys: Selection) => void;
  onRemove?: (keys: Set<Key>) => void;
  className?: string;
}

export function TagGroup({
  children,
  label,
  size = 'sm',
  selectionMode = 'multiple',
  className,
  ...props
}: TagGroupProps) {
  return (
    <TagGroupStyleContext.Provider value={{ size, selectionMode }}>
      <AriaTagGroup
        selectionMode={selectionMode}
        className={cn('grid gap-1.5', className)}
        {...props}
      >
        {label && (
          <AriaLabel className="type-control-sm font-medium text-foreground">{label}</AriaLabel>
        )}
        {children}
      </AriaTagGroup>
    </TagGroupStyleContext.Provider>
  );
}

export interface TagListProps<T extends object = object> {
  children: ReactNode | ((item: T) => ReactNode);
  items?: Iterable<T>;
  renderEmptyState?: () => ReactNode;
  className?: string;
}

export function TagList<T extends object = object>({
  children,
  items,
  renderEmptyState,
  className,
}: TagListProps<T>) {
  return (
    <AriaTagList
      items={items}
      renderEmptyState={renderEmptyState}
      className={cn('flex flex-wrap items-center gap-1.5 outline-none', className)}
    >
      {children}
    </AriaTagList>
  );
}

export interface TagProps {
  id: string;
  children: ReactNode;
  textValue?: string;
  /** Compteur optionnel affiché en chasse fixe. */
  count?: number | string;
  /** Masque l'indicateur `×` en mode `multiple` si souhaité. */
  showToggleClearIcon?: boolean;
  isDisabled?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Tag({
  id,
  children,
  textValue,
  count,
  showToggleClearIcon = true,
  isDisabled,
  disabled,
  className,
}: TagProps) {
  const { size, selectionMode } = useContext(TagGroupStyleContext);
  const resolvedDisabled = isDisabled ?? disabled;
  const resolvedTextValue = textValue ?? (typeof children === 'string' ? children : undefined);

  return (
    <AriaTag
      id={id}
      textValue={resolvedTextValue}
      isDisabled={resolvedDisabled}
      className={cn(
        'inline-flex shrink-0 select-none items-center rounded-control border transition-colors',
        selectionMode !== 'none' && 'cursor-pointer',
        TAG_SIZES[size],
        FOCUS_RING,
        DISABLED,
        ICON_SLOT,
        'border-border/50 bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        selectionMode === 'multiple' &&
          'data-[selected]:border-transparent data-[selected]:bg-foreground data-[selected]:text-background data-[selected]:hover:bg-foreground/90 data-[selected]:hover:text-background',
        selectionMode === 'single' &&
          'data-[selected]:border-foreground/60 data-[selected]:bg-muted/40 data-[selected]:font-medium data-[selected]:text-foreground',
        className
      )}
    >
      {({ allowsRemoving, isSelected }) => (
        <>
          <span>{children}</span>
          {count !== undefined && (
            <span className="font-mono text-[10.5px] tabular-nums opacity-70">{count}</span>
          )}
          {allowsRemoving ? (
            <AriaButton
              slot="remove"
              aria-label="Retirer"
              className="ml-0.5 grid size-3.5 place-items-center rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none"
            >
              <XIcon className="size-3" strokeWidth={2} />
            </AriaButton>
          ) : (
            selectionMode === 'multiple' &&
            showToggleClearIcon &&
            isSelected && <XIcon aria-hidden className="size-3 opacity-70" strokeWidth={2} />
          )}
        </>
      )}
    </AriaTag>
  );
}
