import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MinimalCraftShell } from '../MinimalCraftShell';
import type { TemplatePublicationContext, TemplateArticleItem } from '../../../schema';

global.IntersectionObserver = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
} as unknown as typeof IntersectionObserver;

const mockPublication: TemplatePublicationContext = {
  id: 'pub_1',
  name: 'Devouring Details',
  domain: 'devouringdetails.com',
  accentColor: '#F97316',
  siteOptions: {
    showCraftIndex: true,
  },
};

const mockArticle: TemplateArticleItem = {
  id: 'art_1',
  title: 'Behind scenes',
  slug: 'behind-scenes',
};

describe('MinimalCraftShell - Devouring Details Exact Match (Screenshots 1 & 2)', () => {
  it('hides sidebar completely when closed, slides it in when open, and only shifts main content right while header remains fixed', () => {
    const { container } = render(
      <MinimalCraftShell
        publication={mockPublication}
        article={mockArticle}
        articles={[mockArticle]}
      >
        <article id="test-article-body">Contenu de test</article>
      </MinimalCraftShell>
    );

    const rootElement = container.querySelector('.platform_root');
    expect(rootElement?.getAttribute('data-sidebar-open')).toBe('false');

    const sidebarElement = container.querySelector('aside.platform_sidebar');
    expect(sidebarElement).toBeTruthy();
    // Quand fermé (Screenshot 2) : sidebar complètement masquée / escamotée à gauche
    expect(sidebarElement?.className).toContain('-translate-x-full');
    expect(sidebarElement?.className).toContain('opacity-0');

    const mainElement = container.querySelector('main');
    expect(mainElement?.className).toContain('translate-x-0');

    // Le header breadcrumb NE DOIT PAS bouger avec le contenu, il reste à sa position fixe
    const headerBreadcrumb = container.querySelector('header p');
    expect(headerBreadcrumb?.className).not.toMatch(/translate-x-(48|60|64)/);

    // Clic pour ouvrir la sidebar (Screenshot 1)
    const toggleButton = screen.getByLabelText('Basculer la sidebar');
    fireEvent.click(toggleButton);

    expect(rootElement?.getAttribute('data-sidebar-open')).toBe('true');
    // Quand ouvert (Screenshot 1) : sidebar visible sur le bord gauche
    expect(sidebarElement?.className).toContain('translate-x-0');
    expect(sidebarElement?.className).toContain('opacity-100');

    // Le contenu principal est translaté vers la droite pour faire place à la sidebar
    expect(mainElement?.className).toMatch(/translate-x-/);
    expect(mainElement?.className).not.toContain('translate-x-0');

    // Le header breadcrumb reste fixe
    expect(headerBreadcrumb?.className).not.toMatch(/translate-x-(48|60|64)/);

    // Clic pour refermer
    fireEvent.click(toggleButton);
    expect(rootElement?.getAttribute('data-sidebar-open')).toBe('false');
    expect(sidebarElement?.className).toContain('-translate-x-full');
    expect(sidebarElement?.className).toContain('opacity-0');
    expect(mainElement?.className).toContain('translate-x-0');
  });

  it('renders the configured wordmark next to the avatar instead of the publication name', () => {
    const publicationWithWordmark: TemplatePublicationContext = {
      ...mockPublication,
      siteOptions: { wordmarkUrl: 'https://cdn.example.com/rose-period.png' },
    };

    const { container } = render(
      <MinimalCraftShell publication={publicationWithWordmark} articles={[]}>
        <article>Contenu</article>
      </MinimalCraftShell>
    );

    const header = container.querySelector('header');
    const wordmark = header?.querySelector('img');
    expect(wordmark?.getAttribute('src')).toBe('https://cdn.example.com/rose-period.png');
    expect(wordmark?.getAttribute('alt')).toBe('Devouring Details');
    expect(header?.querySelector('p')).toBeNull();
  });

  it('preserves publication brand identity in header on article pages instead of morphing into article title', () => {
    const articleWithCategory: TemplateArticleItem = {
      id: 'art_2',
      title: 'Behind scenes',
      slug: 'behind-scenes',
      category: { name: 'Resources', slug: 'resources' },
    };

    const { container } = render(
      <MinimalCraftShell
        publication={mockPublication}
        article={articleWithCategory}
        articles={[articleWithCategory]}
      >
        <article>Contenu</article>
      </MinimalCraftShell>
    );

    const headerBreadcrumb = container.querySelector('header p');
    expect(headerBreadcrumb?.textContent).toContain('Devouring Details');
    expect(headerBreadcrumb?.textContent).not.toContain('Behind scenes');
    expect(headerBreadcrumb?.textContent).not.toContain('Index');
    expect(headerBreadcrumb?.textContent).not.toContain('Sommaire');
  });

  it('keeps publication brand in header when article has no category', () => {
    const articleWithoutCategory: TemplateArticleItem = {
      id: 'art_3',
      title: 'Behind scenes',
      slug: 'behind-scenes',
    };

    const { container } = render(
      <MinimalCraftShell
        publication={mockPublication}
        article={articleWithoutCategory}
        articles={[articleWithoutCategory]}
      >
        <article>Contenu</article>
      </MinimalCraftShell>
    );

    const headerBreadcrumb = container.querySelector('header p');
    expect(headerBreadcrumb?.textContent).toContain('Devouring Details');
    expect(headerBreadcrumb?.textContent).not.toContain('Behind scenes');
    expect(headerBreadcrumb?.textContent).not.toContain('Index');
    expect(headerBreadcrumb?.textContent).not.toContain('Sommaire');
  });

  it('renders a readable category header with breadcrumb, description and subcategory chips', () => {
    const publicationWithCategories: TemplatePublicationContext = {
      ...mockPublication,
      categories: [
        { id: 'cat_tech', name: 'Technologie', slug: 'tech', parentId: null },
        {
          id: 'cat_ia',
          name: 'Intelligence Artificielle',
          slug: 'ia',
          description: 'Analyses et repères sur les modèles et leurs usages.',
          parentId: 'cat_tech',
        },
        { id: 'cat_ml', name: 'Machine Learning', slug: 'machine-learning', parentId: 'cat_ia' },
      ],
    };

    const { container } = render(
      <MinimalCraftShell
        publication={publicationWithCategories}
        articles={[mockArticle]}
        activeCategory={publicationWithCategories.categories![1]}
      >
        <div>Articles de la catégorie</div>
      </MinimalCraftShell>
    );

    const breadcrumb = screen.getByLabelText('Fil d’Ariane');
    expect(breadcrumb.textContent).toContain('Accueil');
    expect(breadcrumb.textContent).toContain('Technologie');
    expect(breadcrumb.textContent).toContain('Intelligence Artificielle');
    expect(breadcrumb.querySelector('[aria-current="page"]')?.textContent).toBe(
      'Intelligence Artificielle'
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Intelligence Artificielle' }).textContent
    ).toBe('Intelligence Artificielle');
    expect(
      screen.getByText('Analyses et repères sur les modèles et leurs usages.').textContent
    ).toContain('Analyses et repères');
    expect(screen.getByText('1 article').textContent).toBe('1 article');

    const subcategories = screen.getByLabelText('Sous-catégories');
    expect(subcategories.textContent).toContain('Machine Learning');
    expect(subcategories.querySelector('a')?.getAttribute('href')).toBe('/machine-learning');

    // Le jargon interne ne doit plus apparaitre cote lecteur.
    expect(container.textContent).not.toContain('sous-rubrique');
  });

  it('displays publication name on home page when no article is active, without Sommaire suffix', () => {
    const { container } = render(
      <MinimalCraftShell publication={mockPublication} articles={[mockArticle]}>
        <div>Page d'accueil</div>
      </MinimalCraftShell>
    );

    const headerBreadcrumb = container.querySelector('header p');
    expect(headerBreadcrumb?.textContent).toContain('Devouring Details');
    expect(headerBreadcrumb?.textContent).not.toContain('Sommaire');
  });
});
