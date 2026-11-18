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
  /**
   * Côté d'ouverture. Il se déclare ici, à la racine : c'est `Drawer` qui
   * porte le contexte lu par le panneau. Un `side` posé sur `SheetContent`
   * n'aurait aucun effet.
   */
  side?: DrawerSide;
  children: React.ReactNode;
}

export function Sheet({ open, onOpenChange, defaultOpen, side = 'right', children }: SheetProps) {
  return (
    <Drawer isOpen={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen} side={side}>
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

/**
 * Panneau du sheet.
 *
 * ⚠️ Les props `side` et `showCloseButton` figuraient dans le type sans être
 * lues : un appelant pouvait demander `side="left"` et obtenir un panneau à
 * droite, sans erreur. Le côté se règle sur `<Sheet side>` (il doit atteindre
 * le contexte du `Drawer`), et la croix fait partie de l'en-tête.
 */
export function SheetContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
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
