'use client';

import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { Check, Copy } from 'lucide-react';

import { cn } from '@qoe/utils';

import { buttonClasses } from '../button/button';
import type { Size, Tone, Variant } from '../contract';

// =====================================================================
// 📋 CopyButton — copier, et le dire sans changer de ligne
// =====================================================================
// 📖 Porté de la famille « copy-button » d'opensourceui. Copier une valeur
//    (lien de partage, clé d'API, identifiant) est un geste quotidien qui
//    n'a pas besoin d'un toast : le bouton se confirme lui-même, puis
//    reprend son libellé.
//
// 🎯 Trois détails qui font la différence :
//    - les deux libellés occupent la MÊME cellule de grille : le bouton ne
//      change pas de largeur au moment de la confirmation (sinon toute la
//      rangée saute) ;
//    - l'icône est dans un emplacement fixe, remplacée par une coche ;
//    - le résultat est annoncé dans une zone `aria-live` — sinon un
//      lecteur d'écran ne saurait jamais que la copie a réussi.
//
// ⚠️ `navigator.clipboard` peut être absent (contexte non sécurisé, iframe
//    verrouillée). On ne prétend pas avoir copié : le libellé reste, et
//    l'appelant peut exposer une autre sortie (champ en lecture seule).
// =====================================================================

export interface CopyButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'children'
> {
  /** Ce qui est écrit dans le presse-papiers. */
  value: string;
  /** Libellé au repos. Défaut « Copier ». */
  label?: string;
  /** Libellé de confirmation. Défaut « Copié ». */
  copiedLabel?: string;
  /** Durée d'affichage de la confirmation, en ms. Défaut 1600. */
  resetMs?: number;
  variant?: Variant;
  tone?: Tone;
  size?: Size;
  className?: string;
}

function fallbackCopyText(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.top = '-9999px';
  textArea.style.left = '-9999px';
  textArea.setAttribute('readonly', '');
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    document.body.removeChild(textArea);
    return false;
  }
}

const LAYER = 'col-start-1 row-start-1 text-left transition-opacity duration-200 ease-out';

export const CopyButton = forwardRef<HTMLButtonElement, CopyButtonProps>(function CopyButton(
  {
    value,
    label = 'Copier',
    copiedLabel = 'Copié',
    resetMs = 1600,
    variant = 'soft',
    tone = 'neutral',
    size = 'sm',
    className,
    onClick,
    type = 'button',
    ...props
  },
  ref
) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) globalThis.clearTimeout(timerRef.current);
    },
    []
  );

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    let success = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        success = true;
      } catch {
        success = fallbackCopyText(value);
      }
    } else {
      success = fallbackCopyText(value);
    }
    if (!success) return;
    setCopied(true);
    if (timerRef.current !== null) globalThis.clearTimeout(timerRef.current);
    timerRef.current = globalThis.setTimeout(() => setCopied(false), resetMs);
  };

  return (
    <button
      ref={ref}
      type={type}
      data-copied={copied || undefined}
      onClick={handleClick}
      className={buttonClasses({ variant, tone, size, className })}
      {...props}
    >
      <span className="relative size-3.5 shrink-0" aria-hidden>
        <span
          className={cn(
            'absolute inset-0 grid place-items-center transition-opacity duration-200',
            copied ? 'opacity-0' : 'opacity-100'
          )}
        >
          <Copy className="size-3.5" strokeWidth={1.75} />
        </span>
        <span
          className={cn(
            'absolute inset-0 grid place-items-center text-success-text transition-opacity duration-200',
            copied ? 'opacity-100' : 'opacity-0'
          )}
        >
          <Check className="size-3.5" strokeWidth={2.5} />
        </span>
      </span>

      <span className="grid">
        <span aria-hidden={copied} className={cn(LAYER, copied ? 'opacity-0' : 'opacity-100')}>
          {label}
        </span>
        <span
          aria-hidden={!copied}
          className={cn(LAYER, 'text-success-text', copied ? 'opacity-100' : 'opacity-0')}
        >
          {copiedLabel}
        </span>
      </span>

      <span className="sr-only" aria-live="polite">
        {copied ? copiedLabel : ''}
      </span>
    </button>
  );
});
