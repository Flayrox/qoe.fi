// =====================================================================
// 🧪 image-utils — quelle source `next/image` peut être optimisée
// =====================================================================
// 📖 Deux règles sont verrouillées ici, parce qu'elles échouent en silence :
//    1. la liste d'hôtes suit l'environnement (`NEXT_PUBLIC_MEDIA_CDN_URL`,
//       `NEXT_PUBLIC_SUPABASE_URL`) — sinon un basculement de CDN laisse
//       toutes les images en `unoptimized` sans aucune erreur ;
//    2. un schéma que l'optimiseur ne sait pas lire (`blob:` d'un aperçu
//       d'upload, `file:`) n'est jamais déclaré optimisable — Next répond 400
//       et l'image ne s'affiche pas du tout.
// =====================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ImageProps } from 'next/image';

import { canOptimizeImageSrc } from '../image-utils';

/** Import statique Next (`StaticImageData`). */
const staticImport = {
  src: '/_next/static/media/x.webp',
  width: 10,
  height: 10,
} as ImageProps['src'];

describe('canOptimizeImageSrc', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('refuse l’absence de source', () => {
    expect(canOptimizeImageSrc(null)).toBe(false);
    expect(canOptimizeImageSrc(undefined)).toBe(false);
    expect(canOptimizeImageSrc('')).toBe(false);
    expect(canOptimizeImageSrc('   ')).toBe(false);
  });

  it('accepte un import statique et un chemin local', () => {
    expect(canOptimizeImageSrc(staticImport)).toBe(true);
    expect(canOptimizeImageSrc('/images/hero.webp')).toBe(true);
    expect(canOptimizeImageSrc('images/hero.webp')).toBe(true);
  });

  it('refuse data: et les SVG (inline, jamais optimisés)', () => {
    expect(canOptimizeImageSrc('data:image/png;base64,AAAA')).toBe(false);
    expect(canOptimizeImageSrc('https://cdn.qoe.fi/a/logo.svg')).toBe(false);
    expect(canOptimizeImageSrc('/images/logo.svg?v=2')).toBe(false);
  });

  it('refuse les schémas que l’optimiseur ne sait pas lire', () => {
    // Aperçu local d'un upload : `next/image` lèverait « Failed to parse src ».
    expect(canOptimizeImageSrc('blob:http://localhost:3010/6f1c-uuid')).toBe(false);
    expect(canOptimizeImageSrc('file:///tmp/photo.png')).toBe(false);
    expect(canOptimizeImageSrc('ftp://cdn.example/photo.png')).toBe(false);
  });

  it('accepte les hôtes historiques et locaux sans configuration', () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_CDN_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(canOptimizeImageSrc('https://cdn.qoe.fi/a/1.webp')).toBe(true);
    expect(canOptimizeImageSrc('https://abc.supabase.co/storage/v1/object/public/a.webp')).toBe(
      true
    );
    expect(canOptimizeImageSrc('http://127.0.0.1:54321/storage/v1/object/public/a.webp')).toBe(
      true
    );
    expect(canOptimizeImageSrc('http://localhost:54321/storage/v1/object/public/a.webp')).toBe(
      true
    );
  });

  it('suit le CDN configuré : Bunny devient optimisable, sans redéploiement de code', () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_CDN_URL', 'https://qoe.b-cdn.net/');
    expect(canOptimizeImageSrc('https://qoe.b-cdn.net/articles/1/a.webp')).toBe(true);
  });

  it('refuse un hôte étranger, et le HTTP sur un hôte distant', () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_CDN_URL', 'https://qoe.b-cdn.net');
    expect(canOptimizeImageSrc('https://evil.example/a.webp')).toBe(false);
    expect(canOptimizeImageSrc('https://cdn.qoe.fi.evil.example/a.webp')).toBe(false);
    expect(canOptimizeImageSrc('http://qoe.b-cdn.net/a.webp')).toBe(false);
  });
});
