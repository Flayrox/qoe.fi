import { describe, expect, it } from 'vitest';
import { getArticleShortUrl, getArticleUrl, getCanonicalArticlePath, routes } from '../routes';

// Table de vérité des URLs d'article — verrouillée par des tests pour que les
// trois formes ne redivergent pas :
//
//   tenant : /{categorie}/{sous-categorie?}/{slug} · /{code} · /l/{code}
//            (l'ancienne forme /article/{slug} reste une redirection 308)
//   core   : /{proprietaire}/a/{slug} · /l/{code}

describe('forme tenant — catégorie et sous-catégorie', () => {
  it('compose /{parent}/{categorie}/{slug} sur un domaine propre', () => {
    expect(
      getArticleUrl(
        {
          slug: 'mon-article',
          category: { slug: 'ia', parentSlug: 'tech' },
          publisher: { customDomain: 'journal.example' },
        },
        { preferTenant: true }
      )
    ).toBe('https://journal.example/tech/ia/mon-article');
  });

  it('encode chaque segment sans encoder le séparateur de sous-catégorie', () => {
    expect(routes.tenant.article('media', 'mon article', 'qoe.test', 'tech/ia')).toBe(
      'http://media.qoe.test/tech/ia/mon%20article'
    );
  });

  it('préfixe le sous-domaine avec la racine configurée', () => {
    expect(
      getArticleUrl(
        {
          slug: 'intro',
          category: { slug: 'essais' },
          publisher: { subdomain: 'media' },
        },
        { preferTenant: true, host: 'qoe.test' }
      )
    ).toBe('http://media.qoe.test/essais/intro');
  });

  it('ne perd pas la catégorie sur un domaine propre', () => {
    expect(
      getArticleUrl(
        {
          slug: 'intro',
          category: { slug: 'essais', name: 'Essais' },
          publisher: { customDomain: 'journal.example' },
        },
        { preferTenant: true }
      )
    ).toBe('https://journal.example/essais/intro');
  });
});

describe('forme tenant — une seule composition, même sans catégorie', () => {
  it('sans catégorie, produit le canonique par défaut (plus /article/{slug})', () => {
    expect(
      getArticleUrl(
        { slug: 'intro', publisher: { customDomain: 'journal.example' } },
        { preferTenant: true }
      )
    ).toBe('https://journal.example/uncategorized/intro');

    expect(routes.tenant.article('media', 'intro', 'qoe.test')).toBe(
      'http://media.qoe.test/uncategorized/intro'
    );
  });

  it('encode le slug exactement comme la redirection /article/{slug}', () => {
    expect(routes.tenant.articleLegacy('media', 'café au lait', 'qoe.test')).toBe(
      'http://media.qoe.test/article/caf%C3%A9%20au%20lait'
    );
    expect(routes.tenant.article('media', 'café au lait', 'qoe.test', 'tech')).toBe(
      'http://media.qoe.test/tech/caf%C3%A9%20au%20lait'
    );
  });

  it('neutralise une tentative de traversée de répertoire', () => {
    expect(routes.tenant.article('media', '../../etc/passwd', 'qoe.test', 'tech')).toBe(
      'http://media.qoe.test/tech/etcpasswd'
    );
  });
});

describe('forme core — /{proprietaire}/a/{slug}', () => {
  it('privilégie le média puis le créateur comme propriétaire', () => {
    expect(
      getCanonicalArticlePath({
        slug: 'mon-article',
        publisher: { slug: 'le-media', subdomain: 'media' },
        author: { username: 'alice' },
      })
    ).toBe('/le-media/a/mon-article');

    expect(getCanonicalArticlePath({ slug: 'mon-article', author: { username: 'alice' } })).toBe(
      '/alice/a/mon-article'
    );
  });
});

describe('liens courts — stables entre deux slugs', () => {
  it('core : /l/{code}', () => {
    expect(getArticleShortUrl({ shortCode: '928488' })).toBe('/l/928488');
  });

  it('tenant : /l/{code} sur le domaine de la publication', () => {
    expect(
      getArticleShortUrl(
        { shortCode: '928488', publisher: { customDomain: 'journal.example' } },
        { preferTenant: true }
      )
    ).toBe('https://journal.example/l/928488');
  });

  it('sans code court, aucun lien court n’est inventé', () => {
    expect(getArticleShortUrl({ publisher: { subdomain: 'media' } })).toBeNull();
  });
});
