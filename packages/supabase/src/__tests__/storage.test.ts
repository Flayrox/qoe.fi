// =====================================================================
// 🧪 Chemins & URLs storage (@qoe/supabase)
// =====================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildImagePath,
  sanitizeExtension,
  sanitizePathSegment,
  toPublicImageUrl,
  resolveMediaCdnBase,
  mediaImageHosts,
  matchesImageHost,
  isOptimizableImageHost,
  mediaRemotePatterns,
  DEFAULT_IMAGES_CDN,
  IMAGE_FOLDERS,
  LOCAL_IMAGE_HOSTS,
  STATIC_IMAGE_HOSTS,
} from '../storage';

function fakeFile(name: string): File {
  return { name } as File;
}

describe('sanitizeExtension', () => {
  it('conserve une extension simple', () => {
    expect(sanitizeExtension('webp')).toBe('webp');
    expect(sanitizeExtension('JPG')).toBe('jpg');
  });
  it('rejette traversal, exécutables et MIME composés', () => {
    expect(sanitizeExtension('../exe')).toBe('png');
    expect(sanitizeExtension('svg+xml')).toBe('png');
    expect(sanitizeExtension('')).toBe('png');
    expect(sanitizeExtension(null)).toBe('png');
    expect(sanitizeExtension('toolongextension')).toBe('png');
  });
});

describe('sanitizePathSegment', () => {
  it('conserve les segments sains', () => {
    expect(sanitizePathSegment('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000'
    );
  });
  it('neutralise traversal et caractères spéciaux', () => {
    expect(sanitizePathSegment('../../etc')).toBe('etc');
    expect(sanitizePathSegment('a/b\\c')).toBe('a_b_c');
    expect(sanitizePathSegment('')).toBe('shared');
  });
});

describe('buildImagePath', () => {
  it('construit {folder}/{ownerId}/{ts}-{rand}.{ext}', () => {
    const p = buildImagePath(fakeFile('photo.JPG'), {
      folder: IMAGE_FOLDERS.avatars,
      ownerId: 'user-1',
    });
    expect(p).toMatch(/^avatars\/user-1\/\d+-[a-z0-9]{6}\.jpg$/);
  });
  it('assainit ownerId et extension hostiles', () => {
    const p = buildImagePath(fakeFile('evil.svg+xml'), { ownerId: '../x' });
    expect(p).not.toContain('..');
    expect(p).not.toContain('svg+xml');
    expect(p).toMatch(/^articles\/[^/]+\/\d+-[a-z0-9]{6}\.png$/);
  });
  it("l'option ext prime sur le nom de fichier", () => {
    const p = buildImagePath(fakeFile('photo.png'), { ext: 'webp' });
    expect(p).toMatch(/\.webp$/);
  });
});

describe('toPublicImageUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('réécrit vers le CDN quand configuré', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://xxx.supabase.co');
    expect(
      toPublicImageUrl('https://xxx.supabase.co/storage/v1/object/public/articles-media/a.webp')
    ).toBe('https://cdn.qoe.fi/storage/v1/object/public/articles-media/a.webp');
  });
  it('tolère un slash final dans la config', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://xxx.supabase.co/');
    expect(toPublicImageUrl('https://xxx.supabase.co/storage/v1/object/public/a.webp')).toBe(
      'https://cdn.qoe.fi/storage/v1/object/public/a.webp'
    );
  });
  it('laisse intacte une URL étrangère ou sans config', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const url = 'https://example.com/a.webp';
    expect(toPublicImageUrl(url)).toBe(url);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://xxx.supabase.co');
    expect(toPublicImageUrl(url)).toBe(url);
  });

  it('suit le CDN configuré (Bunny, R2, imgproxy…) sans changer le chemin', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.qoe.internal');
    vi.stubEnv('NEXT_PUBLIC_MEDIA_CDN_URL', 'https://qoe.b-cdn.net/');

    expect(resolveMediaCdnBase()).toBe('https://qoe.b-cdn.net');
    expect(
      toPublicImageUrl(
        'https://storage.qoe.internal/storage/v1/object/public/articles-media/a.webp'
      )
    ).toBe('https://qoe.b-cdn.net/storage/v1/object/public/articles-media/a.webp');
  });

  it('retombe sur le défaut quand la variable est absente ou vide', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.qoe.internal');
    expect(resolveMediaCdnBase()).toBe(DEFAULT_IMAGES_CDN);
    vi.stubEnv('NEXT_PUBLIC_MEDIA_CDN_URL', '   ');
    expect(resolveMediaCdnBase()).toBe(DEFAULT_IMAGES_CDN);
  });

  it('est idempotent : une URL déjà servie par un CDN reste intacte', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.qoe.internal');
    vi.stubEnv('NEXT_PUBLIC_MEDIA_CDN_URL', 'https://qoe.b-cdn.net');
    const already = 'https://cdn.qoe.fi/storage/v1/object/public/articles-media/a.webp';
    expect(toPublicImageUrl(already)).toBe(already);
  });
});

