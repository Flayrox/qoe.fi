'use client';

import { useRouter } from 'next/navigation';
import { useSurfaceHotkeys } from '@qoe/ui';

/**
 * ⌨️ Active les raccourcis de navigation du Studio (`g h`, `g a`, `c a`…)
 * déclarés dans le manifeste de surfaces. Composant sans rendu, monté une
 * seule fois par le layout créateur.
 */
export function SurfaceHotkeys() {
  const router = useRouter();
  useSurfaceHotkeys({
    scope: 'studio',
    onNavigate: (path) => router.push(path),
  });
  return null;
}
