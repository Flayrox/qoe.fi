'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';

import { cn } from '@qoe/utils';
import {
  Button as AriaButton,
  ComboBox as AriaComboBox,
  Group,
  Input as AriaInput,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
} from 'react-aria-components';

import { DISABLED, FIELD_SIZES, type Size } from '../contract';
import { FieldError } from '../field/field-error';

// =====================================================================
// 🔎 ComboBox — un champ qui propose, sans imposer
// =====================================================================
// 📖 Trois choses qu'un `<input list>` natif ne sait pas faire, et qui font
//    toute la différence à l'usage :
//
//    - filtrer sans tenir compte des accents (« epe » trouve « Éphémère »),
//      parce qu'on écrit en français et que personne ne tape les diacritiques
//      dans une recherche ;
//    - annoncer au lecteur d'écran le nombre de résultats et l'option
//      survolée, au lieu d'une liste muette ;
//    - garder la valeur libre quand `allowsCustomValue` est vrai, et rendre
//      alors une chaîne — sinon une clé d'option.
//
// 🎯 La composition vient de react-aria (Group + Input + Popover + ListBox),
//    le filtre est le nôtre : la normalisation NFD est une décision produit,
//    pas un détail de bibliothèque.
// =====================================================================

export interface ComboBoxOption {
  id: string;
  label: string;
  /** Texte secondaire : slug, précision, effectif. Il reste dans la liste. */
  description?: string;
  disabled?: boolean;
}

export interface ComboBoxProps {
  /** Nom accessible du champ. */
  label: string;
  hideLabel?: boolean;
  options: ComboBoxOption[];
  /** Clé de l'option choisie (ou texte libre avec `allowsCustomValue`). */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string) => void;
  /** Valeur contrôlée du champ de recherche. */
  inputValue?: string;
  defaultInputValue?: string;
  onInputChange?: (value: string) => void;
  placeholder?: string;
  /** Message quand le filtre ne laisse rien passer. */
  emptyMessage?: string;
  /** Accepte une valeur qui n'est pas dans la liste (saisie libre). */
  allowsCustomValue?: boolean;
  /**
   * Quand la liste s'ouvre. `input` (défaut) suit la frappe ; `focus` ouvre
   * au clic comme un `<select>` ; `manual` laisse l'appelant décider (via
   * `isOpen`/`onOpenChange`, par exemple pour l'ouvrir depuis un raccourci).
   */
  menuTrigger?: 'focus' | 'input' | 'manual';
  /** État d'ouverture contrôlé. */
  isOpen?: boolean;
  /** Ouvre la liste au premier rendu. */
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** Affiche une croix quand une valeur est choisie. */
  clearable?: boolean;
  onClear?: () => void;
  size?: Size;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  errorMessage?: ReactNode;
  /** Nom soumis avec le formulaire (champ caché de react-aria). */
  name?: string;
  id?: string;
  testId?: string;
  className?: string;
}

/**
 * Normalisation de recherche : accents retirés, casse ignorée.
 *
 * `epe` doit trouver `Éphémère`, et `a` doit trouver `Éphémère` comme
 * `Awa`. On retire les diacritiques par décomposition NFD : c'est la seule
 * méthode qui marche pour les langues latines sans table de correspondance.
 */
/** Échelle typographique du champ, indépendante de sa hauteur. */
const TYPE_SCALE: Record<Size, string> = {
  xs: 'type-control-xs',
  sm: 'type-control-sm',
  md: 'type-control-md',
  lg: 'type-control-lg',
};

/**
 * Filtre partagé et testable : normalisation NFD, puis inclusion.
 *
 * Exporté parce que c'est LA règle produit de ce composant (une recherche
 * « eph » doit trouver « Éphémère »), et qu'une règle sans test finit par
 * régresser au premier refactor du rendu.
 */
