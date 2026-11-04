'use client';

import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
} from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@qoe/utils';

import {
  DISABLED,
  FOCUS_RING,
  ICON_SLOT,
  SIZE_CLASSES,
  type Size,
  type Tone,
  type Variant,
} from '../contract';

/**
 * Matrice variante × ton.
 *
 * Volontairement écrite à la main plutôt que générée : chaque case a été
 * choisie pour son contraste réel, et une génération automatique produirait
 * des combinaisons illisibles (`solid` + `success` sur fond clair, etc.).
 * Toute nouvelle case doit être vérifiée dans les deux thèmes.
 */
const SURFACES: Record<Variant, Record<Tone, string>> = {
  solid: {
    neutral: 'bg-foreground text-background hover:bg-foreground/90',
    brand: 'bg-primary text-primary-foreground hover:bg-primary/90',
    vivid: 'bg-brand-vivid text-brand-vivid-foreground hover:bg-brand-vivid/90',
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    success: 'bg-success text-success-foreground hover:bg-success/90',
  },
  soft: {
    neutral: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
    brand: 'bg-primary/10 text-primary hover:bg-primary/15',
    vivid: 'bg-brand-vivid/15 text-brand-vivid-strong hover:bg-brand-vivid/20',
    danger: 'bg-destructive/10 text-destructive-text hover:bg-destructive/15',
    success: 'bg-success/15 text-success-text hover:bg-success/25',
  },
  outline: {
    neutral: 'border border-border bg-transparent text-foreground hover:bg-secondary',
    brand: 'border border-primary/40 bg-transparent text-primary hover:bg-primary/10',
    vivid:
      'border border-brand-vivid/50 bg-transparent text-brand-vivid-strong hover:bg-brand-vivid/10',
    danger:
      'border border-destructive/40 bg-transparent text-destructive-text hover:bg-destructive/10',
    success: 'border border-success/40 bg-transparent text-success-text hover:bg-success/10',
  },
  ghost: {
    neutral: 'bg-transparent text-foreground hover:bg-secondary',
    brand: 'bg-transparent text-primary hover:bg-primary/10',
    vivid: 'bg-transparent text-brand-vivid-strong hover:bg-brand-vivid/10',
    danger: 'bg-transparent text-destructive-text hover:bg-destructive/10',
    success: 'bg-transparent text-success-text hover:bg-success/10',
  },
};

export interface ButtonStyleOptions {
  variant?: Variant;
  tone?: Tone;
  size?: Size;
  shape?: 'default' | 'icon';
  block?: boolean;
  className?: string;
}

/**
 * Les classes d'un bouton, sans le rendu.
 *
 * Utile quand le bouton doit être fourni par un autre moteur : les triggers
 * de react-aria (MenuTrigger, Select) exigent leur propre `<Button>` pour
 * recevoir la presse et le clavier. On garde alors exactement la même peau,
 * sans dupliquer la matrice variante × ton.
 */
export function buttonClasses({
  variant = 'soft',
  tone = 'neutral',
  size = 'md',
  shape = 'default',
  block = false,
  className,
}: ButtonStyleOptions = {}) {
  return cn(
    'inline-flex select-none items-center justify-center whitespace-nowrap',
    'rounded-control font-medium transition-colors duration-150',
    SIZE_CLASSES[size],
    shape === 'icon' && 'aspect-square px-0',
    SURFACES[variant][tone],
    FOCUS_RING,
    DISABLED,
    ICON_SLOT,
    block && 'w-full',
    className
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Poids visuel. Défaut `soft` : l'action courante, pas l'action principale. */
  variant?: Variant;
  /** Intention. Défaut `neutral` — la couleur est un choix, pas un défaut. */
  tone?: Tone;
  /** Densité, alignée sur `--control-h-*`. Défaut `md`. */
  size?: Size;
  /**
   * `icon` donne un bouton carré (même largeur que hauteur), sans padding
   * horizontal — le cas de la croix de fermeture ou de l'action de barre.
   * Le libellé reste obligatoire côté accessibilité (`aria-label`).
   */
  shape?: 'default' | 'icon';
  /** Occupe toute la largeur de son conteneur. */
  block?: boolean;
  /**
   * Action en cours : le bouton n'est plus activable, annonce `aria-busy`
   * et remplace son icône de tête par un spinner. Le libellé reste en
   * place — la largeur ne saute donc pas au moment du clic.
   */
  loading?: boolean;
  /**
   * Rend l'élément enfant à la place du `<button>` (`next/link`, `<a>`…)
   * en lui appliquant la peau du contrat. L'enfant doit être unique.
   *
   * ```tsx
   * <Button asChild variant="solid" tone="brand">
   *   <Link href="/articles">Nouvel article</Link>
   * </Button>
   * ```
   */
  asChild?: boolean;
}

/**
 * Le bouton de qoe.fi — et à ce titre le composant de référence du package :
 * tout ce qui suit (champ, onglet, badge) reprend cette structure.
 *
 * Trois décisions à connaître :
 *
 * 1. **`type="button"` par défaut.** Un `<button>` sans `type` dans un
 *    formulaire déclenche un submit : c'est la fuite la plus fréquente des
 *    design systems maison. On inverse le défaut, et `type="submit"` reste
 *    possible explicitement.
 * 2. **Aucune couleur en dur.** Chaque case de `SURFACES` lit un token
 *    sémantique, donc le composant suit les deux thèmes sans code.
 * 3. **`className` est fusionné, pas remplacé.** Le point d'appel peut
 *    ajuster la disposition (largeur, marge), pas l'identité visuelle.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'soft',
    tone = 'neutral',
    size = 'md',
    shape = 'default',
    block = false,
    loading = false,
    asChild = false,
    className,
    type = 'button',
    children,
    ...props
  },
  ref
) {
  const classes = buttonClasses({ variant, tone, size, shape, block, className });

  if (asChild) {
    // `Children.only` lève si l'appelant passe plusieurs enfants : c'est
    // voulu, un bouton-lien ne peut envelopper qu'un seul élément.
    const child = Children.only(children) as ReactElement<Record<string, unknown>>;

    if (!isValidElement(child)) {
      throw new Error('`Button asChild` attend un unique élément React.');
    }

    return cloneElement(child, {
      ...(props as Record<string, unknown>),
      ref,
      className: cn(classes, child.props.className as string | undefined),
      'data-slot': 'button',
    });
  }

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      // `loading` n'est pas décoratif : le clic doit être impossible, sinon
      // on double la requête que le spinner est censé représenter.
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading ? '' : undefined}
      className={classes}
    >
      {loading && <Loader2 aria-hidden className="animate-spin" />}
      {children}
    </button>
  );
});
