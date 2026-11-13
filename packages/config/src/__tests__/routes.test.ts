import { describe, it, expect } from 'vitest';
import {
  getArticleShortUrl,
  getArticleUrl,
  getCanonicalArticlePath,
  routes,
  sameOriginPath,
} from '../routes';

describe('🗺️ packages/config/src/routes.ts', () => {
  describe('sameOriginPath', () => {
    it('laisse passer un chemin déjà relatif', () => {
      expect(sameOriginPath('/alex/a/mon-article')).toBe('/alex/a/mon-article');
      expect(sameOriginPath('/alex?tab=articles#top')).toBe('/alex?tab=articles#top');
    });

    it('réduit une URL absolue à son chemin (pushState refuse une autre origine)', () => {
      expect(sameOriginPath('http://lvh.me:15402/alex/a/mon-article')).toBe('/alex/a/mon-article');
      expect(sameOriginPath('https://qoe.fi/alex/a/mon-article?utm=x#haut')).toBe(
        '/alex/a/mon-article?utm=x#haut'
      );
    });

    it('rend la valeur telle quelle si elle est inexploitable', () => {
      expect(sameOriginPath('')).toBe('');
      expect(sameOriginPath('pas une url')).toBe('pas une url');
    });
  });

  describe('getCanonicalArticlePath — décision : la forme core est la canonique', () => {
    // Ces cas verrouillent l'ordre de résolution du propriétaire. Si l'ordre
    // change, la page article et la redirection des liens courts changeraient
    // ensemble (même fonction) — mais le contrat public, lui, changerait :
    // c'est ce que ces assertions rendent visible.
    it('privilégie le slug de publication', () => {
      expect(
        getCanonicalArticlePath({
          slug: 'mon-article',
          publisher: { slug: 'le-media', subdomain: 'lemedia' },
          author: { username: 'jane' },
        })
      ).toBe('/le-media/a/mon-article');
    });

    it("retombe sur le sous-domaine quand la publication n'a pas de slug", () => {
      expect(
        getCanonicalArticlePath({
          slug: 'mon-article',
          publisher: { subdomain: 'lemedia' },
          author: { username: 'jane' },
        })
      ).toBe('/lemedia/a/mon-article');
    });

    it("retombe sur l'username de l'auteur sans publication", () => {
      expect(getCanonicalArticlePath({ slug: 'mon-article', author: { username: 'jane' } })).toBe(
        '/jane/a/mon-article'
      );
    });

    it('accepte un propriétaire de repli, puis « qoefi » par défaut', () => {
      expect(getCanonicalArticlePath({ slug: 'mon-article' }, 'qoe.fi')).toBe(
        '/qoe.fi/a/mon-article'
      );
      expect(getCanonicalArticlePath({ slug: 'mon-article' })).toBe('/qoefi/a/mon-article');
    });

    it('encode propriétaire et slug exactement comme le routeur du feed', () => {
      const article = { slug: 'a b', author: { username: 'jane doe' } };
      expect(getCanonicalArticlePath(article)).toBe('/jane%20doe/a/a%20b');
      expect(getCanonicalArticlePath(article)).toBe(routes.feed.article('jane doe', article.slug));
    });
  });

  it('studio routes inclut media, notifications, pricing, import', () => {
    expect(routes.studio.media()).toBe('/media');
    expect(routes.studio.notifications()).toBe('/notifications');
    expect(routes.studio.pricing()).toBe('/pricing');
    expect(routes.studio.import()).toBe('/import');
  });

  it('feed routes inclut messages et shortArticle', () => {
    expect(routes.feed.messages()).toBe('/messages');
    expect(routes.feed.messages('user-123')).toBe('/messages/user-123');
    expect(routes.feed.messages('foo bar')).toBe('/messages/foo%20bar');
    expect(routes.feed.shortArticle('81083')).toBe('/l/81083');
  });

  it('tenant routes inclut shortArticle', () => {
    expect(routes.tenant.shortArticle('alice', '81083', 'qoe.test')).toBe(
      'http://alice.qoe.test/l/81083'
    );
  });

  it('getArticleUrl inclut category.slug même avec customDomain', () => {
    expect(
      getArticleUrl(
        {
          slug: 'mon-article',
          category: { slug: 'tech', name: 'Tech' },
          publisher: { customDomain: 'journal.example' },
        },
        { preferTenant: true }
      )
    ).toBe('https://journal.example/tech/mon-article');

    expect(
      getArticleUrl(
        {
          slug: 'mon-article',
          category: { slug: 'essais', name: 'Essais' },
          author: { customDomain: 'blog.example' },
        },
        { preferTenant: true }
      )
    ).toBe('https://blog.example/essais/mon-article');

    expect(
      getArticleUrl(
        {
          slug: 'mon-article',
          publisher: { customDomain: 'journal.example' },
        },
        { preferTenant: true }
      )
    ).toBe('https://journal.example/article/mon-article');
  });

  it('getArticleShortUrl génère /l/{shortCode} selon le contexte', () => {
    expect(getArticleShortUrl({ shortCode: null })).toBeNull();
    expect(getArticleShortUrl({})).toBeNull();

    expect(getArticleShortUrl({ shortCode: '81083' })).toBe('/l/81083');
    expect(getArticleShortUrl({ shortCode: '81083' }, { host: 'qoe.fi', absolute: true })).toBe(
      'https://qoe.fi/l/81083'
    );
    expect(
      getArticleShortUrl(
        { shortCode: '81083', publisher: { customDomain: 'journal.example' } },
        { preferTenant: true }
      )
    ).toBe('https://journal.example/l/81083');
    expect(
      getArticleShortUrl(
        { shortCode: '81083', author: { subdomain: 'alice' } },
        { preferTenant: true, host: 'qoe.test' }
      )
    ).toBe('http://alice.qoe.test/l/81083');
  });
});
