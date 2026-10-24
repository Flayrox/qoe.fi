'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@qoe/utils';

// =====================================================================
// 👤 Avatar — image de personne, avec repli lisible
// =====================================================================
// 📖 Un avatar a trois états, et la plupart des implémentations n'en
//    traitent qu'un : l'image charge, l'image échoue, il n'y a pas d'image.
//    Le repli n'est pas un carré vide : ce sont les initiales, sur un fond
//    déterministe dérivé du nom — deux personnes ne se ressemblent pas par
//    hasard, et la même personne garde la même couleur.
// =====================================================================

const SIZES = {
  xs: 'size-6 type-control-xs',
  sm: 'size-8 type-control-xs',
  md: 'size-10 type-control-sm',
  lg: 'size-12 type-control-md',
  xl: 'size-16 type-control-lg',
} as const;

export type AvatarSize = keyof typeof SIZES;

/** Rayon commun : rond pour une personne, jamais un carré arrondi. */
const SHAPE = 'rounded-full';

/**
 * Palette de repli. Volontairement restreinte et lue dans les tokens
 * sémantiques : six teintes suffisent à distinguer des personnes, et
 * davantage produirait des combinaisons illisibles sur l'un des thèmes.
 */
const FALLBACK_TONES = [
  'bg-primary/15 text-primary',
  'bg-success/15 text-success',
  'bg-neural-blue/15 text-neural-blue',
  'bg-neural-amber/15 text-neural-amber',
  'bg-muted text-foreground',
  'bg-secondary text-secondary-foreground',
];

/** Hachage simple et stable : le même nom donne toujours la même teinte. */
function toneFor(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 997;
  }
  return FALLBACK_TONES[hash % FALLBACK_TONES.length];
}

function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export interface AvatarProps {
  /** Nom complet : sert d'`alt`, d'initiales et de graine de couleur. */
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
  /** Anneau de séparation, utile quand les avatars se chevauchent. */
  ring?: boolean;
}

export function Avatar({ name, src, size = 'md', className, ring = false }: AvatarProps) {
  // Une URL cassée ne doit pas laisser une case vide : on bascule sur les
  // initiales. On retient *quelle* URL a échoué plutôt qu'un simple
  // booléen, pour qu'une nouvelle image retente sa chance.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const showImage = Boolean(src) && failedSrc !== src;

  // ⚠️ L'échec peut arriver AVANT l'hydratation : le serveur envoie la
  // balise `<img>`, le navigateur échoue à la charger, puis React hydrate
  // et n'a plus d'événement `error` à recevoir. `onError` seul laisserait
  // donc une icône d'image cassée à la place des initiales — on rattrape
  // l'état déjà résolu au montage.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailedSrc(src ?? null);
  }, [src]);

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden',
        SHAPE,
        SIZES[size],
        showImage ? 'bg-muted' : toneFor(name),
        ring && 'ring-2 ring-background',
        'font-medium select-none',
        className
      )}
    >
      {showImage ? (
        <img
          ref={imageRef}
          src={src ?? undefined}
          alt=""
          onError={() => setFailedSrc(src ?? null)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span aria-hidden>{initialsOf(name)}</span>
      )}
    </span>
  );
}

export interface AvatarGroupProps {
  people: { name: string; src?: string | null }[];
  /** Nombre affiché avant le compteur « +N ». */
  max?: number;
  size?: AvatarSize;
  className?: string;
}

/**
 * Pile d'avatars qui se chevauchent.
 *
 * L'ordre est significatif : le premier est devant (z-index décroissant),
 * donc on lit la liste dans le sens de lecture. Le compteur est annoncé
 * avec le nom des personnes masquées, sinon « +3 » ne veut rien dire pour
 * un lecteur d'écran.
 */
export function AvatarGroup({ people, max = 4, size = 'md', className }: AvatarGroupProps) {
  const visible = people.slice(0, max);
  const hidden = people.slice(max);

  return (
    <div className={cn('flex items-center', className)}>
      <div className="flex -space-x-2">
        {visible.map((person, index) => (
          <Avatar
            key={`${person.name}-${index}`}
            name={person.name}
            src={person.src}
            size={size}
            ring
            className="transition-transform duration-150 hover:z-10 hover:-translate-y-0.5"
          />
        ))}
        {hidden.length > 0 && (
          <span
            className={cn(
              'relative inline-flex shrink-0 items-center justify-center rounded-full',
              'bg-secondary type-control-xs font-medium text-secondary-foreground ring-2 ring-background',
              SIZES[size]
            )}
            title={hidden.map((person) => person.name).join(', ')}
          >
            +{hidden.length}
          </span>
        )}
      </div>
      {hidden.length > 0 && (
        <span className="sr-only">
          {hidden.length} autre{hidden.length > 1 ? 's' : ''} :{' '}
          {hidden.map((p) => p.name).join(', ')}
        </span>
      )}
    </div>
  );
}

/** Groupe d'avatars libres (avatars déjà rendus par l'appelant). */
export function AvatarStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center -space-x-2', className)}>{children}</div>;
}
