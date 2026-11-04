'use client';

import * as React from 'react';
import {
  DialogTrigger,
  Popover as AriaPopover,
  Dialog as AriaDialog,
  Button as AriaButton,
  Pressable,
  type PopoverProps as AriaPopoverProps,
  type ButtonProps as AriaButtonProps,
} from 'react-aria-components';
import { cn } from '@qoe/utils';

interface PopoverContextValue {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const PopoverContext = React.createContext<PopoverContextValue>({});

export interface PopoverProps {
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function Popover({ open, isOpen, onOpenChange, defaultOpen, children }: PopoverProps) {
  const resolvedOpen = open !== undefined ? open : isOpen;
  return (
    <PopoverContext.Provider value={{ isOpen: resolvedOpen, onOpenChange }}>
      <DialogTrigger isOpen={resolvedOpen} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
        {children}
      </DialogTrigger>
    </PopoverContext.Provider>
  );
}

export interface PopoverTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  render?: React.ReactElement;
  className?: string;
}

export function PopoverTrigger({ children, render, className, ...props }: PopoverTriggerProps) {
  if (render && React.isValidElement(render)) {
    const originalProps = render.props as Record<string, unknown>;
    const cloned = React.cloneElement(render, {
      ...props,
      'data-slot': 'popover-trigger',
      className: cn(originalProps.className as string, className),
      children: children ?? (originalProps.children as React.ReactNode),
    } as React.DOMAttributes<Element>) as React.ReactElement<React.DOMAttributes<Element>, string>;
    return <Pressable>{cloned}</Pressable>;
  }
  return (
    <AriaButton data-slot="popover-trigger" className={className} {...(props as AriaButtonProps)}>
      {children}
    </AriaButton>
  );
}

export interface PopoverContentProps {
  className?: string;
  align?: 'start' | 'center' | 'end';
  alignOffset?: number;
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  children: React.ReactNode;
  'aria-label'?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function PopoverContent({
  className,
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
  children,
  'aria-label': ariaLabel,
  onClick,
}: PopoverContentProps) {
  const placement: AriaPopoverProps['placement'] =
    side === 'bottom'
      ? align === 'start'
        ? 'bottom start'
        : align === 'end'
          ? 'bottom end'
          : 'bottom'
      : side === 'top'
        ? align === 'start'
          ? 'top start'
          : align === 'end'
            ? 'top end'
            : 'top'
        : side === 'left'
          ? align === 'start'
            ? 'start top'
            : align === 'end'
              ? 'start bottom'
              : 'left'
          : align === 'start'
            ? 'end top'
            : align === 'end'
              ? 'end bottom'
              : 'right';

  return (
    <AriaPopover
      placement={placement}
      offset={sideOffset}
      className={cn(
        'z-50 flex w-72 flex-col gap-2.5 rounded-lg border border-border/60 bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden',
        'transition duration-150 ease-out starting:opacity-0 starting:scale-95',
        className
      )}
    >
      <AriaDialog aria-label={ariaLabel} className="outline-hidden" onClick={onClick}>
        {children}
      </AriaDialog>
    </AriaPopover>
  );
}

export function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="popover-header"
      className={cn('flex flex-col gap-0.5 text-sm', className)}
      {...props}
    />
  );
}

export function PopoverTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="popover-title"
      className={cn('font-medium leading-none text-foreground', className)}
      {...props}
    />
  );
}

export function PopoverDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="popover-description"
      className={cn('text-muted-foreground', className)}
      {...props}
    />
  );
}

export function PopoverClose({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const { onOpenChange } = React.useContext(PopoverContext);
  return (
    <span
      onClick={() => {
        onClick?.();
        onOpenChange?.(false);
      }}
    >
      {children}
    </span>
  );
}
