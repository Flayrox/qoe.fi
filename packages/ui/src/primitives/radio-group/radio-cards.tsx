'use client';

import * as React from 'react';
import {
  RadioGroup as AriaRadioGroup,
  Radio as AriaRadio,
  type RadioGroupProps as AriaRadioGroupProps,
  type RadioProps as AriaRadioProps,
  type RadioGroupRenderProps,
} from 'react-aria-components';
import { Check } from 'lucide-react';
import { cn } from '@qoe/utils';

// =====================================================================
// 📻 RadioGroup & RadioCard — Sélection exclusive accessible
// =====================================================================
// Construit sur react-aria-components :
// - Flèches directionnelles (Haut / Bas / Gauche / Droite)
// - Support clavier (Espace pour sélectionner)
// - Annonce lecteur d'écran (role="radiogroup", role="radio", aria-checked)
// - Anneau de focus visible et gestion d'état désactivé
// =====================================================================

export type RadioCardVariant = 'check' | 'border-only';

const RadioCardVariantContext = React.createContext<RadioCardVariant>('check');

export interface RadioGroupProps extends Omit<AriaRadioGroupProps, 'children' | 'className'> {
  children?: React.ReactNode | ((values: RadioGroupRenderProps) => React.ReactNode);
  label?: React.ReactNode;
  description?: React.ReactNode;
  errorMessage?: React.ReactNode;
  variant?: RadioCardVariant;
  className?: string;
}

export function RadioGroup({
  label,
  description,
  errorMessage,
  variant = 'check',
  className,
  children,
  ...props
}: RadioGroupProps) {
  return (
    <AriaRadioGroup className={cn('flex flex-col gap-2', className)} {...props}>
      {(renderProps) => (
        <>
          {label && (
            <span className="text-sm font-medium text-foreground select-none">{label}</span>
          )}
          {description && (
            <span className="text-xs text-muted-foreground leading-relaxed select-none">
              {description}
            </span>
          )}

          <RadioCardVariantContext.Provider value={variant}>
            {typeof children === 'function' ? children(renderProps) : children}
          </RadioCardVariantContext.Provider>

          {errorMessage && (
            <span className="text-xs text-destructive select-none">{errorMessage}</span>
          )}
        </>
      )}
    </AriaRadioGroup>
  );
}

export interface RadioCardProps extends Omit<AriaRadioProps, 'children'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  preview?: React.ReactNode;
  variant?: RadioCardVariant;
  className?: string;
  children?:
    | React.ReactNode
    | ((values: {
        isSelected: boolean;
        isFocusVisible: boolean;
        isDisabled: boolean;
      }) => React.ReactNode);
}

export function RadioCard({
  value,
  title,
  description,
  preview,
  variant: propVariant,
  className,
  children,
  isDisabled,
  ...props
}: RadioCardProps) {
  const contextVariant = React.useContext(RadioCardVariantContext);
  const variant = propVariant ?? contextVariant;

  return (
    <AriaRadio
      value={value}
      isDisabled={isDisabled}
      className={({ isSelected, isFocusVisible, isDisabled: disabled }) =>
        cn(
          'group relative grid overflow-hidden rounded-lg border text-left cursor-pointer transition-colors outline-hidden select-none',
          isSelected
            ? variant === 'border-only'
              ? 'border-foreground bg-muted/20'
              : 'border-foreground/70 bg-card shadow-xs'
            : 'border-border/50 bg-card hover:border-border hover:bg-muted/20',
          isFocusVisible && 'ring-2 ring-ring/60 ring-offset-2 ring-offset-background',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )
      }
      {...props}
    >
      {(renderProps) => {
        if (typeof children === 'function') {
          return children(renderProps);
        }

        if (children) {
          return children;
        }

        const { isSelected } = renderProps;

        return (
          <>
            {preview && (
              <div className="h-20 border-b border-border/40 overflow-hidden">{preview}</div>
            )}
            <div className="grid gap-0.5 p-3">
              <div className="flex items-center justify-between gap-1.5">
                <span
                  className={cn(
                    'text-[13px]',
                    isSelected ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                  )}
                >
                  {title}
                </span>
                {variant === 'check' && isSelected && (
                  <Check className="size-3.5 text-foreground shrink-0" strokeWidth={2} />
                )}
              </div>
              {description && (
                <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {description}
                </span>
              )}
            </div>
          </>
        );
      }}
    </AriaRadio>
  );
}

/**
 * Bouton radio classique (puce circulaire) avec libellé et description optionnels.
 */
export interface RadioProps extends Omit<AriaRadioProps, 'children' | 'className'> {
  children?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}

export function Radio({ description, className, children, ...props }: RadioProps) {
  return (
    <AriaRadio
      className={({ isDisabled }) =>
        cn(
          'group flex items-start gap-3 cursor-pointer select-none outline-hidden',
          isDisabled && 'cursor-not-allowed opacity-50',
          className
        )
      }
      {...props}
    >
      {({ isSelected, isFocusVisible }) => (
        <>
          <div
            className={cn(
              'mt-0.5 size-4 rounded-full border border-foreground/30 flex items-center justify-center transition-colors',
              isSelected && 'border-primary bg-primary text-primary-foreground',
              isFocusVisible && 'ring-2 ring-ring/60 ring-offset-2 ring-offset-background'
            )}
          >
            {isSelected && <div className="size-1.5 rounded-full bg-background" />}
          </div>
          {(children || description) && (
            <div className="flex flex-col text-left">
              {children && (
                <span className="text-xs font-semibold text-foreground leading-tight">
                  {children}
                </span>
              )}
              {description && (
                <span className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  {description}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </AriaRadio>
  );
}
