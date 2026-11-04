'use client';

import * as React from 'react';
import {
  MenuTrigger,
  Pressable,
  Button as AriaButton,
  Popover as AriaPopover,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  Header as AriaHeader,
  Separator as AriaSeparator,
  SubmenuTrigger as AriaSubmenuTrigger,
  type PopoverProps as AriaPopoverProps,
  type MenuItemProps as AriaMenuItemProps,
  type ButtonProps as AriaButtonProps,
} from 'react-aria-components';

import { cn } from '@qoe/utils';
import { ChevronRightIcon, CheckIcon } from 'lucide-react';

export interface DropdownMenuProps {
  children: React.ReactNode;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export function DropdownMenu({ children, isOpen, defaultOpen, onOpenChange }: DropdownMenuProps) {
  return (
    <MenuTrigger isOpen={isOpen} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {children}
    </MenuTrigger>
  );
}

export function DropdownMenuPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export interface DropdownMenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  render?: React.ReactElement;
  asChild?: boolean;
  className?: string;
}

export function DropdownMenuTrigger({
  children,
  render,
  asChild,
  className,
  ...props
}: DropdownMenuTriggerProps) {
  const childElement = asChild && React.isValidElement(children) ? children : render;
  if (childElement && React.isValidElement(childElement)) {
    const originalProps = childElement.props as Record<string, unknown>;
    const clonedTrigger = React.cloneElement(childElement, {
      ...props,
      'data-slot': 'dropdown-menu-trigger',
      className: cn(originalProps.className as string, className),
      children: originalProps.children ?? children,
    } as React.DOMAttributes<Element>) as React.ReactElement<React.DOMAttributes<Element>, string>;
    return <Pressable>{clonedTrigger}</Pressable>;
  }
  return (
    <AriaButton
      data-slot="dropdown-menu-trigger"
      className={className}
      {...(props as AriaButtonProps)}
    >
      {children}
    </AriaButton>
  );
}

export interface DropdownMenuContentProps {
  align?: 'start' | 'center' | 'end';
  alignOffset?: number;
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  className?: string;
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  'aria-label'?: string;
}

export function DropdownMenuContent({
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  className,
  children,
  header,
  footer,
  'aria-label': ariaLabel = 'Actions',
}: DropdownMenuContentProps) {
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
      crossOffset={alignOffset}
      className={cn(
        'z-50 min-w-44 rounded-panel border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-hidden',
        'transition duration-150 ease-out starting:scale-95 starting:opacity-0',
        className
      )}
    >
      {header && <div data-slot="dropdown-menu-header">{header}</div>}
      <AriaMenu
        data-slot="dropdown-menu-content"
        aria-label={ariaLabel}
        className="flex flex-col gap-0.5 outline-hidden"
      >
        {children}
      </AriaMenu>
      {footer && <div data-slot="dropdown-menu-footer">{footer}</div>}
    </AriaPopover>
  );
}

export function DropdownMenuGroup({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AriaMenuSection>) {
  return (
    <AriaMenuSection
      data-slot="dropdown-menu-group"
      className={cn('flex flex-col gap-0.5', className)}
      {...props}
    >
      {children}
    </AriaMenuSection>
  );
}

export interface DropdownMenuLabelProps extends React.ComponentProps<typeof AriaHeader> {
  inset?: boolean;
}

export function DropdownMenuLabel({
  className,
  inset,
  children,
  ...props
}: DropdownMenuLabelProps) {
  return (
    <AriaHeader
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        'px-2 py-1 type-control-xs font-medium text-muted-foreground data-inset:pl-7',
        className
      )}
      {...props}
    >
      {children}
    </AriaHeader>
  );
}

export interface DropdownMenuItemProps extends Omit<AriaMenuItemProps, 'id'> {
  id?: string;
  className?: string;
  inset?: boolean;
  variant?: 'default' | 'destructive';
  onClick?: (e?: React.MouseEvent) => void;
  children: React.ReactNode;
}

export function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  onClick,
  onAction,
  children,
  ...props
}: DropdownMenuItemProps) {
  const handleAction = () => {
    onAction?.();
    onClick?.();
  };

  return (
    <AriaMenuItem
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      onAction={handleAction}
      className={cn(
        'group/dropdown-menu-item relative flex min-h-8 cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 type-control-sm text-foreground outline-hidden select-none transition-colors',
        '[&_svg]:size-3.5 [&_svg]:shrink-0',
        'data-[focused]:bg-secondary data-[hovered]:bg-secondary data-inset:pl-7',
        'data-[variant=destructive]:text-destructive-text data-[variant=destructive]:data-[focused]:bg-destructive/10 data-[variant=destructive]:data-[hovered]:bg-destructive/10',
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </AriaMenuItem>
  );
}

export function DropdownMenuSub({
  children,
  ...props
}: React.ComponentProps<typeof AriaSubmenuTrigger>) {
  return (
    <AriaSubmenuTrigger data-slot="dropdown-menu-sub" {...props}>
      {children}
    </AriaSubmenuTrigger>
  );
}

export interface DropdownMenuSubTriggerProps extends Omit<
  React.ComponentProps<typeof AriaMenuItem>,
  'children'
> {
  inset?: boolean;
  children?: React.ReactNode;
}

export function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <AriaMenuItem
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-popup-open:bg-accent data-popup-open:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </AriaMenuItem>
  );
}

export function DropdownMenuSubContent({
  className,
  children,
  align = 'start',
  alignOffset = -3,
  side = 'right',
  sideOffset = 0,
  ...props
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuContent
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      className={cn(
        'w-auto min-w-[96px] rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-border/50',
        className
      )}
      {...props}
    >
      {children}
    </DropdownMenuContent>
  );
}

export interface DropdownMenuCheckboxItemProps extends Omit<
  React.ComponentProps<typeof AriaMenuItem>,
  'children'
> {
  inset?: boolean;
  checked?: boolean;
  children?: React.ReactNode;
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <AriaMenuItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        {checked && <CheckIcon className="size-4" />}
      </span>
      {children}
    </AriaMenuItem>
  );
}

export function DropdownMenuRadioGroup({
  children,
  className,
  ...props
}: React.ComponentProps<typeof AriaMenuSection>) {
  return (
    <AriaMenuSection data-slot="dropdown-menu-radio-group" className={className} {...props}>
      {children}
    </AriaMenuSection>
  );
}

export interface DropdownMenuRadioItemProps extends Omit<
  React.ComponentProps<typeof AriaMenuItem>,
  'children'
> {
  inset?: boolean;
  checked?: boolean;
  children?: React.ReactNode;
}

export function DropdownMenuRadioItem({
  className,
  children,
  inset,
  checked,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <AriaMenuItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        {checked && <CheckIcon className="size-4" />}
      </span>
      {children}
    </AriaMenuItem>
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof AriaSeparator>) {
  return (
    <AriaSeparator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border/60', className)}
      {...props}
    />
  );
}

export function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn('ml-auto shrink-0 font-mono type-control-xs text-muted-foreground', className)}
      {...props}
    />
  );
}
