'use client';

import { XIcon } from 'lucide-react';
import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type HTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Heading,
  Modal,
  type ButtonProps as AriaButtonProps,
} from 'react-aria-components';

import { cn } from '@qoe/utils';

import { Button, buttonClasses } from '../button/button';
import { type Size, type Tone, type Variant } from '../contract';

// =====================================================================
// 🪟 Dialog — boîte modale centrée et confirmation, sur react-aria
// =====================================================================
// 📖 Symétrique à `Drawer` (`@qoe/ui/drawer`), avec la même discipline :
//    piège du focus, arrière-plan rendu inerte, fermeture à Échap et au
//    clic sur le voile (sauf `role="alertdialog"` ou `isDismissable={false}`),
//    et restitution du focus au déclencheur.
//
// 🎯 Zéro couleur brute : le voile utilise `bg-foreground/25` comme `Drawer`,
//    et la surface `rounded-panel border-border bg-popover`. Compatible avec
//    les modales contrôlées (`open` / `isOpen`) comme non contrôlées.
// =====================================================================

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_WIDTHS: Record<DialogSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-xl',
  xl: 'sm:max-w-2xl',
};

interface DialogContextValue {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  isDismissable: boolean;
  size: DialogSize;
}

const DialogContext = createContext<DialogContextValue>({
  isDismissable: true,
  size: 'lg',
});

const DialogCloseActionContext = createContext<(() => void) | null>(null);

export interface DialogProps {
  children: ReactNode;
  /** Contrôle externe (standard react-aria). */
  isOpen?: boolean;
  /** Alias rétro-compatible avec les écrans existants. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Clic sur le voile / Échap. Défaut `true` (sauf `role="alertdialog"`). */
  isDismissable?: boolean;
  /** Largeur maximale du panneau sur écran `sm+`. Défaut `lg` (`max-w-xl`). */
  size?: DialogSize;
}

export function Dialog({
  children,
  isOpen,
  open,
  defaultOpen,
  onOpenChange,
  isDismissable = true,
  size = 'lg',
}: DialogProps) {
  const resolvedOpen = open !== undefined ? open : isOpen;

  return (
    <DialogContext.Provider value={{ isOpen: resolvedOpen, onOpenChange, isDismissable, size }}>
      <AriaDialogTrigger
        isOpen={resolvedOpen}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
      >
        {children}
      </AriaDialogTrigger>
    </DialogContext.Provider>
  );
}

export interface DialogTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  render?: ReactElement;
  variant?: Variant;
  tone?: Tone;
  size?: Size;
  className?: string;
}

export function DialogTrigger({
  children,
  render,
  variant = 'outline',
  tone = 'neutral',
  size = 'md',
  className,
  ...props
}: DialogTriggerProps) {
  if (render && isValidElement(render)) {
    const originalProps = render.props as Record<string, unknown>;
    return cloneElement(render, {
      ...props,
      'data-slot': 'dialog-trigger',
      className: cn(originalProps.className as string, className),
      children: children ?? (originalProps.children as ReactNode),
    } as HTMLAttributes<HTMLElement>);
  }

  return (
    <AriaButton
      data-slot="dialog-trigger"
      className={buttonClasses({ variant, tone, size, className })}
      {...(props as AriaButtonProps)}
    >
      {children}
    </AriaButton>
  );
}

export interface DialogContentProps {
  children: ReactNode;
  className?: string;
  /** Classes du voile (`Modal`), ex. pour empiler deux couches. */
  overlayClassName?: string;
  /** `alertdialog` désactive la fermeture accidentelle au clic extérieur par défaut. */
  role?: 'dialog' | 'alertdialog';
  /** Largeur locale si non passée sur `<Dialog size="...">`. */
  size?: DialogSize;
  showCloseButton?: boolean;
  'aria-label'?: string;
}