// =====================================================================
// 🖼️ Hôtes d'images — la liste qui pilote `next/image` ET l'UI
// =====================================================================
// 📖 Avant ce lot, cinq `next.config.ts` recopiaient `cdn.qoe.fi` et
//    `canOptimizeImageSrc()` aussi : changer `NEXT_PUBLIC_MEDIA_CDN_URL`
//    laissait donc toutes les images en `unoptimized`, sans erreur.
describe('hôtes d’images optimisables', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('sans configuration : les hôtes historiques et locaux restent acceptés', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_MEDIA_CDN_URL', '');
    const hosts = mediaImageHosts();
    expect(hosts).toEqual(expect.arrayContaining([...LOCAL_IMAGE_HOSTS]));
    expect(hosts).toEqual(expect.arrayContaining([...STATIC_IMAGE_HOSTS]));
    // Le défaut déterministe reste dans la liste.
    expect(hosts).toContain('cdn.qoe.fi');
  });

  it('suit le CDN configuré (Bunny) et l’origine Supabase', () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_CDN_URL', 'https://qoe.b-cdn.net/');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.qoe.internal');
    const hosts = mediaImageHosts();
    expect(hosts).toContain('qoe.b-cdn.net');
    expect(hosts).toContain('storage.qoe.internal');
  });

  it('reconnaît les motifs `**.domaine` sans accepter un domaine sosie', () => {
    expect(matchesImageHost('abc.supabase.co', ['**.supabase.co'])).toBe(true);
    expect(matchesImageHost('supabase.co', ['**.supabase.co'])).toBe(true);
    // `evil-supabase.co` ne doit pas passer pour un sous-domaine.
    expect(matchesImageHost('evil-supabase.co', ['**.supabase.co'])).toBe(false);
    expect(matchesImageHost('supabase.co.evil.com', ['**.supabase.co'])).toBe(false);
  });

  it('refuse un hôte étranger, même en HTTPS', () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_CDN_URL', 'https://qoe.b-cdn.net');
    expect(isOptimizableImageHost('evil.example', 'https:')).toBe(false);
    expect(isOptimizableImageHost('qoe.b-cdn.net', 'https:')).toBe(true);
  });

  it('n’accepte le HTTP que pour un hôte local', () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_CDN_URL', 'http://qoe.b-cdn.net');
    expect(isOptimizableImageHost('127.0.0.1', 'http:')).toBe(true);
    // Un CDN configuré en clair ne doit pas être servi en HTTP.
    expect(isOptimizableImageHost('qoe.b-cdn.net', 'http:')).toBe(false);
    // Un schéma exotique n'est jamais optimisable.
    expect(isOptimizableImageHost('127.0.0.1', 'file:')).toBe(false);
  });

  it('mediaRemotePatterns : locaux en HTTP, configurés en HTTPS, sans doublon', () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_CDN_URL', 'https://qoe.b-cdn.net/');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.qoe.internal/');
    const patterns = mediaRemotePatterns();
    expect(patterns).toEqual(
      expect.arrayContaining([
        { protocol: 'http', hostname: '127.0.0.1' },
        { protocol: 'https', hostname: 'qoe.b-cdn.net' },
        { protocol: 'https', hostname: 'storage.qoe.internal' },
        { protocol: 'https', hostname: '**.supabase.co' },
      ])
    );
    const keys = patterns.map((p) => `${p.protocol}://${p.hostname}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('une origine locale configurée reste en HTTP dans les patterns', () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_CDN_URL', 'http://localhost:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const keys = mediaRemotePatterns().map((p) => `${p.protocol}://${p.hostname}`);
    expect(keys).toContain('http://localhost');
    expect(keys).not.toContain('https://localhost');
  });
});
