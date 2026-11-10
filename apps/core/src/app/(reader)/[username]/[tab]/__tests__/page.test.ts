import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserProfileTabPage, { generateMetadata } from '../page';
import * as goClient from '@qoe/sdk/actions/utils/go-client';
import * as navigation from 'next/navigation';

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  permanentRedirect: vi.fn(),
}));

describe('UserProfileTabPage - resilient article routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects /article/:slug to /:canonicalOwner/a/:slug when article exists', async () => {
    vi.spyOn(goClient, 'goFetch').mockResolvedValue({
      id: 'art_123',
      slug: 'super-article',
      author: {
        username: 'charlottegauthier',
      },
      publisher: {
        slug: 'charlottegauthier',
      },
    } as never);

    await UserProfileTabPage({
      params: Promise.resolve({ username: 'article', tab: 'super-article' }),
    });

    expect(navigation.permanentRedirect).toHaveBeenCalledWith('/charlottegauthier/a/super-article');
  });

  it('redirects /a/:slug to /:canonicalOwner/a/:slug when article exists', async () => {
    vi.spyOn(goClient, 'goFetch').mockResolvedValue({
      id: 'art_123',
      slug: 'super-article',
      author: {
        username: 'alex',
      },
    } as never);

    await UserProfileTabPage({
      params: Promise.resolve({ username: 'a', tab: 'super-article' }),
    });

    expect(navigation.permanentRedirect).toHaveBeenCalledWith('/alex/a/super-article');
  });

  it('builds canonical alternates in metadata for /article/:slug', async () => {
    vi.spyOn(goClient, 'goFetch').mockResolvedValue({
      id: 'art_123',
      slug: 'super-article',
      author: {
        username: 'charlottegauthier',
      },
    } as never);

    const meta = await generateMetadata({
      params: Promise.resolve({ username: 'article', tab: 'super-article' }),
    });

    expect(meta.alternates?.canonical).toBe('https://qoe.fi/charlottegauthier/a/super-article');
  });

  it('calls notFound when /article/:slug does not exist in backend', async () => {
    vi.spyOn(goClient, 'goFetch').mockRejectedValue({ status: 404 });

    await UserProfileTabPage({
      params: Promise.resolve({ username: 'article', tab: 'introuvable' }),
    });

    expect(navigation.notFound).toHaveBeenCalled();
  });
});
