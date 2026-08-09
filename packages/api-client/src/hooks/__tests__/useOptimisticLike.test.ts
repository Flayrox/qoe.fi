import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { feedKeys } from '../../query-keys';
import { createOptimisticLikeMutationOptions } from '../useOptimisticLike';

describe('useOptimisticLike', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  it('1. Optimistically increments likeCount and updates isLiked flag in cache', async () => {
    const initialFeed = {
      pages: [
        {
          data: [
            { id: 'thought-1', content: 'Hello World', likeCount: 5, isLiked: false, liked: false },
            { id: 'thought-2', content: 'Second Thought', likeCount: 10, isLiked: false, liked: false },
          ],
        },
      ],
    };

    queryClient.setQueryData(feedKeys.timeline('for-you'), initialFeed);

    const onErrorMock = vi.fn();
    const likeMutationFn = vi.fn().mockResolvedValue({ success: true });

    const mutationOptions = createOptimisticLikeMutationOptions(queryClient, { onError: onErrorMock });

    // Simulate optimistic mutation execution
    const context = await mutationOptions.onMutate({
      thoughtId: 'thought-1',
      isLikedCurrent: false,
      likeMutationFn,
    });

    const updatedFeed = queryClient.getQueryData<any>(feedKeys.timeline('for-you'));
    const updatedThought = updatedFeed.pages[0].data[0];

    expect(updatedThought.likeCount).toBe(6);
    expect(updatedThought.isLiked).toBe(true);
    expect(updatedThought.liked).toBe(true);
    expect(context?.previousQueries).toBeDefined();
  });

  it('2. Rolls back cache to snapshot when mutation fails', async () => {
    const initialFeed = {
      pages: [
        {
          data: [
            { id: 'thought-1', content: 'Hello World', likeCount: 5, isLiked: false, liked: false },
          ],
        },
      ],
    };

    queryClient.setQueryData(feedKeys.timeline('for-you'), initialFeed);

    const onErrorMock = vi.fn();
    const mutationOptions = createOptimisticLikeMutationOptions(queryClient, { onError: onErrorMock });

    const context = await mutationOptions.onMutate({
      thoughtId: 'thought-1',
      isLikedCurrent: false,
      likeMutationFn: vi.fn(),
    });

    // Verify cache updated optimistically
    let cachedFeed = queryClient.getQueryData<any>(feedKeys.timeline('for-you'));
    expect(cachedFeed.pages[0].data[0].likeCount).toBe(6);

    // Trigger onError rollback
    const testError = new Error('Network error');
    mutationOptions.onError(testError, { thoughtId: 'thought-1', isLikedCurrent: false, likeMutationFn: vi.fn() }, context);

    // Verify cache rolled back
    const rolledBackFeed = queryClient.getQueryData<any>(feedKeys.timeline('for-you'));
    expect(rolledBackFeed.pages[0].data[0].likeCount).toBe(5);
    expect(rolledBackFeed.pages[0].data[0].isLiked).toBe(false);
    expect(onErrorMock).toHaveBeenCalledWith(testError);
  });

  it('3. Prevents negative likeCount when unliking at zero likes boundary', async () => {
    const initialFeed = {
      pages: [
        {
          data: [
            { id: 'thought-zero', content: 'Zero likes', likeCount: 0, isLiked: true, liked: true },
          ],
        },
      ],
    };

    queryClient.setQueryData(feedKeys.timeline('for-you'), initialFeed);

    const mutationOptions = createOptimisticLikeMutationOptions(queryClient);

    await mutationOptions.onMutate({
      thoughtId: 'thought-zero',
      isLikedCurrent: true,
      likeMutationFn: vi.fn(),
    });

    const updatedFeed = queryClient.getQueryData<any>(feedKeys.timeline('for-you'));
    const updatedThought = updatedFeed.pages[0].data[0];

    expect(updatedThought.likeCount).toBe(0);
    expect(updatedThought.isLiked).toBe(false);
  });
});
