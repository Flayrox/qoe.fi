'use client';

import { useId, type ReactNode } from 'react';

import { cn } from '@qoe/utils';

import type { Tone } from '../contract';

// =====================================================================
// ✍️ AnnotationMark — un trait tracé à la main, pas une décoration
// =====================================================================
// 📖 Trois traits de surligneur réutilisables dans le texte : soulignement,
//    vague, cerne. Ils servent là où la couleur seule ne suffit pas à dire
//    « ceci est annoté » — un lecteur qui annote à la main ne trace pas un
//    rectangle CSS, il tire un trait, et ce trait ne joint pas parfaitement.
//
// 🎯 Le caractère vient d'un filtre SVG (`feTurbulence` +
//    `feDisplacementMap`) qui déplace le tracé de quelques pixels. C'est ce
//    qui évite l'effet « bordure de composant » : la ligne ondule comme un
//    stylo, sans halo ni dégradé.
//
// ⚠️ Deux limites assumées :
//    - une marque porte sur un fragment court et ne se coupe pas en fin de
//      ligne (`nowrap`). Pour souligner un paragraphe entier, on découpe en
//      plusieurs marques, sinon le trait couvrirait le bloc au lieu du texte ;
//    - le trait est `aria-hidden` : l'information doit exister dans le
//      texte, jamais dans la décoration. Un écran lecteur n'a rien à en dire.
// =====================================================================

export type AnnotationVariant = 'underline' | 'wavy' | 'highlight' | 'circle' | 'box';

/** Couleur du trait. `vivid` par défaut : une annotation se voit. */
const TONES: Record<Tone, string> = {
  neutral: 'text-foreground/40',
  brand: 'text-primary',
  vivid: 'text-brand-vivid',
  danger: 'text-destructive',
  success: 'text-success',
};

export interface AnnotationMarkProps {
  children: ReactNode;
  /** Forme du trait. Défaut `underline`. */
  variant?: AnnotationVariant;
  /** Couleur du trait, lue dans les tokens. Défaut `vivid`. */
  tone?: Tone;
  className?: string;
}

export function AnnotationMark({
  children,
  variant = 'underline',
  tone = 'vivid',
  className,
}: AnnotationMarkProps) {
  // `useId` contient des `:` — légaux en HTML, pénibles dans `url(#…)`.
  // On les retire pour que deux marques sur la même page ne partagent
  // jamais le même filtre (la seconde hériterait du déplacement de la
  // première, avec un tracé visiblement faux).
  const uid = useId().replace(/:/g, '');

  const stroke = cn('pointer-events-none absolute text-current', TONES[tone]);

  return (
    <span
      className={cn(
        'relative inline-block whitespace-nowrap',
        variant === 'circle' && 'px-1',
        variant === 'box' && 'px-1.5',
        variant === 'highlight' && 'z-0',
        className
      )}
    >
      <svg aria-hidden className="absolute size-0" focusable="false">
        <defs>
          <filter id={`${uid}-rough`} x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={0.045}
              numOctaves={2}
              seed={4}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={2.4}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <filter id={`${uid}-soft`} x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={0.035}
              numOctaves={2}
              seed={11}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={1.4}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {variant === 'highlight' ? (
        <>
          {/* Le surligneur passe DERRIÈRE le texte : sans ce `z-10`, un
              fond opaque mangerait les jambages. */}
          <span className="relative z-10">{children}</span>
          <svg
            aria-hidden
            viewBox="0 0 170 26"
            preserveAspectRatio="none"
            className={cn(
              stroke,
              'absolute inset-x-[-4%] bottom-[-0.06em] -z-10 h-[1.1em] w-[108%]'
            )}
          >
            <path
              d="M4,17 C2,11 5,7 12,6 C45,2 95,2 138,4 C152,5 164,7 166,13 C167,18 163,21 155,22 C112,24 60,24 16,22 C8,21.5 4,20 4,17 Z"
              fill="currentColor"
              opacity={0.28}
              filter={`url(#${uid}-soft)`}
            />
          </svg>
        </>
      ) : (
        <>
          {children}
          {variant === 'underline' && (
            <svg
              aria-hidden
              viewBox="0 0 140 10"
              preserveAspectRatio="none"
              className={cn(stroke, 'absolute bottom-[-0.28em] left-[-1%] h-[0.5em] w-[102%]')}
            >
              <path
                d="M3,6 C40,3 100,3 137,5"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                fill="none"
                filter={`url(#${uid}-soft)`}
              />
            </svg>
          )}

          {variant === 'wavy' && (
            <svg
              aria-hidden
              viewBox="0 0 140 14"
              preserveAspectRatio="none"
              className={cn(stroke, 'absolute bottom-[-0.36em] left-[-2%] h-[0.7em] w-[104%]')}
            >
              <path
                d="M2,6 Q5.5,3 9,6 T17,6 T25,6 T33,6 T41,6 T49,6 T57,6 T65,6 T73,6 T81,6 T89,6 T97,6 T105,6 T113,6 T121,6 T129,6 T137,6"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                fill="none"
                filter={`url(#${uid}-soft)`}
              />
            </svg>
          )}

          {variant === 'circle' && (
            <svg
              aria-hidden
              viewBox="0 0 220 64"
              preserveAspectRatio="none"
              className={cn(
                stroke,
                'absolute inset-[-0.55em_-0.5em] h-[calc(100%+1.1em)] w-[calc(100%+1em)]'
              )}
            >
              <path
                d="M40,40 C20,23 53,7 102,5 C153,3 207,11 211,29 C215,47 167,60 109,60 C59,60 15,53 19,35 C21,27 27,22 37,20"
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinecap="round"
                fill="none"
                filter={`url(#${uid}-rough)`}
              />
              <path
                d="M43,37 C28,25 58,9 105,7 C151,6 199,14 206,29 C212,45 167,57 110,58"
                stroke="currentColor"
                strokeWidth={1.4}
                strokeLinecap="round"
                fill="none"
                opacity={0.5}
                filter={`url(#${uid}-soft)`}
              />
            </svg>
          )}

          {variant === 'box' && (
            <svg
              aria-hidden
              viewBox="0 0 200 64"
              preserveAspectRatio="none"
              className={cn(
                stroke,
                'absolute inset-[-0.35em_-0.4em] h-[calc(100%+0.7em)] w-[calc(100%+0.8em)]'
              )}
            >
              <path
                d="M12,10 C60,6 140,6 188,10 C193,26 193,40 188,54 C140,58 60,58 12,54 C7,40 7,26 12,10 Z"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                filter={`url(#${uid}-rough)`}
              />
            </svg>
          )}
        </>
      )}
    </span>
  );
}
