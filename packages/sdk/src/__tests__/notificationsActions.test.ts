import { beforeEach, describe, expect, it, vi } from 'vitest';

const { goFetch } = vi.hoisted(() => ({ goFetch: vi.fn() }));

vi.mock('../actions/utils/go-client', () => ({ goFetch }));
vi.mock('@qoe/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'u1', email: 'u1@test.dev' } },
        error: null,
      }),
    },
  }),
}));

import { getNotificationsAction, markNotificationsAsReadAction } from '../actions/notifications';
import { MAX_READ_IDS, normalizeNotificationFilter } from '../actions/utils/notification-filter';

function lastUrl(): string {
  return String(goFetch.mock.calls.at(-1)?.[0]);
}

beforeEach(() => {
  goFetch.mockReset();
  goFetch.mockResolvedValue({ notifications: [], nextCursor: null, success: true });
});

describe('normalizeNotificationFilter', () => {
  it('accepte les filtres du Go et retombe sur all sinon', () => {
    expect(normalizeNotificationFilter('mentions')).toBe('mentions');
    expect(normalizeNotificationFilter('ALL')).toBe('all');
    expect(normalizeNotificationFilter('all&limit=9999')).toBe('all');
    expect(normalizeNotificationFilter(undefined)).toBe('all');
  });
});

describe('getNotificationsAction', () => {
  it('encode le filtre : aucune réécriture de la query string', async () => {
    await getNotificationsAction({ filter: 'all&limit=9999' as never, limit: 5 });
    const url = lastUrl();
    expect(url).toContain('filter=all&limit=5');
    expect(url).not.toContain('9999');
  });

  it('borne un limit hors contrat', async () => {
    await getNotificationsAction({ limit: 100_000 });
    expect(lastUrl()).toContain('limit=100');
    await getNotificationsAction({ limit: -3 });
    expect(lastUrl()).toContain('limit=1');
  });
});

describe('markNotificationsAsReadAction', () => {
  it('déduplique, filtre les vides et plafonne le lot', async () => {
    const ids = Array.from({ length: MAX_READ_IDS + 25 }, (_, i) => `n${i}`);
    await markNotificationsAsReadAction({ notificationIds: ['a', 'a', '', 'b', ...ids] });
    const body = goFetch.mock.calls.at(-1)?.[1]?.body as { notificationIds: string[] };
    expect(body.notificationIds).toHaveLength(MAX_READ_IDS);
    expect(body.notificationIds.slice(0, 3)).toEqual(['a', 'b', 'n0']);
  });
});
