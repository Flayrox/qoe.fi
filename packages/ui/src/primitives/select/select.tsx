'use client';

import { useEffect, useRef } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@qoe/utils';
import {
  Button as AriaButton,
  Label,
  Header,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
  Select as AriaSelect,
  SelectValue,
} from 'react-aria-components';

import { buttonClasses } from '../button/button';
import type { Size } from '../contract';

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

export interface SelectOption {
  id: string;
  label: string;
  /** Texte secondaire (unité, précision, effectif…). */
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  /** Nom accessible. Rendu au-dessus du champ sauf `hideLabel`. */
  label: string;
  hideLabel?: boolean;
  options: SelectOption[];
  /**
   * Options regroupées sous un en-tête non sélectionnable (`ListBoxSection`).
   * Une hiérarchie plate avec des préfixes « ↳ » fait perdre l'annonce du
   * parent ; un vrai groupe la garde.
   */
  groups?: SelectGroup[];
  /** Valeur contrôlée (id de l'option). */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  size?: Size;
  invalid?: boolean;
  disabled?: boolean;
  /** Nom du champ soumis avec le formulaire. */
  name?: string;
  /** Id du déclencheur, pour un `htmlFor` externe ou un test. */
  id?: string;
  testId?: string;
  className?: string;
}

/**
 * Liste déroulante de sélection.
 *
 * Remplace les `<select>` natifs (27 fichiers) sans en perdre les qualités :
 * react-aria fournit `role="listbox"`, la navigation par lettres, les flèches,
 * Échap, et le champ caché pour la soumission de formulaire (`name`).
 *
 * Ce que le natif ne savait pas faire et qu'on gagne : description par option,
 * état invalide annoncé, et une apparence qui suit les tokens au lieu d'être
 * dessinée par le système d'exploitation.
 */
/** Un item de liste, identique dans les options simples et les groupes. */
function renderOption(option: SelectOption) {
  return (
    <ListBoxItem
      key={option.id}
      id={option.id}
      textValue={option.label}
      isDisabled={option.disabled}
      className={({ isFocused, isSelected, isDisabled }) =>
        [
          'flex cursor-default items-center gap-2 rounded-control px-2 py-1.5 type-control-md outline-hidden select-none',
          isDisabled && 'pointer-events-none opacity-50',
          isFocused && 'bg-secondary',
          isSelected && 'font-medium',
        ]
          .filter(Boolean)
          .join(' ')
      }
    >
      {({ isSelected }) => (
        <>
          <span className="flex-1 truncate">
            {option.label}
            {option.description && (
              <span className="block type-control-xs text-muted-foreground">
                {option.description}
              </span>
            )}
          </span>
          {isSelected && <Check className="shrink-0 text-primary" />}
        </>
      )}
    </ListBoxItem>
  );
}

export function Select({
  label,
  hideLabel = false,
  options,
  groups,
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Sélectionner…',
  size = 'md',
  invalid = false,
  disabled = false,
  name,
  id,
  testId,
  className,
}: SelectProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  // react-aria ne pose `aria-invalid` que sur la racine (`data-invalid`) :
  // le déclencheur n'est pas annoncé invalide. `filterDOMProps` retire aussi
  // l'attribut passé en prop, d'où la pose manuelle — sans elle, l'erreur
  // n'existerait que pour les voyants (même défaut que sur `Input`).
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    if (invalid) trigger.setAttribute('aria-invalid', 'true');
    else trigger.removeAttribute('aria-invalid');
  }, [invalid]);

  return (
    <AriaSelect
      aria-label={hideLabel ? label : undefined}
      placeholder={placeholder}
      // Ne contrôler la sélection que si l'appelant la contrôle : passer
      // `selectedKey={null}` en permanence figerait le composant sur le
      // placeholder, même après un choix.
      {...(value !== undefined
        ? { selectedKey: value }
        : { defaultSelectedKey: defaultValue ?? null })}
      onSelectionChange={(key) => onValueChange?.(String(key ?? ''))}
      isInvalid={invalid}
      isDisabled={disabled}
      name={name}
      className={cn('flex w-full min-w-0 flex-col gap-1.5', className)}
    >
      {!hideLabel && <Label className="type-control-sm font-medium text-foreground">{label}</Label>}

      <AriaButton
        ref={triggerRef}
        id={id}
        data-testid={testId}
        aria-label={hideLabel ? label : undefined}
        className={buttonClasses({
          variant: 'outline',
          size,
          className: [
            'w-full justify-between font-normal',
            invalid && 'border-destructive',
            'data-[pressed]:bg-secondary',
          ]
            .filter(Boolean)
            .join(' '),
        })}
      >
        {/* `SelectValue` affiche le libellé de l'option active, ou le
            placeholder quand rien n'est choisi. */}
        <SelectValue className="truncate data-[placeholder]:text-muted-foreground" />
        <ChevronDown className="shrink-0 text-muted-foreground" strokeWidth={1.5} />
      </AriaButton>

      <Popover
        offset={4}
        className="w-[--trigger-width] rounded-panel border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-hidden"
      >
        <ListBox className="max-h-72 overflow-auto outline-hidden">
          {options.map(renderOption)}
          {groups?.map((group) => (
            <ListBoxSection key={group.label} className="pt-1">
              <Header className="px-2 py-1 type-control-xs font-medium text-muted-foreground">
                {group.label}
              </Header>
              {group.options.map(renderOption)}
            </ListBoxSection>
          ))}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
