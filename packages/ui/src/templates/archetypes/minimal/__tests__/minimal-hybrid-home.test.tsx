import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { HeroBlock } from '../../../blocks/HeroBlock';
import { ArticleStreamBlock } from '../../../blocks/ArticleStreamBlock';
import type {
  HeroBlockProps,
  ArticleStreamBlockProps,
  TemplatePublicationContext,
  TemplateArticleItem,
  TemplateRenderContext,
} from '../../../schema';

const mockPublication: TemplatePublicationContext = {
  id: 'pub_1',
  name: 'Devouring Details',
  domain: 'devouringdetails.com',
  accentColor: '#F97316',
  heroText: 'A field guide to micro-craft, spring physics and calibrated interaction design.',
};

const mockArticles: TemplateArticleItem[] = [
  {
    id: 'art_1',
    title: 'Behind scenes',
    slug: 'behind-scenes',
    excerpt: 'Deep dive into the kinetic models powering fluid responsive sheets.',
    imageUrl: 'https://images.example.com/cover-1.jpg',
    readingTime: 4,
    publishedAt: '2026-03-15T10:00:00Z',
    category: { name: 'Interactions', slug: 'interactions' },
  },
  {
    id: 'art_2',
    title: 'Spring physics & tactile feel',
    slug: 'spring-physics',
    excerpt: 'Calibrating stiffness, damping and velocity for natural momentum.',
    readingTime: 6,
    publishedAt: '2026-03-20T10:00:00Z',
    category: { name: 'Physics', slug: 'physics' },
  },
  {
    id: 'art_3',
    title: 'Gestural drawer dynamics',
    slug: 'gestural-drawer',
    readingTime: 3,
    publishedAt: '2026-03-25T10:00:00Z',
    category: { name: 'Interactions', slug: 'interactions' },
  },
];

const mockContext: TemplateRenderContext = {
  mode: 'live',
  article: null,
};

