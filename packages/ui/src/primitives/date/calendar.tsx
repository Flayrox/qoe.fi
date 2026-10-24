'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
// 📅 Calendar — grille mensuelle, sur react-aria
// =====================================================================
// 📖 react-aria fournit la partie qu'on réimplémente toujours mal : la
//    navigation clavier (flèches par jour, PageUp/Down par mois, Home/End
//    par semaine), les dates désactivées, la sélection de plage au clavier,
//    et l'internationalisation (semaine commençant le lundi, calendriers
//    non grégoriens).
//
// 🎯 Ce qui reste ici : la grille de 7 colonnes, la densité des cellules et
//    les états visuels — tous en tokens.
//
// 💡 `locale` n'est pas imposée : react-aria lit l'`I18nProvider` de l'app,
//    sinon la langue du navigateur. Coder `fr-FR` ici rendrait le composant
//    faux pour la moitié des utilisateurs.
// =====================================================================

const CELL = 'grid size-8 place-items-center rounded-control type-control-sm';

/** Bouton de navigation (mois précédent / suivant). */
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
      className={buttonClasses({ variant: 'ghost', size: 'xs', shape: 'icon' })}
    >
      {children}
    </AriaButton>
  );
}

function CalendarHeader() {
  return (
    <header className="flex items-center justify-between gap-1 pb-2">
      <NavButton slot="previous" label="Mois précédent">
        <ChevronLeft className="size-4" strokeWidth={1.75} />
      </NavButton>
      {/* `Heading` lit le mois affiché dans le contexte react-aria : pas de
          texte à recalculer, et il reste synchronisé avec la navigation. */}
      <Heading className="type-control-md font-medium text-foreground" />
      <NavButton slot="next" label="Mois suivant">
        <ChevronRight className="size-4" strokeWidth={1.75} />
      </NavButton>
    </header>
  );
}

function Grid() {
  return (
    <CalendarGrid className="w-full border-separate border-spacing-y-0.5">
      <CalendarGridHeader>
        {(day) => (
          <CalendarHeaderCell className="pb-1 type-control-xs font-medium text-muted-foreground">
            {day}
          </CalendarHeaderCell>
        )}
      </CalendarGridHeader>
      <CalendarGridBody>
        {(date) => (
          <CalendarCell
            date={date}
            className={({ isSelected, isOutsideMonth, isUnavailable, isToday, isFocusVisible }) =>
              cn(
                CELL,
                'cursor-default outline-hidden transition-colors',
                // `data-*` plutôt que des classes conditionnelles pour la
                // plage : react-aria pose ces attributs sur les extrémités.
                'data-[hovered]:bg-secondary',
                isToday && !isSelected && 'ring-1 ring-ring/40',
                isOutsideMonth && 'text-muted-foreground/50',
                isUnavailable && 'pointer-events-none line-through opacity-40',
                isSelected && 'bg-primary text-primary-foreground data-[hovered]:bg-primary/90',
                // Milieu de plage : fond discret, sans texte inversé.
                'data-[selection-start]:bg-primary data-[selection-start]:text-primary-foreground',
                'data-[selection-end]:bg-primary data-[selection-end]:text-primary-foreground',
                'data-[selected]:not([data-selection-start]):not([data-selection-end]):bg-primary/10',
                isFocusVisible && 'ring-2 ring-ring/60 ring-offset-1 ring-offset-background'
              )
            }
          />
        )}
      </CalendarGridBody>
    </CalendarGrid>
  );
}

export type CalendarPrimitiveProps = CalendarProps<DateValue, 'single'> & { className?: string };

/**
 * Calendrier simple, une date.
 * Sans nom accessible, il reste utilisable au clavier mais est annoncé
 * « calendrier » : passez un `aria-label`.
 */
export function Calendar({ className, ...props }: CalendarPrimitiveProps) {
  return (
    <AriaCalendar {...props} className={cn('w-fit rounded-panel bg-popover p-3', className)}>
      <CalendarHeader />
      <Grid />
    </AriaCalendar>
  );
}

export type RangeCalendarPrimitiveProps = RangeCalendarProps<DateValue> & { className?: string };

/**
 * Calendrier de plage. La sélection se fait aussi au clavier : flèches pour
 * étendre la plage, Entrée pour valider la fin.
 */
export function RangeCalendar({ className, ...props }: RangeCalendarPrimitiveProps) {
  return (
    <AriaRangeCalendar {...props} className={cn('w-fit rounded-panel bg-popover p-3', className)}>
      <CalendarHeader />
      <Grid />
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
