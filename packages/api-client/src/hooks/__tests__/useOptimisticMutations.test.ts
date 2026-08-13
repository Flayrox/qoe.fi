import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { feedKeys, userKeys } from '../../query-keys';
import { createOptimisticRepostMutationOptions } from '../useOptimisticRepost';
import { createOptimisticBookmarkMutationOptions } from '../useOptimisticBookmark';
import { createOptimisticFollowMutationOptions } from '../useOptimisticFollow';

interface RepostFeed {
  pages: Array<{
    data: Array<{
      id: string;
      content: string;
      repostCount: number;
      isReposted: boolean;
      reposted: boolean;
    }>;
  }>;
}

interface BookmarkFeed {
  pages: Array<{
    data: Array<{ id: string; title: string; isBookmarked: boolean; bookmarked: boolean }>;
  }>;
}

interface CreatorUser {
  id: string;
  username: string;
  isFollowed: boolean;
  isFollowing: boolean;
}

describe('Optimistic Mutation Hooks', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  it('1. Optimistically toggles repostCount and reposted flag in cache', async () => {
    const initialFeed = {
      pages: [
        {
          data: [
            {
              id: 'thought-1',
              content: 'Hello',
              repostCount: 2,
              isReposted: false,
              reposted: false,
            },
          ],
        },
      ],
    };

    queryClient.setQueryData(feedKeys.timeline('for-you'), initialFeed);

    const mutationOptions = createOptimisticRepostMutationOptions(queryClient);

    await mutationOptions.onMutate({
      thoughtId: 'thought-1',
      isRepostedCurrent: false,
      repostMutationFn: vi.fn().mockResolvedValue({ success: true }),
    });

    const updatedFeed = queryClient.getQueryData<RepostFeed>(feedKeys.timeline('for-you'))!;
    expect(updatedFeed.pages[0].data[0].repostCount).toBe(3);
    expect(updatedFeed.pages[0].data[0].isReposted).toBe(true);
  });

  it('2. Optimistically toggles isBookmarked flag in cache', async () => {
    const initialFeed = {
      pages: [
        {
          data: [{ id: 'article-1', title: 'Article 1', isBookmarked: false, bookmarked: false }],
        },
      ],
    };

    queryClient.setQueryData(feedKeys.timeline('for-you'), initialFeed);

    const mutationOptions = createOptimisticBookmarkMutationOptions(queryClient);

    await mutationOptions.onMutate({
      articleId: 'article-1',
      isBookmarkedCurrent: false,
      bookmarkMutationFn: vi.fn().mockResolvedValue({ success: true }),
    });

    const updatedFeed = queryClient.getQueryData<BookmarkFeed>(feedKeys.timeline('for-you'))!;
    expect(updatedFeed.pages[0].data[0].isBookmarked).toBe(true);
  });

  it('3. Optimistically updates isFollowed flag on creator profile', async () => {
    const initialUser = {
      id: 'creator-1',
      username: 'alice',
      isFollowed: false,
      isFollowing: false,
    };

    queryClient.setQueryData(userKeys.all, initialUser);

    const mutationOptions = createOptimisticFollowMutationOptions(queryClient);

    await mutationOptions.onMutate({
      creatorId: 'creator-1',
      isFollowedCurrent: false,
      followMutationFn: vi.fn().mockResolvedValue({ success: true }),
    });

    const updatedUser = queryClient.getQueryData<CreatorUser>(userKeys.all)!;
    expect(updatedUser.isFollowed).toBe(true);
  });
});
