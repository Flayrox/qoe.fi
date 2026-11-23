// @vitest-environment jsdom
// =====================================================================
// 🧪 useRealtimeFeedBuffer — la pastille dit la vérité, le canal est partagé
// =====================================================================
// Un payload `postgres_changes` contient la ligne seule : l'ancien hook en
// fabriquait une pensée complète avec un faux auteur (« Creator »), comptait
// des brouillons programmés, des pensées privées et des réponses, et ouvrait
// un canal par montage — le second montage du même type levait
// « cannot add postgres_changes callbacks … after subscribe() ».
//
// Les tests ci-dessous verrouillent : le prédicat d'éligibilité, le comptage,
// le partage du canal (un seul abonnement par topic, retiré au dernier
// démontage), la mise à jour des compteurs et le rafraîchissement au flush.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

type Payload = { new: Record<string, unknown> };

const realtime = vi.hoisted(() => {
  interface FakeChannel {
    topic: string;
    handlers: { insert?: (payload: Payload) => void; update?: (payload: Payload) => void };
    on: (
      event: string,
      filter: { event: string },
      callback: (payload: Payload) => void
    ) => FakeChannel;
    subscribe: () => FakeChannel;
  }

  const channels: FakeChannel[] = [];
  const removed: string[] = [];

  function client() {
    return {
      channel(topic: string): FakeChannel {
        const channel: FakeChannel = {
          topic,
          handlers: {},
          on(_event, filter, callback) {
            if (filter.event === 'INSERT') channel.handlers.insert = callback;
            if (filter.event === 'UPDATE') channel.handlers.update = callback;
            return channel;
          },
          subscribe() {
            return channel;
          },
        };
        channels.push(channel);
        return channel;
      },
      removeChannel(channel: FakeChannel) {
        removed.push(channel.topic);
        return Promise.resolve('ok');
      },
    };
  }

  return { channels, removed, client };
});

vi.mock('@qoe/supabase/client', () => ({ createClient: () => realtime.client() }));

import {
  MAX_BUFFERED_FEED_POSTS,
  isBufferedFeedPost,
  useRealtimeFeedBuffer,
} from '../useRealtimeFeedBuffer';
import { feedKeys } from '@qoe/sdk';

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const PUBLIC_POST = {
  id: 'post-1',
  visibility: 'public',
  contentVisibility: 'PUBLIC',
  isDraft: false,
  scheduledAt: null,
  deletedAt: null,
  isHiddenByAuthor: false,
  parentId: null,
};

