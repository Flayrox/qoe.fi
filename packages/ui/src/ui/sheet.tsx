'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
  DrawerTrigger,
  type DrawerSide,
} from '../primitives/drawer/drawer';
import { cn } from '@qoe/utils';

export interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function Sheet({ open, onOpenChange, defaultOpen, children }: SheetProps) {
  return (
    <Drawer isOpen={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      {children}
    </Drawer>
  );
}

export const SheetTrigger = DrawerTrigger;
export const SheetClose = DrawerClose;
export const SheetHeader = DrawerHeader;
export const SheetTitle = DrawerTitle;
export const SheetDescription = DrawerDescription;
export type { DrawerSide };

export function SheetContent({
  children,
  className,
}: {
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  showCloseButton?: boolean;
}) {
  return <DrawerContent className={className}>{children}</DrawerContent>;
}

export function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}
