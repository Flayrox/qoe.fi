'use client';

import { XIcon } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Heading,
  Modal,
  Text,
  type DialogTriggerProps,
} from 'react-aria-components';

import { cn } from '@qoe/utils';

import { buttonClasses } from '../button/button';

// =====================================================================
// 🚪 Drawer — panneau latéral modal, sur react-aria
// =====================================================================
// 📖 react-aria fournit la partie difficile : piège du focus, `aria-modal`,
//    Échap, clic sur le fond, restitution du focus au déclencheur, et
//    arrière-plan retiré de l'ordre de tabulation.
//
// 🎯 Ce qui reste ici : le côté, la largeur, et la coquille visuelle.
//    L'API est volontairement proche de `Sheet` pour que migrer un écran
//    ne change qu'un import et les noms de slots.
// =====================================================================

export type DrawerSide = 'left' | 'right';
export type DrawerWidth = 'sm' | 'md' | 'lg';

interface DrawerVariant {
  side: DrawerSide;
  width: DrawerWidth;
  isDismissable: boolean;
  className?: string;
}

const DrawerVariantContext = createContext<DrawerVariant>({
  side: 'right',
  width: 'md',
  isDismissable: true,
});

const SIDE_CLASSES: Record<DrawerSide, string> = {
  right: 'justify-end border-l',
  left: 'justify-start border-r',
};

/** Une seule dimension de largeur : sinon les écrans divergent encore. */
const WIDTH_CLASSES: Record<DrawerWidth, string> = {
  sm: 'w-full sm:w-80',
  md: 'w-full sm:w-[25rem]',
  lg: 'w-full sm:w-[30rem]',
};

export interface DrawerProps {
  children: ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: DialogTriggerProps['defaultOpen'];
  side?: DrawerSide;
  width?: DrawerWidth;
  /** Clic extérieur / Échap. Désactiver pour une confirmation obligatoire. */
  isDismissable?: boolean;
  className?: string;
}

/**
 * Racine : contient le déclencheur puis le contenu.
 *
 * ```tsx
 * <Drawer side="right">
 *   <DrawerTrigger>Ouvrir</DrawerTrigger>
 *   <DrawerContent>
 *     <DrawerHeader>
 *       <DrawerTitle>Détails</DrawerTitle>
 *     </DrawerHeader>
 *     <DrawerBody>…</DrawerBody>
 *   </DrawerContent>
 * </Drawer>
 * ```
 */
export function Drawer({
  children,
  isOpen,
  onOpenChange,
  defaultOpen,
  side = 'right',
  width = 'md',
  isDismissable = true,
  className,
}: DrawerProps) {
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      {/* Le provider englobe les slots : le contenu n'a pas à répéter les
          variants déjà donnés à la racine. */}
      <DrawerVariantContext.Provider value={{ side, width, isDismissable, className }}>
        {children}
      </DrawerVariantContext.Provider>
    </DialogTrigger>
  );
}

export interface DrawerTriggerProps {
  children: ReactNode;
  className?: string;
}

export function DrawerTrigger({ children, className }: DrawerTriggerProps) {
  return (
    <AriaButton className={cn(buttonClasses({ variant: 'outline', size: 'md' }), className)}>
      {children}
    </AriaButton>
  );
}

export interface DrawerContentProps {
  children: ReactNode;
  className?: string;
  /** Nom accessible, si aucun `DrawerTitle` n'est rendu. */
  'aria-label'?: string;
}

export function DrawerContent({
  children,
  className,
  'aria-label': ariaLabel,
}: DrawerContentProps) {
  const { side, width, isDismissable, className: rootClassName } = useContext(DrawerVariantContext);

  return (
    <Modal
      isDismissable={isDismissable}
      className="fixed inset-0 z-50 flex bg-background/60 backdrop-blur-xs"
    >
      <Dialog
        aria-label={ariaLabel}
        className={cn(
          'flex h-full flex-col border-border bg-popover text-popover-foreground shadow-xl outline-hidden',
          // Entrée sans JS : `starting:` couvre le premier rendu.
          'transition duration-200 ease-out starting:translate-x-3 starting:opacity-0',
          SIDE_CLASSES[side],
          WIDTH_CLASSES[width],
          rootClassName,
          className
        )}
      >
        {children}
      </Dialog>
    </Modal>
  );
}

export interface DrawerSectionProps {
  children: ReactNode;
  className?: string;
}

export function DrawerHeader({ children, className }: DrawerSectionProps) {
  return (
    <div
      className={cn('flex items-start justify-between gap-4 border-b border-border p-4', className)}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <DrawerClose
        aria-label="Fermer"
        className="grid size-7 shrink-0 place-items-center rounded-control text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <XIcon className="size-4" strokeWidth={1.75} />
      </DrawerClose>
    </div>
  );
}

export function DrawerTitle({ children, className }: DrawerSectionProps) {
  return (
    <Heading
      slot="title"
      className={cn('type-control-lg font-semibold text-foreground', className)}
    >
      {children}
    </Heading>
  );
}

export function DrawerDescription({ children, className }: DrawerSectionProps) {
  return (
    <Text
      slot="description"
      className={cn('mt-1 block type-control-sm text-muted-foreground', className)}
    >
      {children}
    </Text>
  );
}

export function DrawerBody({ children, className }: DrawerSectionProps) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto p-4', className)}>{children}</div>;
}

export function DrawerFooter({ children, className }: DrawerSectionProps) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 border-t border-border p-4', className)}
    >
      {children}
    </div>
  );
}

export interface DrawerCloseProps {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}

export function DrawerClose({ children, className, 'aria-label': ariaLabel }: DrawerCloseProps) {
  return (
    <AriaButton slot="close" className={className} aria-label={ariaLabel}>
      {children}
    </AriaButton>
  );
}
