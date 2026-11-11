'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@qoe/utils';

interface HoverCardContextValue {
  isOpen: boolean;
  triggerId: string;
  openWithDelay: () => void;
  closeWithDelay: () => void;
  cancelClose: () => void;
  openNow: () => void;
  closeNow: () => void;
}

const HoverCardContext = React.createContext<HoverCardContextValue>({
  isOpen: false,
  triggerId: '',
  openWithDelay: () => {},
  closeWithDelay: () => {},
  cancelClose: () => {},
  openNow: () => {},
  closeNow: () => {},
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
  const triggerId = React.useId();
  const openTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const closeTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const setIsOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange]
  );

  const clearOpenTimer = React.useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openNow = React.useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    setIsOpen(true);
  }, [clearCloseTimer, clearOpenTimer, setIsOpen]);

  const closeNow = React.useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    setIsOpen(false);
  }, [clearCloseTimer, clearOpenTimer, setIsOpen]);

  const openWithDelay = React.useCallback(() => {
    clearCloseTimer();
    clearOpenTimer();
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      setIsOpen(true);
    }, openDelay);
  }, [clearCloseTimer, clearOpenTimer, openDelay, setIsOpen]);

  const closeWithDelay = React.useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setIsOpen(false);
    }, closeDelay);
  }, [clearCloseTimer, clearOpenTimer, closeDelay, setIsOpen]);

  const cancelClose = clearCloseTimer;

  React.useEffect(
    () => () => {
      clearOpenTimer();
      clearCloseTimer();
    },
    [clearCloseTimer, clearOpenTimer]
  );

  return (
    <HoverCardContext.Provider
      value={{
        isOpen,
        triggerId,
        openWithDelay,
        closeWithDelay,
        cancelClose,
        openNow,
        closeNow,
      }}
    >
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
  const { triggerId, openWithDelay, closeWithDelay, openNow, closeNow } =
    React.useContext(HoverCardContext);

  const handleMouseEnter = () => {
    openWithDelay();
  };

  const handleMouseLeave = () => {
    closeWithDelay();
  };

  const handleFocus = () => {
    openNow();
  };

  const handleBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next) {
      // Le contenu est portailé : il n'est pas un descendant DOM du
      // déclencheur, mais il doit conserver le focus sans refermer la carte.
      const content = document.querySelector(`[data-hover-card-content-id="${triggerId}"]`);
      if (content?.contains(next)) return;
    }
    closeNow();
  };

  if (render && React.isValidElement(render)) {
    const originalProps = render.props as Record<string, unknown>;
    return React.cloneElement(render, {
      ...props,
      'data-slot': 'hover-card-trigger',
      'data-hover-card-trigger-id': triggerId,
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
      {...props}
      data-slot="hover-card-trigger"
      data-hover-card-trigger-id={triggerId}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
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
  const { isOpen, triggerId, cancelClose, closeWithDelay } = React.useContext(HoverCardContext);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null);

  const updatePosition = React.useCallback(() => {
    if (typeof document === 'undefined') return;
    const trigger = document.querySelector<HTMLElement>(
      `[data-hover-card-trigger-id="${triggerId}"]`
    );
    const content = contentRef.current;
    if (!trigger || !content) return;

    const triggerRect = trigger.getBoundingClientRect();
    const width = content.offsetWidth || 320;
    const height = content.offsetHeight || 0;

    let top: number;
    let left: number;

    if (side === 'top' || side === 'bottom') {
      top =
        side === 'top' ? triggerRect.top - height - sideOffset : triggerRect.bottom + sideOffset;
      left =
        align === 'start'
          ? triggerRect.left
          : align === 'end'
            ? triggerRect.right - width
            : triggerRect.left + triggerRect.width / 2 - width / 2;
    } else {
      left =
        side === 'left' ? triggerRect.left - width - sideOffset : triggerRect.right + sideOffset;
      top =
        align === 'start'
          ? triggerRect.top
          : align === 'end'
            ? triggerRect.bottom - height
            : triggerRect.top + triggerRect.height / 2 - height / 2;
    }

    const padding = 8;
    const maxLeft = Math.max(padding, window.innerWidth - width - padding);
    const maxTop = Math.max(padding, window.innerHeight - height - padding);
    setCoords({
      top: Math.max(padding, Math.min(top, maxTop)),
      left: Math.max(padding, Math.min(left, maxLeft)),
    });
  }, [align, side, sideOffset, triggerId]);

  React.useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }

    updatePosition();
    const content = contentRef.current;
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && content
        ? new ResizeObserver(() => updatePosition())
        : null;
    resizeObserver?.observe(content as Element);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  if (!isOpen) return null;

  const content = (
    <div
      {...props}
      ref={contentRef}
      data-slot="hover-card-content"
      data-hover-card-content-id={triggerId}
      data-side={side}
      data-align={align}
      onMouseEnter={cancelClose}
      onMouseLeave={closeWithDelay}
      style={{
        position: 'fixed',
        top: coords?.top ?? 0,
        left: coords?.left ?? 0,
        margin: 0,
        visibility: coords ? 'visible' : 'hidden',
      }}
      className={cn(
        'z-50 w-80 rounded-2xl bg-popover text-sm text-popover-foreground shadow-2xl ring-1 ring-border/50 outline-hidden',
        className
      )}
    >
      {children}
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}
