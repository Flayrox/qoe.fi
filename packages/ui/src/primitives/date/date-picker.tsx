'use client';

import type { ReactNode } from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import {
  Button as AriaButton,
  DateField as AriaDateField,
  DateInput,
  DatePicker as AriaDatePicker,
  DateRangePicker as AriaDateRangePicker,
  DateSegment,
  Group,
  Label,
  Popover,
  TimeField as AriaTimeField,
  type DateFieldProps,
  type DatePickerProps,
  type DateRangePickerProps,
  type DateValue,
  type TimeFieldProps,
  type TimeValue,
} from 'react-aria-components';

import { cn } from '@qoe/utils';

import { buttonClasses } from '../button/button';
import { Calendar, RangeCalendar } from './calendar';

// =====================================================================
// 📆 Champs de date — sur react-aria
// =====================================================================
// 📖 Le point commun de ces quatre composants : on ne saisit jamais une
//    chaîne « 12/03/2026 » à reparser. Chaque segment (jour, mois, année)
//    est une zone éditable, avec des bornes, et la valeur qui sort est un
//    `DateValue` — pas un texte dont le format dépend du clavier.
//
// 🎯 Ce qui reste ici : la peau du champ et la coquille du popover.
// =====================================================================

/**
 * Le champ lui-même : segments dans un cadre.
 * `Group` porte le cadre et l'anneau, comme `InputGroup` pour les champs
 * texte — sinon le clic sur l'icône ne donne pas le focus au champ.
 */
function FieldFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Group
      className={cn(
        'flex h-control-md w-full items-center gap-1 rounded-control border border-border bg-background px-2.5',
        'has-[[data-focus-visible]]:ring-2 has-[[data-focus-visible]]:ring-ring/60',
        'data-[invalid]:border-destructive',
        'data-[disabled]:opacity-50',
        className
      )}
    >
      {children}
    </Group>
  );
}

const SEGMENT =
  'rounded-[3px] px-0.5 type-control-md text-foreground tabular-nums outline-hidden ' +
  'data-[focused]:bg-primary data-[focused]:text-primary-foreground ' +
  'data-[placeholder]:text-muted-foreground data-[disabled]:opacity-60';

function Segments() {
  return (
    <DateInput className="flex flex-1 items-center gap-0.5">
      {(segment) => <DateSegment segment={segment} className={SEGMENT} />}
    </DateInput>
  );
}

export type DateFieldPrimitiveProps<T extends DateValue = DateValue> = DateFieldProps<T> & {
  label: string;
  hideLabel?: boolean;
  className?: string;
};

/** Champ de date seul : segments, sans calendrier. */
export function DateField<T extends DateValue>({
  label,
  hideLabel = false,
  className,
  ...props
}: DateFieldPrimitiveProps<T>) {
  return (
    <AriaDateField {...props} className={cn('flex flex-col gap-1.5', className)}>
      {!hideLabel && <Label className="type-control-sm font-medium text-foreground">{label}</Label>}
      <FieldFrame>
        {hideLabel && <span className="sr-only">{label}</span>}
        <Segments />
      </FieldFrame>
    </AriaDateField>
  );
}

export type TimeFieldPrimitiveProps<T extends TimeValue = TimeValue> = TimeFieldProps<T> & {
  label: string;
  hideLabel?: boolean;
  className?: string;
};

/** Champ d'heure seul (24 h ou 12 h selon la locale). */
export function TimeField<T extends TimeValue>({
  label,
  hideLabel = false,
  className,
  ...props
}: TimeFieldPrimitiveProps<T>) {
  return (
    <AriaTimeField {...props} className={cn('flex flex-col gap-1.5', className)}>
      {!hideLabel && <Label className="type-control-sm font-medium text-foreground">{label}</Label>}
      <FieldFrame>
        {hideLabel && <span className="sr-only">{label}</span>}
        <Clock aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <Segments />
      </FieldFrame>
    </AriaTimeField>
  );
}

export type DatePickerPrimitiveProps<T extends DateValue = DateValue> = DatePickerProps<T> & {
  label: string;
  hideLabel?: boolean;
  className?: string;
};

/**
 * Champ + calendrier dans un popover.
 * Le déclencheur est un vrai bouton (nommé), pas une icône cliquable : au
 * clavier, on atteint la date et le calendrier séparément.
 */
export function DatePicker<T extends DateValue>({
  label,
  hideLabel = false,
  className,
  ...props
}: DatePickerPrimitiveProps<T>) {
  return (
    <AriaDatePicker {...props} className={cn('flex flex-col gap-1.5', className)}>
      {!hideLabel && <Label className="type-control-sm font-medium text-foreground">{label}</Label>}
      <FieldFrame>
        {hideLabel && <span className="sr-only">{label}</span>}
        <Segments />
        <AriaButton
          aria-label={label}
          className={buttonClasses({
            variant: 'ghost',
            size: 'xs',
            shape: 'icon',
            className: 'shrink-0',
          })}
        >
          <CalendarDays className="size-3.5" strokeWidth={1.75} />
        </AriaButton>
      </FieldFrame>
      <Popover className="rounded-panel border border-border bg-popover shadow-lg outline-hidden">
        <Calendar />
      </Popover>
    </AriaDatePicker>
  );
}

export type DateRangePickerPrimitiveProps<T extends DateValue = DateValue> =
  DateRangePickerProps<T> & {
    label: string;
    hideLabel?: boolean;
    className?: string;
  };

/**
 * Deux champs (début, fin) et un calendrier de plage.
 * La virgule entre les deux champs est décorative : `aria-hidden`.
 */
export function DateRangePicker<T extends DateValue>({
  label,
  hideLabel = false,
  className,
  ...props
}: DateRangePickerPrimitiveProps<T>) {
  return (
    <AriaDateRangePicker {...props} className={cn('flex flex-col gap-1.5', className)}>
      {!hideLabel && <Label className="type-control-sm font-medium text-foreground">{label}</Label>}
      <FieldFrame className="gap-1.5">
        {hideLabel && <span className="sr-only">{label}</span>}
        <DateInput slot="start" className="flex flex-1 items-center gap-0.5">
          {(segment) => <DateSegment segment={segment} className={SEGMENT} />}
        </DateInput>
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
        <DateInput slot="end" className="flex flex-1 items-center gap-0.5">
          {(segment) => <DateSegment segment={segment} className={SEGMENT} />}
        </DateInput>
        <AriaButton
          aria-label={label}
          className={buttonClasses({
            variant: 'ghost',
            size: 'xs',
            shape: 'icon',
            className: 'shrink-0',
          })}
        >
          <CalendarDays className="size-3.5" strokeWidth={1.75} />
        </AriaButton>
      </FieldFrame>
      <Popover className="rounded-panel border border-border bg-popover shadow-lg outline-hidden">
        <RangeCalendar />
      </Popover>
    </AriaDateRangePicker>
  );
}
