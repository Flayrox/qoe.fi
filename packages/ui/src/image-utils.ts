import type { ImageProps } from 'next/image';

import { isOptimizableImageHost } from '@qoe/supabase/storage';

/**
 * Décide si `next/image` peut optimiser cette source.
 *
 * 📌 La liste des hôtes n'est PAS ici : elle vient de `@qoe/supabase/storage`
 * (`mediaImageHosts`), qui lit l'origine média configurée
 * (`NEXT_PUBLIC_MEDIA_CDN_URL`) et l'origine Supabase. Avant, ce fichier
 * recopiait `cdn.qoe.fi` / `**.supabase.co` : un basculement de CDN laissait
 * donc toutes les images en `unoptimized`, sans erreur visible.
 *
 * ⚠️ Une URL `blob:` (aperçu local d'un upload) n'est jamais optimisable :
 * Next ne sait pas résoudre ce schéma et l'optimiseur répond 400. Idem pour
 * les autres schémas (`file:`, `data:`).
 */
export function canOptimizeImageSrc(src: ImageProps['src'] | null | undefined): boolean {
  if (src == null) return false;
  // Les imports statiques Next (`StaticImageData`) sont optimisables.
  if (typeof src !== 'string') return true;

  const value = src.trim();
  if (!value || value.startsWith('data:')) return false;
  if (value.endsWith('.svg') || value.includes('.svg?')) return false;

  // Chemin relatif/absolu de l'app : Next l'optimise sans configuration.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return true;

  try {
    const { protocol, hostname } = new URL(value);
    return isOptimizableImageHost(hostname, protocol);
  } catch {
    return false;
  }
}
