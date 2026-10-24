'use client';

import { useId, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@qoe/utils';
import {
  Button as AriaButton,
  ColorArea as AriaColorArea,
  ColorField as AriaColorField,
  ColorSlider as AriaColorSlider,
  ColorThumb,
  Dialog,
  DialogTrigger,
  Input as AriaInput,
  Label,
  Popover,
} from 'react-aria-components';

import { buttonClasses } from '../button/button';
import { FIELD_SIZES, type Size } from '../contract';

// =====================================================================
// 🎨 Couleur — trois gestes, une valeur
// =====================================================================
// 📖 Une couleur ne se saisit pas seulement au clavier : on la choisit
//    dans un dégradé (ColorArea), on la règle finement (curseur de teinte)
//    et on la colle en hexadécimal (ColorField). Les trois écrivent la même
//    valeur, au format hexadécimal, sans conversion à la charge de l'écran.
//
// 🎯 react-aria est le seul interpréteur : on ne reparse jamais une chaîne
//    à la main. Une saisie invalide reste invalide (le champ la signale) au
//    lieu de devenir `#000000` silencieusement.
// =====================================================================

/** Valeur par défaut quand aucune couleur n'est fournie (noir). */
const DEFAULT_COLOR = '#000000';

function toHex(value: string | null | undefined) {
  return value ?? DEFAULT_COLOR;
}

export interface ColorSwatchProps {
  /** Couleur au format hexadécimal. */
  color: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SWATCH_SIZES = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-8',
} as const;

/**
 * Pastille de couleur.
 *
 * Le damier derrière la couleur n'est pas décoratif : sans lui, une couleur
 * translucide ressemble à un blanc cassé et l'utilisateur ne voit pas qu'il
 * a choisi `transparent`.
 */
export function ColorSwatch({ color, size = 'md', className }: ColorSwatchProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-block shrink-0 overflow-hidden rounded-element ring-1 ring-inset ring-black/10',
        SWATCH_SIZES[size],
        className
      )}
      style={{
        // Damier de transparence en fond, couleur par-dessus : deux couches,
        // pas un gradient Tailwind illisible.
        backgroundImage:
          'conic-gradient(rgba(0,0,0,0.1) 25%, transparent 0 50%, rgba(0,0,0,0.1) 0 75%, transparent 0)',
        backgroundSize: '6px 6px',
      }}
    >
      <span className="absolute inset-0" style={{ backgroundColor: toHex(color) }} />
    </span>
  );
}

export interface ColorFieldProps {
  /** Nom accessible. */
  label: string;
  hideLabel?: boolean;
  /** Couleur hexadécimale (`#rrggbb`). */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  size?: Size;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  testId?: string;
}

/**
 * Champ de couleur hexadécimal.
 *
 * C'est le seul des trois gestes qui accepte un copier-coller depuis un
 * outil de design, et le seul qui reste utilisable sans souris.
 */
export function ColorField({
  label,
  hideLabel = false,
  value,
  defaultValue,
  onValueChange,
  size = 'md',
  invalid = false,
  disabled = false,
  className,
  id,
  testId,
}: ColorFieldProps) {
  return (
    <AriaColorField
      aria-label={hideLabel ? label : undefined}
      isInvalid={invalid}
      isDisabled={disabled}
      {...(value !== undefined ? { value: toHex(value) } : { defaultValue: toHex(defaultValue) })}
      onChange={(color) => color && onValueChange?.(color.toString('hex'))}
      className={cn('flex w-full min-w-0 flex-col gap-1.5', className)}
    >
      {!hideLabel && <Label className="type-control-sm font-medium text-foreground">{label}</Label>}
      <div
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-control border border-input bg-background px-2',
          'transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25',
          FIELD_SIZES[size].split(' ')[0],
          invalid && 'border-destructive focus-within:ring-destructive/20',
          disabled && 'pointer-events-none opacity-50'
        )}
      >
        <ColorSwatch
          color={value ?? defaultValue ?? DEFAULT_COLOR}
          size={size === 'lg' ? 'lg' : 'sm'}
        />
        <AriaInput
          id={id}
          data-testid={testId}
          aria-invalid={invalid || undefined}
          className={cn(
            'min-w-0 flex-1 bg-transparent font-mono uppercase text-foreground outline-hidden',
            'placeholder:text-muted-foreground/70',
            size === 'xs' || size === 'sm' ? 'type-control-xs' : 'type-control-sm'
          )}
        />
      </div>
    </AriaColorField>
  );
}

export interface ColorAreaProps {
  /** Nom accessible de la zone (souvent « Couleur »). */
  label?: string;
  /** Couleur hexadécimale (`#rrggbb`). */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Canal horizontal du dégradé. */
  xChannel?: 'saturation' | 'brightness' | 'hue';
  /** Canal vertical du dégradé. */
  yChannel?: 'saturation' | 'brightness' | 'lightness';
  /**
   * Espace de couleur des deux canaux. `hsb` par défaut : c'est celui de
   * `saturation`/`brightness`, et une aire en `rgb` refuse ces canaux
   * (« Unknown color channel ») au lieu de les convertir.
   */
  colorSpace?: 'rgb' | 'hsl' | 'hsb';
  disabled?: boolean;
  className?: string;
  testId?: string;
}

