import { describe, it, expect, vi, beforeEach } from 'vitest';
import ThoughtCatchAllPage from '../page';
import * as feedActions from '@qoe/sdk/actions/feed';
import * as navigation from 'next/navigation';

vi.mock('@qoe/sdk/actions/feed', () => ({
  getPostThreadAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

describe('ThoughtCatchAllPage - /thought/[...slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects /thought (empty slug) to /home', async () => {
    await ThoughtCatchAllPage({ params: Promise.resolve({ slug: [] }) });
    expect(navigation.redirect).toHaveBeenCalledWith('/home');
  });

  it('resolves /thought/:id and redirects to /:username/thought/:id', async () => {
    vi.spyOn(feedActions, 'getPostThreadAction').mockResolvedValue({
      ok: true,
      data: {
        post: {
          id: 'wdbuwdw',
          content: 'Hello world',
          author: {
            id: 'u1',
            username: 'camille',
          },
        },
      } as never,
    });

    await ThoughtCatchAllPage({ params: Promise.resolve({ slug: ['wdbuwdw'] }) });
    expect(navigation.redirect).toHaveBeenCalledWith('/camille/thought/wdbuwdw');
  });

  it('resolves /thought/:id for pure repost and redirects to original post', async () => {
    vi.spyOn(feedActions, 'getPostThreadAction').mockResolvedValue({
      ok: true,
      data: {
        post: {
          id: 'repost_1',
          content: '',
          author: { id: 'u2', username: 'bob' },
          repost: {
            id: 'original_1',
            content: 'Original thought',
            author: { id: 'u1', username: 'alice' },
          },
        },
      } as never,
    });

    await ThoughtCatchAllPage({ params: Promise.resolve({ slug: ['repost_1'] }) });
    expect(navigation.redirect).toHaveBeenCalledWith('/alice/thought/original_1');
  });

  it('calls notFound when post is not found for /thought/:id', async () => {
    vi.spyOn(feedActions, 'getPostThreadAction').mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Post not found' },
    });

    await ThoughtCatchAllPage({ params: Promise.resolve({ slug: ['missing_id'] }) });
    expect(navigation.notFound).toHaveBeenCalled();
  });

  it('redirects /thought/:username/:id directly to /:username/thought/:id', async () => {
    await ThoughtCatchAllPage({
      params: Promise.resolve({ slug: ['camille', 'wdbuwdw'] }),
    });
    expect(navigation.redirect).toHaveBeenCalledWith('/camille/thought/wdbuwdw');
  });

  it('calls notFound when slug has more than 2 segments', async () => {
    await ThoughtCatchAllPage({
      params: Promise.resolve({ slug: ['a', 'b', 'c'] }),
    });
    expect(navigation.notFound).toHaveBeenCalled();
  });
});
