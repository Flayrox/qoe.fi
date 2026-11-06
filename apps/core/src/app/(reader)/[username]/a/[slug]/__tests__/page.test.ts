import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserArticleDedicatedPage, { generateMetadata } from '../page';
import * as goClient from '@qoe/sdk/actions/utils/go-client';
import * as navigation from 'next/navigation';

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: vi.fn(),
}));

vi.mock('@/lib/home-feed-data', () => ({
  loadHomeFeedData: vi.fn().mockResolvedValue({
    initialSections: [],
    pinnedCategories: [],
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  permanentRedirect: vi.fn(),
}));

describe('UserArticleDedicatedPage - /:username/a/:slug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and builds canonical SEO metadata with /:username/a/:slug', async () => {
    vi.spyOn(goClient, 'goFetch').mockResolvedValue({
      id: 'art_123',
      title: 'Mon Super Article',
      slug: 'mon-super-article',
      content: 'Contenu de mon article fascinant.',
      createdAt: '2026-01-01T00:00:00Z',
      author: {
        id: 'u1',
        username: 'alex',
        name: 'Alexandre',
      },
    } as never);

    const meta = await generateMetadata({
      params: Promise.resolve({ username: 'alex', slug: 'mon-super-article' }),
    });

    expect(meta.title).toBe('Mon Super Article | qoefi');
    expect(meta.alternates?.canonical).toBe('https://qoe.fi/alex/a/mon-super-article');
  });

  it('calls notFound when article does not exist', async () => {
    vi.spyOn(goClient, 'goFetch').mockRejectedValue({ status: 404 });

    await UserArticleDedicatedPage({
      params: Promise.resolve({ username: 'alex', slug: 'inconnu' }),
    });

    expect(navigation.notFound).toHaveBeenCalled();
  });
});
