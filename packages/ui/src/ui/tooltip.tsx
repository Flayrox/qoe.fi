'use client';

import * as React from 'react';
import {
  TooltipTrigger as AriaTooltipTrigger,
  Tooltip as AriaTooltip,
  OverlayArrow,
  type TooltipProps as AriaTooltipProps,
} from 'react-aria-components';
import { cn } from '@qoe/utils';

export function TooltipProvider({ children }: { children: React.ReactNode; delay?: number }) {
  return <>{children}</>;
}

export function Tooltip({
  children,
  delay = 300,
  ...props
}: {
  children: React.ReactNode;
  delay?: number;
  [key: string]: unknown;
}) {
  return (
    <AriaTooltipTrigger delay={delay} {...props}>
      {children}
    </AriaTooltipTrigger>
  );
}

export function TooltipTrigger({
  children,
  className,
  onClick,
  disabled,
  ...props
}: React.ComponentProps<'button'>) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  );
}

export interface TooltipContentProps {
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: string;
  sideOffset?: number;
}

export function TooltipContent({
  children,
  className,
  side = 'top',
  align,
  sideOffset = 4,
}: TooltipContentProps) {
  const placement = align ? (`${side} ${align}` as AriaTooltipProps['placement']) : side;
  return (
    <AriaTooltip
      placement={placement}
      offset={sideOffset}
      className={cn(
        'z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md transition duration-150',
        className
      )}
    >
      <OverlayArrow>
        <svg width={8} height={8} viewBox="0 0 8 8" className="fill-foreground">
          <path d="M0 0 L4 4 L8 0 Z" />
        </svg>
      </OverlayArrow>
      {children}
    </AriaTooltip>
  );
}
