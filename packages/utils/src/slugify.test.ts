// =====================================================================
// 🧪 slugify — les URLs d'articles en dépendent, elles ne doivent pas dériver
// =====================================================================
// Un slug qui garde une majuscule, un accent ou un tiret de trop produit une
// URL différente de celle déjà indexée : c'est une 404, pas un détail.
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { shortId, slugify, uuid } from './slugify';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('slugify', () => {
  it('retire accents, majuscules et ponctuation', () => {
    expect(slugify('Mon Article Génial !')).toBe('mon-article-genial');
    expect(slugify("Café & Thé: L'essentiel")).toBe('cafe-the-lessentiel');
  });

  it('normalise espaces et tirets multiples', () => {
    expect(slugify('  Le   silence   comme -- infrastructure  ')).toBe(
      'le-silence-comme-infrastructure'
    );
  });

  it('ne laisse ni tiret en tête ni tiret en queue', () => {
    expect(slugify('--- déjà ---')).toBe('deja');
  });

  it('garde les chiffres et supprime le reste', () => {
    expect(slugify('Chapitre 2/3 (2026)')).toBe('chapitre-23-2026');
  });

  it('rend une chaîne vide pour un texte sans caractère utilisable', () => {
    expect(slugify('日本語')).toBe('');
    expect(slugify('   ')).toBe('');
  });

  it('conserve le tiret intérieur et les underscores deviennent des séparateurs', () => {
    expect(slugify('mon-super_article')).toBe('mon-superarticle');
  });
});

describe('shortId', () => {
  it('rend 8 caractères alphanumériques par défaut', () => {
    const id = shortId();
    expect(id).toHaveLength(8);
    expect(id).toMatch(/^[A-Za-z0-9]{8}$/);
  });

  it('respecte la longueur demandée', () => {
    expect(shortId(16)).toHaveLength(16);
    expect(shortId(1)).toHaveLength(1);
  });
});

describe('uuid', () => {
  it('utilise crypto.randomUUID quand il existe', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' });

    expect(uuid()).toBe('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
  });

  it('construit un UUID v4 depuis getRandomValues quand randomUUID manque', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) array[i] = (i * 31) % 256;
        return array;
      },
    });

    const value = uuid();

    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('refuse de fabriquer un identifiant sans source cryptographique', () => {
    // Un repli sur Math.random() donnerait une fausse garantie : mieux vaut
    // échouer bruyamment que produire des identifiants prévisibles.
    vi.stubGlobal('crypto', undefined);
    expect(() => uuid()).toThrow();
  });
});
