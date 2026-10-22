import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { notFound } from 'next/navigation';
import { render, screen, cleanup } from '@testing-library/react';
import TenantCategoryFilterPage, { generateMetadata } from '../page';
import * as tenantData from '@/lib/tenant-data';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

vi.mock('@qoe/i18n/server', () => ({
  getLanguage: vi.fn(async () => 'fr'),
}));

vi.mock('@/components/TenantPageRenderer', () => ({
  TenantPageRenderer: (props: {
    activeCategory?: { name: string; slug: string };
    filteredArticles?: Array<{ id: string; title: string }>;
  }) => (
    <div data-testid="tenant-category-page">
      <span data-testid="active-cat-name">{props.activeCategory?.name}</span>
      <span data-testid="filtered-count">{props.filteredArticles?.length}</span>
      <ul>
        {props.filteredArticles?.map((a) => (
          <li key={a.id}>{a.title}</li>
        ))}
      </ul>
    </div>
  ),
}));

describe('TenantCategoryFilterPage — Filtrage par rubrique et sous-rubrique', () => {
  const dummyPub = {
    id: 'pub_test',
    name: 'Carnet Tech',
    slug: 'carnet-tech',
    categories: [
      { id: 'cat_tech', name: 'Technologie', slug: 'tech', parentId: null },
      { id: 'cat_ai', name: 'Intelligence Artificielle', slug: 'ia', parentId: 'cat_tech' },
      { id: 'cat_design', name: 'Design', slug: 'design', parentId: null },
    ],
    articles: [
      {
        id: 'art_1',
        title: 'Article Tech Pur',
        category: { name: 'Technologie', slug: 'tech' },
        categoryId: 'cat_tech',
        published: true,
      },
      {
        id: 'art_2',
        title: 'Article IA Spécialisé',
        category: { name: 'Intelligence Artificielle', slug: 'ia' },
        categoryId: 'cat_ai',
        published: true,
      },
      {
        id: 'art_3',
        title: 'Article Design Seul',
        category: { name: 'Design', slug: 'design' },
        categoryId: 'cat_design',
        published: true,
      },
    ],
  };

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(tenantData, 'fetchTenantPublication').mockResolvedValue(
      dummyPub as unknown as tenantData.TenantPublication
    );
    vi.spyOn(tenantData, 'fetchTenantRecommendations').mockResolvedValue([]);
  });

  it("appelle notFound() si la rubrique n'existe pas", async () => {
    await TenantCategoryFilterPage({
      params: Promise.resolve({ domain: 'tech.qoe.fi', categorySlug: 'inexistante' }),
    });

    expect(notFound).toHaveBeenCalled();
  });

  it('affiche les articles de la rubrique parente ET de ses sous-rubriques', async () => {
    const Component = await TenantCategoryFilterPage({
      params: Promise.resolve({ domain: 'tech.qoe.fi', categorySlug: 'tech' }),
    });

    render(Component);

    expect(screen.getByTestId('active-cat-name')).toHaveTextContent('Technologie');
    // Tech + IA = 2 articles
    expect(screen.getByTestId('filtered-count')).toHaveTextContent('2');
    expect(screen.getByText('Article Tech Pur')).toBeInTheDocument();
    expect(screen.getByText('Article IA Spécialisé')).toBeInTheDocument();
    expect(screen.queryByText('Article Design Seul')).not.toBeInTheDocument();
  });

  it("affiche uniquement les articles de la sous-rubrique lorsqu'elle est sélectionnée", async () => {
    const Component = await TenantCategoryFilterPage({
      params: Promise.resolve({ domain: 'tech.qoe.fi', categorySlug: 'ia' }),
    });

    render(Component);

    expect(screen.getByTestId('active-cat-name')).toHaveTextContent('Intelligence Artificielle');
    // Uniquement l'article IA = 1 article
    expect(screen.getByTestId('filtered-count')).toHaveTextContent('1');
    expect(screen.getByText('Article IA Spécialisé')).toBeInTheDocument();
    expect(screen.queryByText('Article Tech Pur')).not.toBeInTheDocument();
  });

  it('génère les metadata de la rubrique correctement', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ domain: 'tech.qoe.fi', categorySlug: 'tech' }),
    });

    expect(meta.title).toBe('Technologie | Carnet Tech');
    expect(meta.alternates?.canonical).toBe('https://tech.qoe.fi/tech');
  });
});
