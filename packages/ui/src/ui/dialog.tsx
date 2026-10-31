'use client';

import * as React from 'react';
import {
  DialogTrigger,
  Modal,
  Dialog as AriaDialog,
  Heading,
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from 'react-aria-components';
import { cn } from '@qoe/utils';
import { XIcon } from 'lucide-react';
import { Button } from '../primitives/button/button';

interface DialogContextValue {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  isDismissable?: boolean;
}

const DialogContext = React.createContext<DialogContextValue>({});

export interface DialogProps {
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  isDismissable?: boolean;
  children: React.ReactNode;
}

export function Dialog({
  open,
  isOpen,
  onOpenChange,
  defaultOpen,
  isDismissable = true,
  children,
}: DialogProps) {
  const resolvedOpen = open !== undefined ? open : isOpen;
  return (
    <DialogContext.Provider value={{ isOpen: resolvedOpen, onOpenChange, isDismissable }}>
      <DialogTrigger isOpen={resolvedOpen} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
        {children}
      </DialogTrigger>
    </DialogContext.Provider>
  );
}

export interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  render?: React.ReactElement;
  className?: string;
}

export function DialogTriggerCustom({ children, render, className, ...props }: DialogTriggerProps) {
  if (render && React.isValidElement(render)) {
    const originalProps = render.props as Record<string, unknown>;
    return React.cloneElement(render, {
      ...props,
      'data-slot': 'dialog-trigger',
      className: cn(originalProps.className as string, className),
      children: children ?? (originalProps.children as React.ReactNode),
    } as React.HTMLAttributes<HTMLElement>);
  }
  return (
    <AriaButton data-slot="dialog-trigger" className={className} {...(props as AriaButtonProps)}>
      {children}
    </AriaButton>
  );
}

export { DialogTriggerCustom as DialogTrigger };

export interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
  showCloseButton?: boolean;
  'aria-label'?: string;
}

export function DialogContent({
  children,
  className,
  showCloseButton = true,
  'aria-label': ariaLabel,
}: DialogContentProps) {
  const { isDismissable = true, onOpenChange } = React.useContext(DialogContext);

  const dialogRef = React.useCallback((node: HTMLElement | null) => {
    if (node) {
      node.setAttribute('aria-modal', 'true');
    }
  }, []);

  return (
    <Modal
      isDismissable={isDismissable}
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        'bg-black/60 backdrop-blur-xs transition duration-200 ease-out starting:opacity-0'
      )}
    >
      <AriaDialog
        ref={dialogRef}
        aria-modal="true"
        aria-label={ariaLabel}
        className={cn(
          'relative flex flex-col gap-3 bg-popover text-popover-foreground shadow-2xl border border-border/40 font-sans outline-hidden',
          'max-sm:fixed max-sm:bottom-0 max-sm:inset-x-0 max-sm:rounded-t-2xl max-sm:max-h-[90vh] max-sm:p-4',
          'sm:w-full sm:max-w-xl sm:rounded-2xl sm:p-5',
          'transition duration-200 ease-out starting:scale-95 starting:opacity-0',
          className
        )}
      >
        {({ close }) => (
          <>
            {children}
            {showCloseButton && (
              <Button
                variant="ghost"
                shape="icon"
                size="xs"
                onClick={() => {
                  close();
                  onOpenChange?.(false);
                }}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
                aria-label="Fermer"
              >
                <XIcon className="size-4" aria-hidden />
              </Button>
            )}
          </>
        )}
      </AriaDialog>
    </Modal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-1 pr-6', className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Heading>) {
  return (
    <Heading
      slot="title"
      className={cn('text-base font-semibold text-foreground tracking-tight', className)}
      {...props}
    >
      {children}
    </Heading>
  );
}

export function DialogDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="dialog-description"
      className={cn('text-xs text-muted-foreground leading-relaxed', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex items-center justify-end gap-2 pt-2', className)}
      {...props}
    />
  );
}

export interface DialogCloseProps extends React.ButtonHTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  render?: React.ReactElement;
  onClick?: (e?: React.MouseEvent<HTMLElement>) => void;
}

export function DialogClose({ children, render, onClick, ...props }: DialogCloseProps) {
  const { onOpenChange } = React.useContext(DialogContext);
  const handleClick = () => {
    onClick?.();
    onOpenChange?.(false);
  };
  if (render && React.isValidElement(render)) {
    const originalProps = render.props as Record<string, unknown>;
    return React.cloneElement(render, {
      ...props,
      'data-slot': 'dialog-close',
      children: children ?? (originalProps.children as React.ReactNode),
      onClick: (e: React.MouseEvent) => {
        (originalProps.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e);
        handleClick();
      },
    } as React.HTMLAttributes<HTMLElement>);
  }
  return (
    <span data-slot="dialog-close" onClick={handleClick} {...props}>
      {children}
    </span>
  );
}
