import { describe, it, expect } from 'vitest';
import { getArticleShortUrl, getArticleUrl, routes } from '../routes';

describe('🗺️ packages/config/src/routes.ts', () => {
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
