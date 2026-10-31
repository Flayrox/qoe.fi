'use client';

import * as React from 'react';
import {
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
  Button as AriaButton,
  Popover as AriaPopover,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
  Header as AriaHeader,
  Separator as AriaSeparator,
  type ListBoxItemProps as AriaListBoxItemProps,
  type ButtonProps as AriaButtonProps,
  type PopoverProps as AriaPopoverProps,
} from 'react-aria-components';

import { cn } from '@qoe/utils';
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from 'lucide-react';

export interface SelectProps<T = string> {
  children: React.ReactNode;
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  items?: Record<string, string> | unknown;
  name?: string;
  className?: string;
  'aria-label'?: string;
  disabled?: boolean;
}

export function Select<T = string>({
  children,
  value,
  defaultValue,
  onValueChange,
  items: _items,
  name,
  className,
  'aria-label': ariaLabel = 'Sélection',
  disabled,
}: SelectProps<T>) {
  void _items;
  return (
    <AriaSelect
      name={name}
      aria-label={ariaLabel}
      isDisabled={disabled}
      selectedKey={(value as string | undefined) ?? undefined}
      defaultSelectedKey={(defaultValue as string | undefined) ?? undefined}
      onSelectionChange={(key) => onValueChange?.(key as T)}
      className={className}
    >
      {children}
    </AriaSelect>
  );
}

export interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'default';
  children?: React.ReactNode;
  className?: string;
}

export const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  function SelectTrigger({ className, size = 'default', children, ...props }, ref) {
    return (
      <AriaButton
        ref={ref}
        data-slot="select-trigger"
        data-size={size}
        className={cn(
          "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-hidden select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className
        )}
        {...(props as AriaButtonProps)}
      >
        {children}
        <ChevronDownIcon className="pointer-events-none ml-auto size-4 text-muted-foreground" />
      </AriaButton>
    );
  }
);

export function SelectValue({
  className,
  placeholder,
  ...props
}: React.ComponentProps<typeof AriaSelectValue> & { placeholder?: string }) {
  return (
    <AriaSelectValue
      data-slot="select-value"
      className={cn('flex flex-1 text-left', className)}
      {...props}
    >
      {({ selectedText }) => selectedText || placeholder || ''}
    </AriaSelectValue>
  );
}

export interface SelectContentProps {
  className?: string;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  align?: 'start' | 'center' | 'end';
}

export function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
}: SelectContentProps) {
  let placement: AriaPopoverProps['placement'] = 'bottom start';
  if (side === 'bottom') {
    placement = align === 'end' ? 'bottom end' : align === 'center' ? 'bottom' : 'bottom start';
  } else if (side === 'top') {
    placement = align === 'end' ? 'top end' : align === 'center' ? 'top' : 'top start';
  } else if (side === 'right') {
    placement = align === 'end' ? 'right bottom' : align === 'center' ? 'right' : 'right top';
  } else if (side === 'left') {
    placement = align === 'end' ? 'left bottom' : align === 'center' ? 'left' : 'left top';
  }

  return (
    <AriaPopover
      placement={placement}
      offset={sideOffset}
      className={cn(
        'relative isolate z-50 min-w-36 overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-border/50 outline-hidden',
        className
      )}
    >
      <AriaListBox data-slot="select-content" className="flex flex-col gap-0.5 p-1 outline-hidden">
        {children}
      </AriaListBox>
    </AriaPopover>
  );
}

export function SelectGroup({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AriaListBoxSection>) {
  return (
    <AriaListBoxSection
      data-slot="select-group"
      className={cn('scroll-my-1 p-1 flex flex-col gap-0.5', className)}
      {...props}
    >
      {children}
    </AriaListBoxSection>
  );
}

export function SelectLabel({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AriaHeader>) {
  return (
    <AriaHeader
      data-slot="select-label"
      className={cn('px-1.5 py-1 text-xs text-muted-foreground', className)}
      {...props}
    >
      {children}
    </AriaHeader>
  );
}

export interface SelectItemProps extends Omit<AriaListBoxItemProps, 'id' | 'value'> {
  value?: string;
  id?: string;
  className?: string;
  children?: React.ReactNode;
}

export function SelectItem({ value, id, className, children, ...props }: SelectItemProps) {
  const resolvedId = id ?? value ?? '';
  return (
    <AriaListBoxItem
      id={resolvedId}
      textValue={typeof children === 'string' ? children : undefined}
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center justify-between gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {({ isSelected }) => (
        <>
          <span className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">{children}</span>
          {isSelected && (
            <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
              <CheckIcon className="size-4" />
            </span>
          )}
        </>
      )}
    </AriaListBoxItem>
  );
}

export function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof AriaSeparator>) {
  return (
    <AriaSeparator
      data-slot="select-separator"
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

export function SelectScrollUpButton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 hidden w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon />
    </div>
  );
}

export function SelectScrollDownButton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 hidden w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon />
    </div>
  );
}
