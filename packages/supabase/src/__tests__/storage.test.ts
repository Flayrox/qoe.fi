// =====================================================================
// 🧪 Chemins & URLs storage (@qoe/supabase)
// =====================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildImagePath,
  sanitizeExtension,
  sanitizePathSegment,
  toPublicImageUrl,
  IMAGE_FOLDERS,
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
});