export function filterComboBoxOptions(options: ComboBoxOption[], query: string) {
  const needle = fold(query);
  if (!needle) return options;
  return options.filter((option) =>
    fold(`${option.label} ${option.description ?? ''}`).includes(needle)
  );
}

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function ComboBox({
  label,
  hideLabel = false,
  options,
  value,
  defaultValue,
  onValueChange,
  inputValue,
  defaultInputValue,
  onInputChange,
  placeholder = 'Rechercher…',
  emptyMessage = 'Aucun résultat',
  allowsCustomValue = false,
  menuTrigger = 'input',
  isOpen,
  defaultOpen,
  onOpenChange,
  clearable = false,
  onClear,
  size = 'md',
  invalid = false,
  disabled = false,
  required = false,
  errorMessage,
  name,
  id,
  testId,
  className,
}: ComboBoxProps) {
  const errorId = useId();
  // Affichage initial : la saisie par défaut si elle existe, sinon le
  // libellé de la valeur déjà sélectionnée (une valeur sans texte affiché
  // laisserait le placeholder sur un champ pourtant rempli).
  const [internalQuery, setInternalQuery] = useState(
    () => defaultInputValue ?? options.find((option) => option.id === value)?.label ?? ''
  );
  const query = inputValue ?? internalQuery;

  // Le filtre s'applique aux options déjà fournies : react-aria garde la
  // liste et le clavier, il ne décide pas de ce qui est « proche ».
  //
  // ⚠️ Le champ affiche le libellé de la sélection. Filtrer sur ce texte
  // réduirait la liste ouverte à l'option déjà choisie : quand la saisie EST
  // la sélection, on montre tout, sinon on filtre.
  const selectedLabel = options.find((option) => option.id === value)?.label;
  const filtered = useMemo(
    () => (query === selectedLabel ? options : filterComboBoxOptions(options, query)),
    [options, query, selectedLabel]
  );

  const hasValue = value !== undefined ? Boolean(value) : Boolean(defaultValue);

  // ⚠️ Le champ affiche `inputValue`, pas la clé sélectionnée. Sans cette
  // synchronisation, choisir « Essai » laisserait le placeholder à l'écran :
  // la valeur serait bonne, l'affichage faux. On ne le fait que si
  // l'appelant ne contrôle pas la saisie.
  // On ne réagit qu'à un CHANGEMENT de `value` : au montage, la saisie
  // initiale (`defaultInputValue`) est la bonne, la remplacer effacerait
  // une recherche déjà tapée par l'écran.
  const previousValue = useRef(value);
  useEffect(() => {
    if (inputValue !== undefined) return;
    if (previousValue.current === value) return;
    previousValue.current = value;
    const label = options.find((option) => option.id === value)?.label;
    setInternalQuery(label ?? value ?? '');
  }, [value, options, inputValue]);

  return (
    <AriaComboBox
      aria-label={hideLabel ? label : undefined}
      isInvalid={invalid}
      isDisabled={disabled}
      isRequired={required}
      allowsCustomValue={allowsCustomValue}
      menuTrigger={menuTrigger}
      // ⚠️ react-aria filtre aussi, et son filtre est sensible aux accents :
      // il vidait la liste qu'on venait de remplir (« epe » ne trouvait plus
      // « Éphémère ») et, collection vide, le panneau refusait de s'ouvrir.
      // Un seul filtre : le nôtre.
      defaultFilter={() => true}
      allowsEmptyCollection
      {...(isOpen !== undefined ? { isOpen } : { defaultOpen })}
      onOpenChange={onOpenChange}
      inputValue={query}
      onInputChange={(next) => {
        if (inputValue === undefined) setInternalQuery(next);
        onInputChange?.(next);
      }}
      {...(value !== undefined
        ? { selectedKey: value }
        : { defaultSelectedKey: defaultValue ?? null })}
      onSelectionChange={(key) => {
        const next = String(key ?? '');
        if (inputValue === undefined) {
          setInternalQuery(options.find((option) => option.id === next)?.label ?? next);
        }
        onValueChange?.(next);
      }}
      name={name}
      className={cn('flex w-full min-w-0 flex-col gap-1.5', className)}
    >
      {({ isInvalid }) => (
        <>
          {!hideLabel && (
            <Label className="type-control-sm font-medium text-foreground">{label}</Label>
          )}

          <Group
            className={cn(
              'flex w-full min-w-0 items-center gap-1 rounded-control border border-input bg-background',
              'transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25',
              FIELD_SIZES[size].split(' ')[0],
              'px-2',
              isInvalid && 'border-destructive focus-within:ring-destructive/20',
              DISABLED
            )}
          >
            <AriaInput
              id={id}
              data-testid={testId}
              placeholder={placeholder}
              aria-invalid={invalid || undefined}
              aria-describedby={errorMessage ? errorId : undefined}
              className={cn(
                'min-w-0 flex-1 bg-transparent text-foreground outline-hidden',
                'placeholder:text-muted-foreground/70',
                TYPE_SCALE[size]
              )}
            />

            {clearable && hasValue && (
              // ⚠️ Un `<button>` nu, pas le `Button` de react-aria : dans un
              // ComboBox, ce dernier reçoit le rôle de déclencheur de liste
              // (`aria-haspopup`, `aria-expanded`) et la croix se mettrait à
              // annoncer « ouvre la liste » au lieu d'« effacer ».
              <button
                type="button"
                aria-label="Effacer"
                className="flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                onClick={() => {
                  onValueChange?.('');
                  if (inputValue === undefined) setInternalQuery('');
                  onClear?.();
                }}
              >
                <X className="size-3" strokeWidth={2} />
              </button>
            )}

            <AriaButton className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
              <ChevronDown className="size-3.5" strokeWidth={1.75} />
            </AriaButton>
          </Group>

          {errorMessage ? <FieldError id={errorId}>{errorMessage}</FieldError> : null}

          <Popover
            offset={4}
            className="w-[--trigger-width] rounded-panel border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-hidden"
          >
            <ListBox
              items={filtered}
              className="max-h-72 overflow-auto outline-hidden"
              renderEmptyState={() => (
                <div className="px-2 py-6 text-center type-control-sm text-muted-foreground">
                  {emptyMessage}
                </div>
              )}
            >
              {(option) => (
                <ListBoxItem
                  id={option.id}
                  textValue={option.label}
                  isDisabled={option.disabled}
                  className={({ isFocused, isSelected, isDisabled }) =>
                    cn(
                      'flex cursor-default items-center gap-2 rounded-control px-2 py-1.5 type-control-md outline-hidden select-none',
                      isDisabled && 'pointer-events-none opacity-50',
                      isFocused && 'bg-secondary',
                      isSelected && 'font-medium'
                    )
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
                      {isSelected && <span className="text-primary">✓</span>}
                    </>
                  )}
                </ListBoxItem>
              )}
            </ListBox>
          </Popover>
        </>
      )}
    </AriaComboBox>
  );
}
