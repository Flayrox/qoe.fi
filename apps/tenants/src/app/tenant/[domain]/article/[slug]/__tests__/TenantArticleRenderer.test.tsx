import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TenantArticleRenderer } from '../TenantArticleRenderer';
import type { TenantPublication, TenantArticle } from '@/lib/tenant-data';

vi.mock('@/lib/tenant-data', () => ({
  fetchCanonicalDocument: vi.fn(async () => null),
}));

vi.mock('../TenantArticleHighlighter', () => ({
  TenantArticleHighlighter: () => (
    <div data-testid="tenant-article-highlighter">
      <span>Affichage des annotations :</span>
    </div>
  ),
}));

vi.mock('../PaywallCut', () => ({
  PaywallOverlay: () => <div data-testid="paywall-overlay">Contenu réservé aux abonnés</div>,
}));

vi.mock('../TenantArticleReadingTracker', () => ({
  TenantArticleReadingTracker: () => null,
}));

vi.mock('../ArticleCommentsSection', () => ({
  ArticleCommentsSection: () => <div data-testid="comments-section" />,
}));

vi.mock('../RelatedArticles', () => ({
  RelatedArticles: () => <div data-testid="related-articles" />,
}));

vi.mock('../ReaderActions', () => ({
  ReaderActions: () => <div data-testid="reader-actions" />,
}));

vi.mock('@/components/ReadingProgressBar', () => ({
  ReadingProgressBar: () => null,
}));

vi.mock('@/components/legal/LegalFooterLinks', () => ({
  LegalFooterLinks: () => null,
}));

vi.mock('@qoe/ui', () => ({
  TenantHeader: () => <header data-testid="tenant-header" />,
  SubscribeForm: () => <form data-testid="subscribe-form" />,
  JsonLd: () => null,
  buildArticleSchema: () => ({}),
  SafeAvatar: () => <div data-testid="avatar" />,
}));

vi.mock('@qoe/ui/templates', () => ({
  TemplateRenderer: () => <div data-testid="template-renderer" />,
  parseSiteLayouts: () => ({ home: null, article: null, articleByCategory: {} }),
  resolveTheme: () => ({ id: 'minimal' }),
  resolveFontFamily: () => 'sans-serif',
  MinimalCraftShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="minimal-craft-shell">{children}</div>
  ),
  getCoverPlaceholder: () => '/placeholder.png',
  ArticleEngagementBar: () => <div data-testid="engagement-bar" />,
}));

describe('TenantArticleRenderer — Annotations et placement du Paywall', () => {
  const dummyPublication: TenantPublication = {
    id: 'pub_1',
    name: 'Artisan Journal',
    slug: 'artisan-journal',
    type: 'CREATOR',
    bio: null,
    logoUrl: null,
    isCertified: true,
    subdomain: 'artisan',
    customDomain: null,
    umamiWebsiteId: null,
    accentColor: '#C04328',
    fontFamily: 'sans',
    heroText: null,
    headerImageUrl: null,
    footerText: null,
    themeMode: 'light',
    layoutStyle: 'minimal',
    allowIndexing: true,
    allowPublicAnnotations: true,
    allowComments: true,
    seoTitle: null,
    seoDescription: null,
    supportUrl: null,
    stripeAccountId: null,
    navigation: [],
    socialLinks: [],
    categories: [],
    articles: [],
    user: { id: 'user_author_1', username: 'artisan' },
  };

  const dummyPaidArticle: TenantArticle = {
    id: 'art_paid_1',
    title: 'Les secrets du design minimaliste',
    slug: 'secrets-design-minimaliste',
    content:
      "<p>Ceci est le début gratuit de l'article.</p><!--paywall--><p>Ceci est la suite payante.</p>",
    createdAt: new Date().toISOString(),
    authorId: 'user_author_1',
    published: true,
    status: 'PUBLISHED',
    visibility: 'PAID',
    isPremium: true,
    readingTime: 5,
    allowPublicAnnotations: true,
    allowComments: true,
    accessGranted: false,
    author: {
      id: 'user_author_1',
      name: 'Artisan',
      username: 'artisan',
    },
  };

  it("affiche la barre d'annotations en haut, avant le corps tronqué et avant le paywall", async () => {
    const Component = await TenantArticleRenderer({
      publication: dummyPublication,
      article: dummyPaidArticle,
      user: null,
      bundle: {
        bookmarked: false,
        followed: false,
        entitlements: { isMember: false, isPaidSubscriber: false },
      },
      decodedDomain: 'artisan.qoe.fi',
      initialBookmarked: false,
      initialFollowed: false,
      initialHighlights: [],
      publicHighlights: [],
      initialComments: [],
    });

    const { container } = render(Component);

    const highlighter = screen.getByTestId('tenant-article-highlighter');
    const articleContent = container.querySelector('#article-content');
    const paywallOverlay = screen.getByTestId('paywall-overlay');

    expect(highlighter).toBeInTheDocument();
    expect(articleContent).toBeInTheDocument();
    expect(paywallOverlay).toBeInTheDocument();

    // Vérifie l'ordre DOM séquentiel :
    // Highlighter (Affichage des annotations :) -> Corps de l'article (#article-content) -> PaywallOverlay
    expect(highlighter.compareDocumentPosition(articleContent!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(articleContent!.compareDocumentPosition(paywallOverlay)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
});
