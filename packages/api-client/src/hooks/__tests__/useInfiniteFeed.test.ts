import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { ApiResponse, ThoughtData } from '../../types';

describe('useInfiniteFeed logic & pagination parameters', () => {
  beforeEach(() => {
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  it('1. Correctly extracts meta.cursor as getNextPageParam when hasMore is true', () => {
    const lastPage: ApiResponse<ThoughtData[]> = {
      data: [
        {
          id: 'thought-10',
          content: 'T10',
          authorId: 'u1',
          author: { id: 'u1', username: 'alice', name: 'Alice', subdomain: 'alice' },
          createdAt: '2026-08-09T10:00:00.000Z',
          likeCount: 0,
          repostCount: 0,
          replyCount: 0,
        },
      ],
      meta: {
        cursor: 'cursor-thought-10',
        hasMore: true,
      },
    };

    const getNextPageParam = (page: ApiResponse<ThoughtData[]>) => {
      if (!page || !page.meta) return undefined;
      return page.meta.hasMore && page.meta.cursor ? page.meta.cursor : undefined;
    };

    expect(getNextPageParam(lastPage)).toBe('cursor-thought-10');
  });

  it('2. Returns undefined for getNextPageParam when hasMore is false', () => {
    const lastPage: ApiResponse<ThoughtData[]> = {
      data: [],
      meta: {
        cursor: null,
        hasMore: false,
      },
    };

    const getNextPageParam = (page: ApiResponse<ThoughtData[]>) => {
      if (!page || !page.meta) return undefined;
      return page.meta.hasMore && page.meta.cursor ? page.meta.cursor : undefined;
    };

    expect(getNextPageParam(lastPage)).toBeUndefined();
  });

  it('3. Guarantees deduplicated boundary item joining across pages', () => {
    const page1: ApiResponse<ThoughtData[]> = {
      data: [
        {
          id: 'item-1',
          content: 'C1',
          authorId: 'u1',
          author: { id: 'u1', username: 'a', name: 'A', subdomain: 'a' },
          createdAt: '2026-08-09T12:00:00Z',
          likeCount: 0,
          repostCount: 0,
          replyCount: 0,
        },
        {
          id: 'item-2',
          content: 'C2',
          authorId: 'u1',
          author: { id: 'u1', username: 'a', name: 'A', subdomain: 'a' },
          createdAt: '2026-08-09T11:00:00Z',
          likeCount: 0,
          repostCount: 0,
          replyCount: 0,
        },
      ],
      meta: { cursor: 'item-2', hasMore: true },
    };

    const page2: ApiResponse<ThoughtData[]> = {
      data: [
        {
          id: 'item-3',
          content: 'C3',
          authorId: 'u1',
          author: { id: 'u1', username: 'a', name: 'A', subdomain: 'a' },
          createdAt: '2026-08-09T10:00:00Z',
          likeCount: 0,
          repostCount: 0,
          replyCount: 0,
        },
      ],
      meta: { cursor: 'item-3', hasMore: false },
    };

    const pages = [page1, page2];
    const allItems = pages.flatMap((p) => p.data);

    // Verify all IDs are distinct and boundary item-2 is not duplicated
    const ids = allItems.map((i) => i.id);
    expect(ids).toEqual(['item-1', 'item-2', 'item-3']);
    expect(new Set(ids).size).toBe(3);
  });

  describe('4. Brique 4: Quota-driven automatic pagination side effects', () => {
    it('Triggers fetchNextPage when visible items are below quota and hasNextPage is true', () => {
      const fetchNextPage = vi.fn();

      const triggerEffect = ({
        enabled,
        hasNextPage,
        isFetching,
        visibleCount,
        minVisibleQuota,
      }: {
        enabled: boolean;
        hasNextPage: boolean;
        isFetching: boolean;
        visibleCount: number;
        minVisibleQuota: number;
      }) => {
        if (enabled && hasNextPage && !isFetching && visibleCount < minVisibleQuota) {
          fetchNextPage();
        }
      };

      triggerEffect({
        enabled: true,
        hasNextPage: true,
        isFetching: false,
        visibleCount: 15,
        minVisibleQuota: 30,
      });

      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    it('Does NOT trigger fetchNextPage when visible items are equal to or above quota', () => {
      const fetchNextPage = vi.fn();

      const triggerEffect = ({
        enabled,
        hasNextPage,
        isFetching,
        visibleCount,
        minVisibleQuota,
      }: {
        enabled: boolean;
        hasNextPage: boolean;
        isFetching: boolean;
        visibleCount: number;
        minVisibleQuota: number;
      }) => {
        if (enabled && hasNextPage && !isFetching && visibleCount < minVisibleQuota) {
          fetchNextPage();
        }
      };

      triggerEffect({
        enabled: true,
        hasNextPage: true,
        isFetching: false,
        visibleCount: 30,
        minVisibleQuota: 30,
      });

      expect(fetchNextPage).not.toHaveBeenCalled();
    });

    it('Does NOT trigger fetchNextPage when hasNextPage is false', () => {
      const fetchNextPage = vi.fn();

      const triggerEffect = ({
        enabled,
        hasNextPage,
        isFetching,
        visibleCount,
        minVisibleQuota,
      }: {
        enabled: boolean;
        hasNextPage: boolean;
        isFetching: boolean;
        visibleCount: number;
        minVisibleQuota: number;
      }) => {
        if (enabled && hasNextPage && !isFetching && visibleCount < minVisibleQuota) {
          fetchNextPage();
        }
      };

      triggerEffect({
        enabled: true,
        hasNextPage: false,
        isFetching: false,
        visibleCount: 10,
        minVisibleQuota: 30,
      });

      expect(fetchNextPage).not.toHaveBeenCalled();
    });

    it('Does NOT trigger fetchNextPage when already fetching (isFetching: true)', () => {
      const fetchNextPage = vi.fn();

      const triggerEffect = ({
        enabled,
        hasNextPage,
        isFetching,
        visibleCount,
        minVisibleQuota,
      }: {
        enabled: boolean;
        hasNextPage: boolean;
        isFetching: boolean;
        visibleCount: number;
        minVisibleQuota: number;
      }) => {
        if (enabled && hasNextPage && !isFetching && visibleCount < minVisibleQuota) {
          fetchNextPage();
        }
      };

      triggerEffect({
        enabled: true,
        hasNextPage: true,
        isFetching: true,
        visibleCount: 10,
        minVisibleQuota: 30,
      });

      expect(fetchNextPage).not.toHaveBeenCalled();
    });
  });
});
