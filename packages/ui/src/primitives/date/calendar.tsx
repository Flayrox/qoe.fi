'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Button as AriaButton,
  Calendar as AriaCalendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Heading,
  RangeCalendar as AriaRangeCalendar,
  Text,
  type CalendarProps,
  type DateValue,
  type RangeCalendarProps,
} from 'react-aria-components';

import { cn } from '@qoe/utils';

import { buttonClasses } from '../button/button';

// =====================================================================
// 📅 Calendar — grille mensuelle
// =====================================================================
// 📖 react-aria fournit la mécanique (flèches, PageUp/Down, Home/End,
//    sélection de plage au clavier, calendriers non grégoriens, locale).
//
// 🎨 Le dessin suit la grammaire de HeroUI : en-tête à gauche et flèches à
//    droite, grille sans gouttières, cellules rondes de la largeur d'une
//    colonne, aujourd'hui en teinte douce, sélection pleine, jours hors
//    mois atténués, dates indisponibles barrées.
//
// 💡 La grille est un `<table>` rendu en `display: grid` : sémantique de
//    tableau pour les lecteurs d'écran, alignement parfait des 7 colonnes
//    qu'une table ne garantit pas.
//
// ⚠️ Les états viennent des booléens du render prop, pas d'utilitaires
//    `data-[…]` : deux variants de même spécificité (`data-hovered` et
//    `data-selected`) se départagent par l'ordre du CSS généré, donc par
//    accident. Un booléen dit explicitement lequel gagne.
// =====================================================================

/** 7 colonnes de 36 px : c'est ce qui garde les cases rondes. */
const CALENDAR_WIDTH = 'w-[268px]';

const BASE_CELL =
  'relative flex aspect-square size-full items-center justify-center rounded-full ' +
  'type-control-sm font-medium outline-hidden select-none ' +
  'transition-[scale,background-color] duration-150 ease-out';

function cellClass({
  isSelected,
  isSelectionStart,
  isSelectionEnd,
  isToday,
  isOutsideMonth,
  isUnavailable,
  isDisabled,
  isFocusVisible,
  isPressed,
  isHovered,
  range,
}: {
  isSelected: boolean;
  isSelectionStart: boolean;
  isSelectionEnd: boolean;
  isToday: boolean;
  isOutsideMonth: boolean;
  isUnavailable: boolean;
  isDisabled: boolean;
  isFocusVisible: boolean;
  isPressed: boolean;
  isHovered: boolean;
  range: boolean;
}) {
  const inactive = isUnavailable || isDisabled;

  return cn(
    BASE_CELL,
    // Fond : le rail de plage remplace le survol quand le jour est déjà pris.
    !isSelected && isHovered && !inactive && 'bg-secondary',
    isToday && !isSelected && !inactive && 'bg-primary/10 text-primary',
    isSelected &&
      (range ? 'rounded-none bg-primary/10 text-foreground' : 'bg-primary text-primary-foreground'),
    isSelected &&
      (isSelectionStart || isSelectionEnd) &&
      'rounded-full bg-primary text-primary-foreground',
    isSelected && isHovered && !isSelectionStart && !isSelectionEnd && 'bg-primary/15',
    isPressed && 'scale-95',
    isOutsideMonth && 'text-muted-foreground opacity-50',
    isOutsideMonth && isSelected && 'bg-transparent',
    inactive && 'line-through opacity-50',
    isFocusVisible && 'shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--ring)]'
  );
}

function NavButton({
  slot,
  children,
  label,
}: {
  slot: 'previous' | 'next';
  children: ReactNode;
  label: string;
}) {
  return (
    <AriaButton
      slot={slot}
      aria-label={label}
      className={cn(
        buttonClasses({ variant: 'ghost', size: 'xs', shape: 'icon' }),
        'size-7 shrink-0 rounded-full active:scale-95'
      )}
    >
      {children}
    </AriaButton>
  );
}

function CalendarHeader() {
  return (
    <header className="flex items-center gap-1 px-0.5 pb-3">
      {/* Le titre pousse les flèches à droite : on lit « mars 2026 »
          d'abord, on navigue ensuite. */}
      <Heading className="flex-1 type-control-md font-medium text-foreground" />
      <NavButton slot="previous" label="Mois précédent">
        <ChevronLeft className="size-4" strokeWidth={1.75} />
      </NavButton>
      <NavButton slot="next" label="Mois suivant">
        <ChevronRight className="size-4" strokeWidth={1.75} />
      </NavButton>
    </header>
  );
}

/** thead/tbody/tr en `contents` : les cellules deviennent les vraies colonnes. */
const GRID_PARTS = 'contents [&>tr]:contents';

function Grid({ range = false }: { range?: boolean }) {
  return (
    <CalendarGrid className="grid w-full grid-cols-7">
      <CalendarGridHeader className={GRID_PARTS}>
        {(day) => (
          <CalendarHeaderCell className="flex items-center justify-center pb-1 type-control-xs font-medium text-muted-foreground">
            {day}
          </CalendarHeaderCell>
        )}
      </CalendarGridHeader>
      <CalendarGridBody className={GRID_PARTS}>
        {(date) => (
          <CalendarCell date={date} className={(state) => cellClass({ ...state, range })} />
        )}
      </CalendarGridBody>
    </CalendarGrid>
  );
}

export type CalendarPrimitiveProps = CalendarProps<DateValue, 'single'> & { className?: string };

/**
 * Calendrier simple, une date.
 * Sans `aria-label`, il reste utilisable au clavier mais est annoncé
 * « calendrier » : nommez-le.
 */
export function Calendar({ className, ...props }: CalendarPrimitiveProps) {
  return (
    <AriaCalendar
      {...props}
      className={cn(CALENDAR_WIDTH, 'rounded-panel bg-popover p-3', className)}
    >
      <CalendarHeader />
      <Grid />
    </AriaCalendar>
  );
}

export type RangeCalendarPrimitiveProps = RangeCalendarProps<DateValue> & { className?: string };

/**
 * Calendrier de plage. Sélection au clavier aussi : flèches pour étendre,
 * Entrée pour valider la fin.
 */
export function RangeCalendar({ className, ...props }: RangeCalendarPrimitiveProps) {
  return (
    <AriaRangeCalendar
      {...props}
      className={cn(CALENDAR_WIDTH, 'rounded-panel bg-popover p-3', className)}
    >
      <CalendarHeader />
      <Grid range />
    </AriaRangeCalendar>
  );
}

/** Texte secondaire d'un calendrier (fuseau, aide). */
export function CalendarNote({ children }: { children: ReactNode }) {
  return (
    <Text slot="description" className="mt-2 block type-control-xs text-muted-foreground">
      {children}
    </Text>
  );
}
