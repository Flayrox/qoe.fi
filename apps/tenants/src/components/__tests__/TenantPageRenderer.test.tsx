import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TenantPageRenderer } from '../TenantPageRenderer';
import type { TenantPublication } from '@/lib/tenant-data';

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ host: 'journal.qoe.fi' })),
}));

vi.mock('@qoe/ui/templates', () => ({
  TemplateRenderer: ({
    publication,
    config,
    articles,
  }: {
    publication: { name: string };
    config?: { archetype?: string };
    articles: Array<{ excerpt?: string }>;
  }) => (
    <div data-testid="template-renderer" data-archetype={config?.archetype}>
      <h1 data-testid="pub-name">{publication.name}</h1>
      <span data-testid="articles-count">{articles.length}</span>
      <span data-testid="first-excerpt">{articles[0]?.excerpt}</span>
    </div>
  ),
  parseSiteLayouts: vi.fn(() => ({
    home: { version: '2.0', archetype: 'minimal', tokens: {}, blocks: [] },
    article: null,
    articleByCategory: {},
  })),
}));

vi.mock('@qoe/ui', () => ({
  JsonLd: () => <div data-testid="json-ld" />,
  buildWebSiteSchema: vi.fn(() => ({})),
}));

vi.mock('@/components/RecommendedSection', () => ({
  RecommendedSection: ({
    authorName,
    recommendations,
  }: {
    authorName: string;
    recommendations: unknown[];
  }) => (
    <div data-testid="recommended-section">
      <span>{authorName}</span>
      <span>{recommendations.length} recs</span>
    </div>
  ),
}));

vi.mock('@/app/tenant/[domain]/article/[slug]/TenantArticleRenderer', () => ({
  TenantArticleRenderer: (props: { article?: { id?: string; title?: string } }) => (
    <div data-testid="tenant-article-renderer" data-article-id={props.article?.id}>
      Article: {props.article?.title}
    </div>
  ),
}));

describe('TenantPageRenderer — Contrôleur universel unifié', () => {
  const dummyPub = {
    type: 'CREATOR',
    bio: null,
    logoUrl: null,
    isCertified: false,
    umamiWebsiteId: null,
    stripeAccountId: null,
    supportUrl: null,
    allowComments: true,
    allowPublicAnnotations: true,
    id: 'pub_test_1',
    name: 'Minimal Craft Journal',
    slug: 'minimal-craft',
    subdomain: 'craft',
    customDomain: null,
    heroText: 'Des récits pointus sur le design et l’architecture logicielle',
    headerImageUrl: null,
    footerText: '© 2026 Minimal Craft',
    accentColor: '#000000',
    fontFamily: 'inter',
    themeMode: 'light',
    layoutStyle: 'minimal',
    allowIndexing: true,
    navigation: [
      {
        id: 'nav_1',
        label: 'Index',
        url: '/',
        order: 0,
        isExternal: false,
        parentId: null,
        publicationId: 'pub_test_1',
      },
    ],
    socialLinks: [],
    categories: [{ id: 'cat_1', name: 'Design', slug: 'design' }],
    articles: [
      {
        id: 'art_1',
        title: 'L’art du détail',
        slug: 'art-du-detail',
        content: 'Un contenu riche et soigné pour tester le rendu.',
        isPremium: false,
        readingTime: 3,
        createdAt: '2026-10-11T00:00:00Z',
        published: true,
        visibility: 'PUBLIC',
        category: { id: 'cat_1', name: 'Design', slug: 'design' },
      },
    ],
  };

  const dummyFullArticle = {
    id: 'art_1',
    title: 'L’art du détail',
    slug: 'art-du-detail',
    content: 'Un contenu riche et soigné pour tester le rendu.',
    isPremium: false,
    readingTime: 3,
    createdAt: '2026-10-11T00:00:00Z',
    authorId: 'auth_1',
    status: 'PUBLISHED',
    allowPublicAnnotations: true,
    allowComments: true,
    author: { name: 'Dev Lead' },
    category: { id: 'cat_1', name: 'Design', slug: 'design' },
  } as unknown as import('@/lib/tenant-data').TenantArticle;

  it('scope="home" : instancie TemplateRenderer avec les données et le paywall sain', async () => {
    const Component = await TenantPageRenderer({
      scope: 'home',
      publication: dummyPub as unknown as TenantPublication,
      decodedDomain: 'craft.qoe.fi',
      recommendations: [
        {
          id: 'rec_1',
          name: 'Partner',
          slug: 'partner',
          subdomain: 'partner',
          customDomain: null,
          description: 'Desc',
          logoUrl: null,
          articlesCount: 5,
          subscribersCount: 10,
          authorName: 'Alex',
          authorAvatarUrl: null,
        },
      ],
    });

    render(Component);

    expect(screen.getByTestId('template-renderer')).toBeInTheDocument();
    expect(screen.getByTestId('pub-name')).toHaveTextContent('Minimal Craft Journal');
    expect(screen.getByTestId('articles-count')).toHaveTextContent('1');
    expect(screen.getByTestId('recommended-section')).toHaveTextContent('Minimal Craft Journal');
  });

  it('scope="article" : délègue au TenantArticleRenderer avec tous les props requis', async () => {
    const Component = await TenantPageRenderer({
      scope: 'article',
      publication: dummyPub as unknown as TenantPublication,
      article: dummyFullArticle,
      user: null,
      bundle: {
        bookmarked: false,
        followed: false,
        entitlements: { isMember: false, isPaidSubscriber: false },
      },
      decodedDomain: 'craft.qoe.fi',
      initialBookmarked: false,
      initialFollowed: false,
      initialHighlights: [],
      publicHighlights: [],
      initialComments: [],
    });

    render(Component);

    expect(screen.getByTestId('tenant-article-renderer')).toBeInTheDocument();
    expect(screen.getByTestId('tenant-article-renderer')).toHaveAttribute(
      'data-article-id',
      'art_1'
    );
    expect(screen.getByText('Article: L’art du détail')).toBeInTheDocument();
  });
});
