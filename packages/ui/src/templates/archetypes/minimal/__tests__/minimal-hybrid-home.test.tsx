import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200',
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

    it('renders featured article with bleed cover, category pill and "Lire l’article" button', () => {
      render(
        <ArticleStreamBlock
          id="stream_test"
          props={streamProps}
          articles={mockArticles}
          publication={mockPublication}
          context={mockContext}
        />
      );

      // Featured article title
      const featuredTitle = screen.getByText('Behind scenes');
      expect(featuredTitle).toBeTruthy();

      // Excerpt of featured article
      expect(
        screen.getByText(/Deep dive into the kinetic models powering fluid responsive sheets/i)
      ).toBeTruthy();

      // Call-to-action button / link
      const readCta = screen.getByText(/Lire l’article/i);
      expect(readCta).toBeTruthy();
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
  });
});