beforeEach(() => {
  realtime.channels.length = 0;
  realtime.removed.length = 0;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('isBufferedFeedPost', () => {
  const NOW = Date.parse('2026-11-23T12:00:00.000Z');

  it('accepte une pensée publiée de premier niveau', () => {
    expect(isBufferedFeedPost(PUBLIC_POST, NOW)).toBe(true);
  });

  it('refuse brouillon, supprimée, masquée par son auteur', () => {
    expect(isBufferedFeedPost({ ...PUBLIC_POST, isDraft: true }, NOW)).toBe(false);
    expect(isBufferedFeedPost({ ...PUBLIC_POST, deletedAt: '2026-11-23T10:00:00.000Z' }, NOW)).toBe(
      false
    );
    expect(isBufferedFeedPost({ ...PUBLIC_POST, isHiddenByAuthor: true }, NOW)).toBe(false);
  });

  it('refuse une pensée qui n’est pas visible de tous', () => {
    expect(isBufferedFeedPost({ ...PUBLIC_POST, visibility: 'private' }, NOW)).toBe(false);
    expect(isBufferedFeedPost({ ...PUBLIC_POST, visibility: 'followers' }, NOW)).toBe(false);
    expect(isBufferedFeedPost({ ...PUBLIC_POST, contentVisibility: 'SUBSCRIBERS' }, NOW)).toBe(
      false
    );
  });

  it('refuse une programmation future ou illisible, accepte une publication passée', () => {
    expect(
      isBufferedFeedPost({ ...PUBLIC_POST, scheduledAt: '2026-11-23T12:00:01.000Z' }, NOW)
    ).toBe(false);
    expect(isBufferedFeedPost({ ...PUBLIC_POST, scheduledAt: 'pas une date' }, NOW)).toBe(false);
    expect(
      isBufferedFeedPost({ ...PUBLIC_POST, scheduledAt: '2026-11-23T09:00:00.000Z' }, NOW)
    ).toBe(true);
  });

  it('refuse une réponse et une ligne sans identifiant', () => {
    expect(isBufferedFeedPost({ ...PUBLIC_POST, parentId: 'post-0' }, NOW)).toBe(false);
    expect(isBufferedFeedPost({ ...PUBLIC_POST, id: '' }, NOW)).toBe(false);
    expect(isBufferedFeedPost(null, NOW)).toBe(false);
    expect(isBufferedFeedPost(undefined, NOW)).toBe(false);
  });
});

describe('useRealtimeFeedBuffer', () => {
  it('compte les pensées publiées et ignore les invisibles, sans doublon', async () => {
    const queryClient = newQueryClient();
    const { result, unmount } = renderHook(() => useRealtimeFeedBuffer({ type: 'for-you' }), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(realtime.channels).toHaveLength(1));
    const channel = realtime.channels[0];

    act(() => {
      channel.handlers.insert?.({ new: PUBLIC_POST });
      channel.handlers.insert?.({ new: PUBLIC_POST });
      channel.handlers.insert?.({ new: { ...PUBLIC_POST, id: 'post-2', visibility: 'private' } });
      channel.handlers.insert?.({
        new: { ...PUBLIC_POST, id: 'post-3', scheduledAt: '2027-01-01T00:00:00.000Z' },
      });
    });

    expect(result.current.unreadCount).toBe(1);
    unmount();
  });

  it('plafonne la pastille', async () => {
    const queryClient = newQueryClient();
    const { result, unmount } = renderHook(() => useRealtimeFeedBuffer(), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(realtime.channels).toHaveLength(1));
    act(() => {
      for (let index = 0; index < MAX_BUFFERED_FEED_POSTS + 10; index += 1) {
        realtime.channels[0].handlers.insert?.({ new: { ...PUBLIC_POST, id: `post-${index}` } });
      }
    });

    expect(result.current.unreadCount).toBe(MAX_BUFFERED_FEED_POSTS);
    unmount();
  });

  it('partage un seul canal par type et ne le retire qu’au dernier démontage', async () => {
    const queryClient = newQueryClient();
    const wrapper = wrapperFor(queryClient);
    const first = renderHook(() => useRealtimeFeedBuffer({ type: 'following' }), { wrapper });
    const second = renderHook(() => useRealtimeFeedBuffer({ type: 'following' }), { wrapper });

    await waitFor(() => expect(realtime.channels).toHaveLength(1));

    first.unmount();
    expect(realtime.removed).toEqual([]);

    second.unmount();
    await waitFor(() => expect(realtime.removed).toEqual(['realtime-feed:following']));
  });

  it('répercute les compteurs d’une mise à jour dans les pages chargées', async () => {
    const queryClient = newQueryClient();
    const key = feedKeys.timeline('for-you');
    queryClient.setQueryData(key, {
      pages: [{ data: [{ id: 'post-1', likeCount: 3, replyCount: 1 }, { id: 'post-9' }] }],
      pageParams: [0],
    });

    const { unmount } = renderHook(() => useRealtimeFeedBuffer({ type: 'for-you' }), {
      wrapper: wrapperFor(queryClient),
    });
    await waitFor(() => expect(realtime.channels).toHaveLength(1));

    act(() => {
      realtime.channels[0].handlers.update?.({
        new: { id: 'post-1', likeCount: 4, replyCount: 2, repostCount: 0 },
      });
    });

    const data = queryClient.getQueryData<{
      pages: { data: { id: string; likeCount?: number; replyCount?: number }[] }[];
    }>(key);
    expect(data?.pages[0].data[0]).toMatchObject({ likeCount: 4, replyCount: 2 });
    expect(data?.pages[0].data[1]).toEqual({ id: 'post-9' });
    unmount();
  });

  it('rafraîchit le fil et remet la pastille à zéro au flush', async () => {
    const queryClient = newQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result, unmount } = renderHook(() => useRealtimeFeedBuffer({ type: 'for-you' }), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(realtime.channels).toHaveLength(1));
    act(() => {
      realtime.channels[0].handlers.insert?.({ new: PUBLIC_POST });
    });
    expect(result.current.unreadCount).toBe(1);

    act(() => {
      result.current.flushBuffer();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: feedKeys.timeline('for-you') });
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    unmount();
  });
});
