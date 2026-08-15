// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { notificationKeys } from '@qoe/api-client';
import { useRealtimeNotificationSync } from './useRealtimeNotificationSync';

interface FakeRealtimeChannel {
  topic: string;
  subscribed: boolean;
  callbacks: Array<(payload: unknown) => void>;
  on: Mock;
  subscribe: Mock;
}

interface FakeSupabaseClient {
  channels: FakeRealtimeChannel[];
  auth: { getUser: Mock };
  channel: Mock;
  removeAllChannels: Mock;
  removeChannel: Mock;
}

let fakeClient: FakeSupabaseClient;

vi.mock('@qoe/supabase/client', () => ({
  createClient: vi.fn(() => fakeClient),
}));

/**
 * Reproduit les sémantiques du client Supabase Realtime réel :
 * - `channel(topic)` réutilise le MÊME objet canal pour un topic donné ;
 * - `.on()` lève une erreur si le canal est déjà `subscribe()`.
 */
function buildFakeClient(): FakeSupabaseClient {
  const channels: FakeRealtimeChannel[] = [];
  return {
    channels,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-42' } }, error: null }),
    },
    channel: vi.fn((topic: string) => {
      const existing = channels.find((c) => c.topic === topic);
      if (existing) return existing;

      const created: FakeRealtimeChannel = {
        topic,
        callbacks: [],
        subscribed: false,
        on: vi.fn(),
        subscribe: vi.fn(),
      };
      created.on.mockImplementation((_event: string, _opts: unknown, cb: (p: unknown) => void) => {
        if (created.subscribed) {
          throw new Error(`cannot add postgres_changes callbacks for ${topic} after subscribe()`);
        }
        created.callbacks.push(cb);
        return created;
      });
      created.subscribe.mockImplementation(() => {
        created.subscribed = true;
        return created;
      });
      channels.push(created);
      return created;
    }),
    removeAllChannels: vi.fn(),
    removeChannel: vi.fn(),
  };
}

function wrapperWith(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('useRealtimeNotificationSync', () => {
  it('subscribes once and fans out payloads to every mounted instance', async () => {
    fakeClient = buildFakeClient();

    // Deux montages simultanés (sidebar + header mobile) : le second ne doit
    // PAS re-appeler .on() sur le canal déjà abonné (bug corrigé).
    const qc1 = new QueryClient();
    const qc2 = new QueryClient();
    const invalidate1 = vi.spyOn(qc1, 'invalidateQueries');
    const invalidate2 = vi.spyOn(qc2, 'invalidateQueries');

    const { unmount: unmount1 } = renderHook(() => useRealtimeNotificationSync(), {
      wrapper: wrapperWith(qc1),
    });
    const { unmount: unmount2 } = renderHook(() => useRealtimeNotificationSync(), {
      wrapper: wrapperWith(qc2),
    });

    // Laisse getUser() résoudre et le canal se souscrire.
    await act(async () => {});

    // Une seule souscription partagée pour tous les montages.
    expect(fakeClient.auth.getUser).toHaveBeenCalledTimes(1);
    expect(fakeClient.channel).toHaveBeenCalledTimes(1);
    expect(fakeClient.channel).toHaveBeenCalledWith('public:Notification');

    const channel = fakeClient.channels[0];
    expect(channel.on).toHaveBeenCalledTimes(1);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    expect(channel.subscribed).toBe(true);

    // Payload Realtime reçu → les DEUX instances invalident leurs queries.
    act(() => {
      for (const cb of channel.callbacks) {
        cb({ new: { id: 'n1' } });
      }
    });

    for (const spy of [invalidate1, invalidate2]) {
      expect(spy).toHaveBeenCalledWith({ queryKey: notificationKeys.unreadCount() });
      expect(spy).toHaveBeenCalledWith({ queryKey: notificationKeys.all });
    }

    // Le unmount d'une instance ne détruit PAS le canal partagé…
    unmount1();
    unmount2();
    expect(fakeClient.removeAllChannels).not.toHaveBeenCalled();
    expect(channel.subscribed).toBe(true);

    // …et un remontage (double-invocation StrictMode) réutilise la
    // souscription existante sans re-créer de canal.
    const { unmount: unmount3 } = renderHook(() => useRealtimeNotificationSync(), {
      wrapper: wrapperWith(new QueryClient()),
    });
    await act(async () => {});
    expect(fakeClient.channel).toHaveBeenCalledTimes(1);
    expect(channel.on).toHaveBeenCalledTimes(1);
    unmount3();
  });
});