export function DialogContent({
  children,
  className,
  overlayClassName,
  role = 'dialog',
  size: sizeProp,
  showCloseButton = true,
  'aria-label': ariaLabel,
}: DialogContentProps) {
  const { isDismissable, onOpenChange, size: contextSize } = useContext(DialogContext);
  const resolvedSize = sizeProp ?? contextSize;
  const resolvedDismissable = role === 'alertdialog' ? false : isDismissable;
  const dialogRef = useCallback((node: HTMLElement | null) => {
    if (node) {
      node.setAttribute('aria-modal', 'true');
    }
  }, []);

  return (
    <Modal
      isDismissable={resolvedDismissable}
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        'bg-foreground/25 backdrop-blur-xs transition duration-200 ease-out starting:opacity-0',
        overlayClassName
      )}
    >
      <AriaDialog
        ref={dialogRef}
        data-slot="dialog-content"
        role={role}
        aria-label={ariaLabel}
        className={cn(
          'relative flex flex-col gap-3 border border-border bg-popover font-sans text-popover-foreground shadow-xl outline-hidden',
          'max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[90vh] max-sm:rounded-t-panel max-sm:p-4',
          'sm:w-full sm:rounded-panel sm:p-5',
          SIZE_WIDTHS[resolvedSize],
          'transition duration-200 ease-out starting:scale-95 starting:opacity-0',
          className
        )}
      >
        {({ close }) => {
          const handleClose = () => {
            close();
            onOpenChange?.(false);
          };

          return (
            <DialogCloseActionContext.Provider value={handleClose}>
              {children}
              {showCloseButton && (
                <Button
                  variant="ghost"
                  shape="icon"
                  size="xs"
                  onClick={handleClose}
                  className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
                  aria-label="Fermer"
                >
                  <XIcon className="size-4" strokeWidth={1.75} aria-hidden />
                </Button>
              )}
            </DialogCloseActionContext.Provider>
          );
        }}
      </AriaDialog>
    </Modal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-1 pr-7', className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, children, ...props }: ComponentProps<typeof Heading>) {
  return (
    <Heading
      slot="title"
      className={cn('type-control-lg font-semibold tracking-tight text-foreground', className)}
      {...props}
    >
      {children}
    </Heading>
  );
}

export function DialogDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="dialog-description"
      className={cn('type-control-sm leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="dialog-body" className={cn('min-h-0 overflow-y-auto', className)} {...props} />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex items-center justify-end gap-2 pt-2', className)}
      {...props}
    />
  );
}

export interface DialogCloseProps extends ButtonHTMLAttributes<HTMLElement> {
  children?: ReactNode;
  render?: ReactElement;
  variant?: Variant;
  tone?: Tone;
  size?: Size;
  onClick?: (e?: MouseEvent<HTMLElement>) => void;
}

export function DialogClose({
  children,
  render,
  variant = 'ghost',
  tone = 'neutral',
  size = 'sm',
  className,
  onClick,
  ...props
}: DialogCloseProps) {
  const closeFromDialog = useContext(DialogCloseActionContext);
  const { onOpenChange } = useContext(DialogContext);

  const triggerClose = (e?: MouseEvent<HTMLElement>) => {
    onClick?.(e);
    if (closeFromDialog) {
      closeFromDialog();
    } else {
      onOpenChange?.(false);
    }
  };

  if (render && isValidElement(render)) {
    const originalProps = render.props as Record<string, unknown>;
    return cloneElement(render, {
      ...props,
      'data-slot': 'dialog-close',
      className: cn(originalProps.className as string, className),
      children: children ?? (originalProps.children as ReactNode),
      onClick: (e: MouseEvent<HTMLElement>) => {
        (originalProps.onClick as ((ev: MouseEvent<HTMLElement>) => void) | undefined)?.(e);
        triggerClose(e);
      },
    } as HTMLAttributes<HTMLElement>);
  }

  return (
    <Button
      data-slot="dialog-close"
      variant={variant}
      tone={tone}
      size={size}
      className={className}
      onClick={triggerClose}
      {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </Button>
  );
}
