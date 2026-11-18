import { describe, expect, it } from 'vitest';
import { resolveArticleShareUrl, resolvePublisherOrigin } from '../lib/shareUrl';

// L06c : le partage d'article composait `https://{hôte}.qoe.fi/article/{slug}`,
// ce qui donnait `https://exemple.com.qoe.fi` pour un domaine personnalisé,
// ignorait la hiérarchie de catégories et figeait le domaine racine.

describe('resolvePublisherOrigin', () => {
  it('sert un domaine personnalisé tel quel', () => {
    expect(resolvePublisherOrigin({ customDomain: 'exemple.com' })).toBe('https://exemple.com');
  });

  it('préfixe un sous-domaine avec le domaine racine configurable', () => {
    expect(resolvePublisherOrigin({ subdomain: 'media' }, 'qoe.test')).toBe(
      'https://media.qoe.test'
    );
  });

  it('ne double pas un sous-domaine déjà qualifié', () => {
    expect(resolvePublisherOrigin({ subdomain: 'media.exemple.com' })).toBe(
      'https://media.exemple.com'
    );
  });

  it('retombe sur la racine pour une publication nue', () => {
    expect(resolvePublisherOrigin(null, 'qoe.test')).toBe('https://qoe.test');
  });
});

describe('resolveArticleShareUrl', () => {
  it('suit le chemin canonique du tenant, sous-catégorie comprise', () => {
    expect(
      resolveArticleShareUrl(
        { subdomain: 'media', customDomain: 'exemple.com' },
        { slug: 'mon-article', category: { slug: 'ia', parentSlug: 'tech' } }
      )
    ).toBe('https://exemple.com/tech/ia/mon-article');
  });

  it('inclut la catégorie racine et « uncategorized » par défaut', () => {
    expect(
      resolveArticleShareUrl({ subdomain: 'media' }, { slug: 'x', category: { slug: 'tech' } })
    ).toBe('https://media.qoe.fi/tech/x');
    expect(resolveArticleShareUrl({ subdomain: 'media' }, { slug: 'x' })).toBe(
      'https://media.qoe.fi/uncategorized/x'
    );
  });

  it('ne génère jamais l’ancienne forme /article/{slug}', () => {
    const url = resolveArticleShareUrl({ subdomain: 'media' }, { slug: 'x' });
    expect(url).not.toContain('/article/');
  });

  it('peut renvoyer le lien court stable /l/{code}', () => {
    expect(
      resolveArticleShareUrl(
        { subdomain: 'media' },
        { slug: 'mon-article-928488', shortCode: '928488' },
        { preferShortCode: true }
      )
    ).toBe('https://media.qoe.fi/l/928488');
  });

  it('accepte une racine surchargée', () => {
    expect(
      resolveArticleShareUrl(
        { subdomain: 'media' },
        { slug: 'intro' },
        { rootDomain: 'blogs.test' }
      )
    ).toBe('https://media.blogs.test/uncategorized/intro');
  });
});