/**
 * Zone de dégradé à deux axes.
 *
 * Le fond vient de react-aria (`defaultStyle.background`), qui le calcule à
 * partir des canaux réellement pilotés : sans lui, un axe `xChannel="hue"`
 * afficherait encore un dégradé de saturation.
 */
export function ColorArea({
  label = 'Couleur',
  value,
  defaultValue,
  onValueChange,
  xChannel = 'saturation',
  yChannel = 'brightness',
  colorSpace = 'hsb',
  disabled = false,
  className,
  testId,
}: ColorAreaProps) {
  return (
    <AriaColorArea
      aria-label={label}
      data-testid={testId}
      xChannel={xChannel}
      yChannel={yChannel}
      colorSpace={colorSpace}
      isDisabled={disabled}
      {...(value !== undefined ? { value: toHex(value) } : { defaultValue: toHex(defaultValue) })}
      onChange={(color) => color && onValueChange?.(color.toString('hex'))}
      className={cn(
        'relative aspect-square w-full touch-none select-none rounded-panel',
        'ring-1 ring-inset ring-black/10',
        disabled && 'opacity-50',
        className
      )}
      style={({ defaultStyle }) => ({ background: defaultStyle.background }) as CSSProperties}
    >
      <ColorThumb
        className={cn(
          'size-4 rounded-full border-[3px] border-white shadow',
          'ring-1 ring-black/20 outline-hidden',
          'data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring data-[focus-visible]:ring-offset-2',
          'data-[dragging]:size-5 transition-[width,height] duration-150'
        )}
        style={({ defaultStyle }) =>
          ({
            backgroundColor: defaultStyle.backgroundColor,
            left: defaultStyle.left,
            top: defaultStyle.top,
            transform: defaultStyle.transform,
          }) as CSSProperties
        }
      />
    </AriaColorArea>
  );
}

export interface ColorPickerProps {
  label: string;
  /** Couleur hexadécimale courante. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Couleurs proposées dans le panneau (hexadécimal). */
  presets?: string[];
  size?: Size;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

/**
 * Sélecteur complet : un déclencheur, un panneau, trois gestes.
 *
 * Le déclencheur affiche la couleur ET son code : un carré seul ne dit pas
 * ce qu'on va soumettre, et ne se transmet pas par copier-coller.
 */
export function ColorPicker({
  label,
  value,
  defaultValue,
  onValueChange,
  presets,
  size = 'md',
  disabled = false,
  className,
  testId,
}: ColorPickerProps) {
  const fallbackId = useId();
  const current = toHex(value ?? defaultValue);

  return (
    <DialogTrigger>
      <AriaButton
        isDisabled={disabled}
        data-testid={testId}
        className={buttonClasses({
          variant: 'outline',
          size,
          className: cn('justify-start gap-2 font-normal', className),
        })}
        aria-label={`${label} : ${current}`}
      >
        <ColorSwatch color={current} size="sm" />
        <span className="font-mono uppercase">{current}</span>
        <ChevronDown className="ml-auto size-3.5 text-muted-foreground" strokeWidth={1.75} />
      </AriaButton>

      <Popover
        offset={4}
        placement="bottom start"
        className="w-64 rounded-panel border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-hidden"
      >
        <Dialog aria-label={label} className="flex flex-col gap-3 outline-hidden">
          <ColorArea
            label={label}
            value={value}
            defaultValue={defaultValue}
            onValueChange={onValueChange}
          />

          <AriaColorSlider
            aria-label={`Teinte de ${label}`}
            channel="hue"
            // La teinte n'existe pas en RGB : sans espace explicite,
            // react-aria lève « Unknown color channel: hue ».
            colorSpace="hsl"
            {...(value !== undefined
              ? { value: toHex(value) }
              : { defaultValue: toHex(defaultValue) })}
            onChange={(color) => color && onValueChange?.(color.toString('hex'))}
            className="relative h-4 w-full touch-none select-none rounded-full ring-1 ring-inset ring-black/10"
            style={({ defaultStyle }) => ({ background: defaultStyle.background }) as CSSProperties}
          >
            <ColorThumb
              className="size-4 rounded-full border-[3px] border-white shadow ring-1 ring-black/20 outline-hidden"
              style={({ defaultStyle }) => ({
                backgroundColor: defaultStyle.backgroundColor,
                left: defaultStyle.left,
                top: defaultStyle.top,
              })}
            />
          </AriaColorSlider>

          <ColorField
            label={label}
            hideLabel
            size={size}
            value={value}
            defaultValue={defaultValue}
            onValueChange={onValueChange}
            id={`${fallbackId}-hex`}
          />

          {presets && presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Couleurs proposées">
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={preset}
                  onClick={() => onValueChange?.(preset)}
                  className="rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <ColorSwatch color={preset} size="md" />
                </button>
              ))}
            </div>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
