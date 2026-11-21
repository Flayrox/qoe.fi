// @vitest-environment jsdom
// =====================================================================
// 🧪 AppSidebar — un compteur en panne n'efface pas l'identité de l'espace
// =====================================================================
// Les trois lectures (`/v1/users/me`, compteur de notifications, espace actif)
// vivent dans un même `Promise.all` sous un seul `try`. Une panne du seul
// compteur suffit donc à jeter le profil ET l'espace média : la sidebar
// retombe sur « Studio », perd ses permissions et son bouton d'écriture.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  createClient: vi.fn(),
}));
const goClient = vi.hoisted(() => ({ goFetch: vi.fn() }));
const activeWorkspace = vi.hoisted(() => ({ getActiveWorkspace: vi.fn() }));

vi.mock('@qoe/supabase/server', () => supabase);
vi.mock('@qoe/sdk/actions/utils/go-client', () => goClient);
vi.mock('@/lib/active-workspace', () => ({
  ...activeWorkspace,
  parseCookie: vi.fn(),
}));
vi.mock('@/app/login/actions', () => ({ logout: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'studio.qoe.test' }),
}));
vi.mock('@qoe/config', () => ({
  getMainAppUrl: (host?: string) => `http://${host ?? 'qoe.test'}/home`,
}));

import { AppSidebar } from '../app-sidebar';

const ME = {
  data: {
    id: 'user_1',
    email: 'alex@qoe.test',
    username: 'alex',
    name: 'Alex',
    logoUrl: null,
    publisherLogoUrl: null,
  },
};

const MEDIA_WORKSPACE = {
  type: 'MEDIA' as const,
  name: 'Média X',
  mediaId: 'media_1',
  publisherId: 'pub_1',
  permissions: ['media:create_articles'],
};

beforeEach(() => {
  vi.clearAllMocks();
  supabase.createClient.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user_1', email: 'alex@qoe.test' } } }),
    },
  });
  activeWorkspace.getActiveWorkspace.mockResolvedValue(MEDIA_WORKSPACE);
});

describe('AppSidebar', () => {
  it('garde le profil et l’espace média quand le compteur de notifications échoue', async () => {
    goClient.goFetch.mockImplementation(async (path: string) => {
      if (path === '/v1/users/me') return ME;
      throw new Error('notifications indisponibles');
    });

    const element = await AppSidebar();
    const props = element.props as {
      brandName: string;
      permissions?: string[];
      canWrite: boolean;
      unreadCount: number;
      userName: string;
    };

    expect(props.userName).toBe('Alex');
    expect(props.brandName).toBe('Média X');
    expect(props.permissions).toEqual(['media:create_articles']);
    expect(props.canWrite).toBe(true);
    expect(props.unreadCount).toBe(0);
  });

  it('compte les notifications quand le compteur répond', async () => {
    goClient.goFetch.mockImplementation(async (path: string) => {
      if (path === '/v1/users/me') return ME;
      return { count: 5 };
    });

    const element = await AppSidebar();
    expect((element.props as { unreadCount: number }).unreadCount).toBe(5);
  });
});
