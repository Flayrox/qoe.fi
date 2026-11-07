'use client';

import * as React from 'react';
import { cn } from '@qoe/utils';

interface HoverCardContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  openDelay: number;
  closeDelay: number;
}

const HoverCardContext = React.createContext<HoverCardContextValue>({
  isOpen: false,
  setIsOpen: () => {},
  openDelay: 200,
  closeDelay: 150,
});

export interface HoverCardProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  openDelay?: number;
  closeDelay?: number;
  children: React.ReactNode;
}

export function HoverCard({
  open,
  onOpenChange,
  openDelay = 200,
  closeDelay = 150,
  children,
}: HoverCardProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const setIsOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange]
  );

  return (
    <HoverCardContext.Provider value={{ isOpen, setIsOpen, openDelay, closeDelay }}>
      <div className={cn('relative inline-block', isOpen && 'z-50')} data-slot="hover-card">
        {children}
      </div>
    </HoverCardContext.Provider>
  );
}

export interface HoverCardTriggerProps {
  render?: React.ReactElement;
  children?: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}

export function HoverCardTrigger({ render, children, className, ...props }: HoverCardTriggerProps) {
  const { setIsOpen, openDelay, closeDelay } = React.useContext(HoverCardContext);
  const openTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const closeTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    openTimerRef.current = setTimeout(() => setIsOpen(true), openDelay);
  };

  const handleMouseLeave = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    closeTimerRef.current = setTimeout(() => setIsOpen(false), closeDelay);
  };

  const handleFocus = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setIsOpen(true);
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsOpen(false);
    }
  };

  if (render && React.isValidElement(render)) {
    const originalProps = render.props as Record<string, unknown>;
    return React.cloneElement(render, {
      ...props,
      'data-slot': 'hover-card-trigger',
      children: children ?? (originalProps.children as React.ReactNode),
      className: cn(originalProps.className as string, className),
      onMouseEnter: (e: React.MouseEvent) => {
        (originalProps.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e);
        handleMouseEnter();
      },
      onMouseLeave: (e: React.MouseEvent) => {
        (originalProps.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e);
        handleMouseLeave();
      },
      onFocus: (e: React.FocusEvent) => {
        (originalProps.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e);
        handleFocus();
      },
      onBlur: (e: React.FocusEvent) => {
        (originalProps.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e);
        handleBlur(e);
      },
    } as React.HTMLAttributes<HTMLElement>);
  }

  return (
    <span
      data-slot="hover-card-trigger"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      {...props}
    >
      {children}
    </span>
  );
}

export interface HoverCardContentProps {
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  [key: string]: unknown;
}

export function HoverCardContent({
  children,
  className,
  side = 'bottom',
  align = 'center',
  sideOffset = 4,
  ...props
}: HoverCardContentProps) {
  const { isOpen, setIsOpen, closeDelay } = React.useContext(HoverCardContext);
  const closeTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  if (!isOpen) return null;

  const handleMouseEnter = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  };

  const handleMouseLeave = () => {
    closeTimerRef.current = setTimeout(() => setIsOpen(false), closeDelay);
  };

  const positionClasses =
    side === 'top'
      ? 'bottom-full'
      : side === 'left'
        ? 'right-full'
        : side === 'right'
          ? 'left-full'
          : 'top-full';

  const marginStyle: React.CSSProperties =
    side === 'top'
      ? { marginBottom: sideOffset }
      : side === 'left'
        ? { marginRight: sideOffset }
        : side === 'right'
          ? { marginLeft: sideOffset }
          : { marginTop: sideOffset };

  const alignClasses =
    align === 'start' ? 'left-0' : align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2';

  return (
    <div
      data-slot="hover-card-content"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={marginStyle}
      className={cn(
        'absolute z-50 w-80 rounded-2xl bg-popover text-sm text-popover-foreground shadow-2xl ring-1 ring-border/50 outline-hidden',
        positionClasses,
        alignClasses,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