describe('Option B - Minimal Hybrid Home (Devouring Details)', () => {
  describe('HeroBlock in typographic-minimal style', () => {
    it('renders clean tagline and publication subscribe box without duplicated brand dot or heading', () => {
      const heroProps: HeroBlockProps = {
        style: 'typographic-minimal',
        alignment: 'left',
        height: 'compact',
        showOverlay: false,
        overlayOpacity: 0,
        showCoverImage: false,
      };

      const { container } = render(
        <HeroBlock
          id="hero_test"
          props={heroProps}
          publication={mockPublication}
          context={mockContext}
        />
      );

      // Tagline
      expect(screen.getByText(/field guide to micro-craft/i)).toBeTruthy();

      // Publication newsletter subscribe box
      const subscribeBox = container.querySelector('[data-testid="hero-subscribe-box"]');
      expect(subscribeBox).toBeTruthy();
      expect(screen.getByPlaceholderText(/Entrez votre email/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /S’abonner/i })).toBeTruthy();
      expect(screen.getByText(/Rejoignez les lecteurs de Devouring Details/i)).toBeTruthy();

      // Zero fake SaaS logo cloud
      const fakeLogoCloud = container.querySelector('[data-testid="hero-logo-cloud"]');
      expect(fakeLogoCloud).toBeNull();
    });
  });

  describe('ArticleStreamBlock in craft-notes style (Option B Hybrid Journal)', () => {
    const streamProps: ArticleStreamBlockProps = {
      displayMode: 'craft-notes',
      density: 'spacious',
      showAuthor: false,
      showReadingTime: true,
      showExcerpts: true,
      showCategories: true,
      pagination: 'load-more',
    };

    it('centres the most recent article with its category pill and "Lire l’article" link', () => {
      render(
        <ArticleStreamBlock
          id="stream_test"
          props={streamProps}
          articles={mockArticles}
          publication={mockPublication}
          context={mockContext}
        />
      );

      const hero = screen.getByTestId('center-hero-article');
      expect(within(hero).getByText('Gestural drawer dynamics')).toBeTruthy();
      expect(within(hero).getByText('Interactions')).toBeTruthy();
      expect(within(hero).getByText(/Lire l’article/i)).toBeTruthy();
    });

    it('keeps the pinned article in the centre and moves the most recent one to the left column', () => {
      const pinnedOldest: TemplateArticleItem[] = [
        { ...mockArticles[0], isPinned: true },
        mockArticles[1],
        mockArticles[2],
      ];

      render(
        <ArticleStreamBlock
          id="stream_pinned"
          props={streamProps}
          articles={pinnedOldest}
          publication={mockPublication}
          context={mockContext}
        />
      );

      const hero = screen.getByTestId('center-hero-article');
      expect(within(hero).getByText('Behind scenes')).toBeTruthy();

      const recentColumn = screen.getByTestId('trio-recent-column');
      expect(within(recentColumn).getByText('Gestural drawer dynamics')).toBeTruthy();
    });

    it('ranks the right column by real engagement (likes + comments + reposts)', () => {
      const engaged: TemplateArticleItem[] = [
        { ...mockArticles[0], likesCount: 9 },
        { ...mockArticles[1], commentsCount: 1 },
        { ...mockArticles[2], likesCount: 2 },
        {
          id: 'art_4',
          title: 'Fresh off the press',
          slug: 'fresh-off-the-press',
          readingTime: 2,
          publishedAt: '2026-03-28T10:00:00Z',
          likesCount: 0,
        },
      ];

      render(
        <ArticleStreamBlock
          id="stream_popular"
          props={streamProps}
          articles={engaged}
          publication={mockPublication}
          context={mockContext}
        />
      );

      expect(
        within(screen.getByTestId('center-hero-article')).getByText('Fresh off the press')
      ).toBeTruthy();

      const popular = screen.getByTestId('trio-popular-column');
      expect(within(popular).getByText('Les plus lus')).toBeTruthy();
      expect(within(popular).getByText('Behind scenes')).toBeTruthy();
      expect(within(popular).queryByText('Spring physics & tactile feel')).toBeNull();
    });

    it('renders category filter pills and allows filtering articles', () => {
      render(
        <ArticleStreamBlock
          id="stream_test"
          props={streamProps}
          articles={mockArticles}
          publication={mockPublication}
          context={mockContext}
        />
      );

      // Category filter pills: "Tous", "Interactions", "Physics"
      expect(screen.getByRole('button', { name: /Tous/i })).toBeTruthy();
      const physicsButton = screen.getByRole('button', { name: /Physics/i });
      expect(physicsButton).toBeTruthy();

      // Clicking Physics filter filters the index
      fireEvent.click(physicsButton);

      // "Spring physics & tactile feel" should still be visible
      expect(screen.getByText('Spring physics & tactile feel')).toBeTruthy();
    });

    it('renders only the centred article when there is a single article', () => {
      const singleArticle = [mockArticles[0]];

      render(
        <ArticleStreamBlock
          id="stream_single"
          props={streamProps}
          articles={singleArticle}
          publication={mockPublication}
          context={mockContext}
        />
      );

      expect(screen.getByTestId('center-hero-article')).toBeTruthy();
      expect(screen.getByText('Behind scenes')).toBeTruthy();

      expect(screen.queryByTestId('trio-recent-column')).toBeNull();
      expect(screen.queryByTestId('trio-popular-column')).toBeNull();
      expect(screen.queryByText(/À paraître/i)).toBeNull();
    });

    it('puts the remaining article in the recent column when there are 2 articles', () => {
      const twoArticles = [mockArticles[0], mockArticles[1]];

      render(
        <ArticleStreamBlock
          id="stream_two"
          props={streamProps}
          articles={twoArticles}
          publication={mockPublication}
          context={mockContext}
        />
      );

      expect(
        within(screen.getByTestId('center-hero-article')).getByText('Spring physics & tactile feel')
      ).toBeTruthy();

      const recentColumn = screen.getByTestId('trio-recent-column');
      expect(within(recentColumn).getByText('Behind scenes')).toBeTruthy();

      expect(screen.queryByTestId('trio-popular-column')).toBeNull();
      expect(screen.queryByText(/À paraître/i)).toBeNull();
    });

    it('renders all 3 columns when there are 3 articles', () => {
      render(
        <ArticleStreamBlock
          id="stream_three"
          props={streamProps}
          articles={mockArticles}
          publication={mockPublication}
          context={mockContext}
        />
      );

      expect(screen.getByTestId('center-hero-article')).toBeTruthy();
      expect(
        within(screen.getByTestId('trio-recent-column')).getByText('Spring physics & tactile feel')
      ).toBeTruthy();
      expect(
        within(screen.getByTestId('trio-popular-column')).getByText('Behind scenes')
      ).toBeTruthy();

      expect(screen.queryByText(/À paraître/i)).toBeNull();
    });

    it('splits many articles across the columns without repeating any of them', () => {
      const many = [
        ...mockArticles,
        {
          id: 'art_4',
          title: 'Fourth story',
          slug: 'fourth-story',
          readingTime: 2,
          publishedAt: '2026-03-27T10:00:00Z',
        },
        {
          id: 'art_5',
          title: 'Fifth story',
          slug: 'fifth-story',
          readingTime: 3,
          publishedAt: '2026-03-29T10:00:00Z',
        },
      ];

      render(
        <ArticleStreamBlock
          id="stream_many"
          props={streamProps}
          articles={many}
          publication={mockPublication}
          context={mockContext}
        />
      );

      expect(
        within(screen.getByTestId('center-hero-article')).getByText('Fifth story')
      ).toBeTruthy();
      expect(screen.getByTestId('trio-recent-column')).toBeTruthy();
      expect(screen.getByTestId('trio-popular-column')).toBeTruthy();

      expect(screen.getAllByTestId('trio-recent-item').length).toBe(2);
      expect(screen.getAllByTestId('trio-popular-item').length).toBe(2);

      const columns = ['trio-recent-column', 'trio-popular-column'] as const;
      const titles = columns.flatMap((testId) =>
        within(screen.getByTestId(testId))
          .getAllByRole('link')
          .map((link) => link.textContent?.trim() ?? '')
          .filter(Boolean)
      );
      expect(new Set(titles).size).toBe(titles.length);
      expect(titles).not.toContain('Fifth story');
    });
  });
});
