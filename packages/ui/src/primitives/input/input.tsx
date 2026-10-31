'use client';

import {
  createContext,
  forwardRef,
  useContext,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@qoe/utils';

import { DISABLED, FIELD_SIZES, type Size } from '../contract';

/**
 * Le `size` natif d'un `<input>` est un nombre de caractères — on le retire
 * pour que `size` veuille dire la même chose ici que dans tous les autres
 * composants (une densité). C'est le genre de collision qui rend un design
 * system incohérent : deux sens pour un même nom.
 */
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: Size;
  /** Pose `aria-invalid` et l'anneau destructif : un seul booléen, pas trois classes. */
  invalid?: boolean;
}

/**
 * État hérité du groupe : un champ dans un groupe invalide DOIT être annoncé
 * invalide. Sans ce contexte, il fallait répéter `invalid` aux deux endroits
 * — et l'oubli est silencieux pour les lecteurs d'écran.
 */
const InputGroupContext = createContext<{ invalid: boolean } | null>(null);

/**
 * Champ de saisie.
 *
 * L'état d'erreur se déclare (`invalid`) au lieu de se peindre : le composant
 * pose `aria-invalid`, ce qui donne aux lecteurs d'écran et au style le même
 * signal. `FieldError` s'y rattache par `aria-describedby`.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid, className, ...props },
  ref
) {
  const group = useContext(InputGroupContext);
  const isInvalid = invalid ?? group?.invalid ?? false;

  return (
    <input
      ref={ref}
      aria-invalid={isInvalid || props['aria-invalid'] || undefined}
      className={cn(
        'w-full min-w-0 rounded-control border border-input bg-background text-foreground',
        'transition-colors placeholder:text-muted-foreground/70',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25',
        'focus-visible:outline-none',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        FIELD_SIZES[size],
        DISABLED,
        className
      )}
      {...props}
    />
  );
});

/* ---------------------------------------------------------------------
   Zone de texte
   --------------------------------------------------------------------- */

/**
 * Hauteur MINIMALE par densité, puis croissance libre.
 *
 * Un `<textarea rows={4}>` fait 4 lignes quelle que soit la densité du
 * reste du formulaire ; ici la densité règle la typographie et le padding,
 * et `rows` garde la main sur le nombre de lignes.
 */
const TEXTAREA_SIZES: Record<Size, string> = {
  xs: 'px-2 py-1 type-control-xs',
  sm: 'px-2.5 py-1.5 type-control-sm',
  md: 'px-3 py-2 type-control-md',
  lg: 'px-3.5 py-2.5 type-control-lg',
};

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  size?: Size;
  invalid?: boolean;
}

/**
 * Zone de texte multiligne.
 *
 * Même peau que `Input`, mais `resize-none` par défaut : une poignée de
 * redimensionnement dans une carte de 320 px sert surtout à casser la mise
 * en page. L'appelant peut la rendre (`resize-y`) s'il en a besoin.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { size = 'md', invalid, className, rows = 3, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      className={cn(
        'w-full min-w-0 resize-none rounded-control border border-input bg-background text-foreground',
        'transition-colors placeholder:text-muted-foreground/70',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25',
        'focus-visible:outline-none',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        TEXTAREA_SIZES[size],
        DISABLED,
        className
      )}
      {...props}
    />
  );
});

export interface InputGroupProps {
  children: ReactNode;
  /** Élément collé à gauche (icône, préfixe, bouton). */
  left?: ReactNode;
  /** Élément collé à droite (unité, raccourci, bouton). */
  right?: ReactNode;
  /** Hauteur du groupe ; le champ interne s'y adapte. */
  size?: Size;
  invalid?: boolean;
  className?: string;
}

/**
 * Groupe de champ : encadre le champ et ses éléments satellites.
 *
 * Le cadre et l'anneau de focus vivent sur le **groupe**, pas sur le champ :
 * sinon cliquer sur l'icône ne donne aucun retour, et deux anneaux se
 * superposent. Le champ interne est neutralisé par sélecteurs d'enfants —
 * pas de contexte React, pas de prop cachée, donc `<Input>` reste utilisable
 * seul ou dans un groupe sans qu'on change son appel.
 */
export function InputGroup({
  children,
  left,
  right,
  size = 'md',
  invalid = false,
  className,
}: InputGroupProps) {
  return (
    <InputGroupContext.Provider value={{ invalid }}>
      <div
        className={cn(
          'flex w-full min-w-0 items-center gap-1.5 rounded-control border border-input bg-background',
          'px-2 transition-colors',
          'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25',
          // Seule la hauteur est reprise du champ : le padding du groupe est
          // géré ici, sinon l'icône et le texte se collent au bord.
          FIELD_SIZES[size].split(' ')[0],
          invalid && 'border-destructive focus-within:ring-destructive/20',
          className
        )}
      >
        {left && (
          <span className="flex shrink-0 items-center text-muted-foreground [&_svg]:size-3.5">
            {left}
          </span>
        )}
        <div
          className={cn(
            // `self-stretch` est indispensable : avec `items-center` sur le
            // groupe, un champ en `h-full` se résoudrait contre une hauteur
            // automatique (mesuré : 17 px au lieu de 32) et le clic au milieu
            // du groupe ne donnerait pas le focus.
            'min-w-0 flex-1 self-stretch',
            // Le champ devient transparent : c'est le groupe qui porte le cadre.
            '[&_input]:h-full [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-0',
            '[&_input]:focus-visible:ring-0 [&_input]:focus-visible:ring-offset-0'
          )}
        >
          {children}
        </div>
        {right && (
          <span className="flex shrink-0 items-center gap-1 text-muted-foreground [&_svg]:size-3.5">
            {right}
          </span>
        )}
      </div>
    </InputGroupContext.Provider>
  );
}
