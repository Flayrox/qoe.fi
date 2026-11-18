// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// L06b : un refus d'action (session expirée, 403) doit devenir un état
// d'erreur React Query — pas une liste vide ni un compteur à zéro.

const { getNotificationsAction, getUnreadConversationsCountAction } = vi.hoisted(() => ({
  getNotificationsAction: vi.fn(),
  getUnreadConversationsCountAction: vi.fn(),
}));

vi.mock('../actions/notifications', () => ({
  getNotificationsAction,
  getUnreadNotificationCountAction: vi.fn(),
  markNotificationsAsReadAction: vi.fn(),
  getNotificationPreferencesAction: vi.fn(),
  updateNotificationPreferencesAction: vi.fn(),
}));

vi.mock('../actions/messages', () => ({
  getConversationsAction: vi.fn(),
  getUnreadConversationsCountAction,
}));

import { useNotificationsQuery } from '../hooks/useNotifications';
import { useUnreadConversationCountQuery } from '../hooks/useConversations';
import { actionErrorMessage, unwrapActionResult } from '../lib/actionResult';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

afterEach(() => {
  getNotificationsAction.mockReset();
  getUnreadConversationsCountAction.mockReset();
});

describe('useNotificationsQuery — refus explicite', () => {
  it('expose isError quand l’action refuse', async () => {
    getNotificationsAction.mockResolvedValue({
      ok: false,
      error: { message: 'Session expirée', code: 'UNAUTHORIZED' },
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useNotificationsQuery('all'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Session expirée');
  });

  it('rend la liste quand l’action réussit', async () => {
    getNotificationsAction.mockResolvedValue({
      ok: true,
      data: { notifications: [{ id: 'n1' }], nextCursor: null },
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useNotificationsQuery('all'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'n1' }]);
  });
});

describe('useUnreadConversationCountQuery — refus explicite', () => {
  it('ne transforme plus un refus en « 0 non-lu »', async () => {
    getUnreadConversationsCountAction.mockResolvedValue({
      ok: false,
      error: 'Non autorisé',
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useUnreadConversationCountQuery(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Non autorisé');
  });
});

describe('unwrapActionResult', () => {
  it('rend les données en cas de succès', () => {
    expect(unwrapActionResult({ ok: true, data: 42 }, 'échec')).toBe(42);
  });

  it('préfère le message du serveur au repli', () => {
    expect(actionErrorMessage({ message: 'Refusé' }, 'échec')).toBe('Refusé');
    expect(actionErrorMessage(undefined, 'échec')).toBe('échec');
  });
});
