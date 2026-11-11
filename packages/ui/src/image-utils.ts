import type { ImageProps } from 'next/image';

/**
 * Hôtes autorisés par les `remotePatterns` des apps core/tenants/studio.
 * Les autres URLs distantes restent `unoptimized` pour ne pas faire planter
 * `next/image` sur un hôte non déclaré.
 */
const OPTIMIZABLE_HOSTS = [
  /(^|\.)supabase\.co$/i,
  /^auth\.qoe\.fi$/i,
  /^lh3\.googleusercontent\.com$/i,
  /^avatars\.githubusercontent\.com$/i,
  /^res\.cloudinary\.com$/i,
  /^cdn\.qoe\.fi$/i,
  /(^|\.)r2\.dev$/i,
  /^127\.0\.0\.1$/,
  /^localhost$/i,
  /^host\.docker\.internal$/i,
];

export function canOptimizeImageSrc(src: ImageProps['src'] | null | undefined): boolean {
  if (src == null) return false;
  // Les imports statiques Next (`StaticImageData`) sont optimisables.
  if (typeof src !== 'string') return true;

  const value = src.trim();
  if (!value || value.startsWith('data:')) return false;
  if (value.endsWith('.svg') || value.includes('.svg?')) return false;
  if (!/^https?:\/\//i.test(value)) return true;

  try {
    const { protocol, hostname } = new URL(value);
    const isLocal = ['127.0.0.1', 'localhost', 'host.docker.internal'].includes(hostname);
    // Les `remotePatterns` de prod sont en HTTPS ; les hôtes locaux sont en HTTP.
    if (protocol !== 'https:' && !(protocol === 'http:' && isLocal)) return false;
    return OPTIMIZABLE_HOSTS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}
