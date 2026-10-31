import { describe, it, expect, vi, beforeEach } from 'vitest';

const goFetch = vi.fn();

vi.mock('../actions/utils/go-client', () => ({
  goFetch: (...args: unknown[]) => goFetch(...args),
}));

vi.mock('../actions/utils/safe-action', () => ({
  safeAction:
    (fn: (input: unknown, user: unknown) => unknown) =>
    (input: unknown): unknown =>
      fn(input, { id: 'viewer' }),
}));

import { getNotificationsAction } from '../actions/notifications';

beforeEach(() => {
  goFetch.mockReset();
});

describe('getNotificationsAction — sender identity', () => {
  it('conserve la nature média renvoyée par le Go', async () => {
    goFetch.mockResolvedValue({
      notifications: [
        {
          id: 'notif-1',
          notificationIds: ['notif-1'],
          type: 'LIKE',
          isRead: false,
          createdAt: '2026-10-31T06:00:00Z',
          senders: [
            {
              id: 'user_camille',
              name: 'Camille Roux',
              username: 'camilleroux',
              logoUrl: null,
              isCertified: true,
              type: 'MEDIA',
            },
          ],
          totalCount: 1,
        },
      ],
      nextCursor: null,
    });

    const res = (await getNotificationsAction({ filter: 'all' })) as unknown as {
      notifications: Array<{ senders: Array<{ type?: string | null }> }>;
    };

    expect(res.notifications[0]?.senders[0]?.type).toBe('MEDIA');
  });
});
