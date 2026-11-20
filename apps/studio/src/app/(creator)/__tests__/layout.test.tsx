// =====================================================================
// 🧪 L21f — layout du studio : consentements légaux
// =====================================================================
//  1. `fetchPendingAcceptances` est le seul appel du layout sans garde : une
//     panne de l'API légale met toutes les pages du studio en erreur, alors
//     que le workspace et /v1/users/me dégradent déjà proprement.
//  2. L'origine des pages légales est écrite en dur (`https://qoe.fi`) au
//     lieu de venir de `@qoe/config`, seule source d'URL du dépôt.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@qoe/auth/current-user', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/active-workspace', () => ({
  getActiveWorkspace: vi.fn(),
}));

vi.mock('@qoe/i18n/server', () => ({
  getLanguage: vi.fn(async () => 'fr'),
}));

vi.mock('@qoe/sdk/actions/legal', () => ({
  fetchPendingAcceptances: vi.fn(),
}));

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: vi.fn(),
}));

const captured: { pending?: unknown[]; hrefBase?: string }[] = [];

vi.mock('@qoe/ui', () => ({
  LegalConsentGate: (props: { pending: unknown[]; hrefBase: string }) => {
    captured.push(props);
    return null;
  },
}));

vi.mock('@/features/dashboard/components/GlobalCommandMenu', () => ({
  GlobalCommandMenu: () => null,
}));
vi.mock('@/features/dashboard/components/app-sidebar', () => ({
  AppSidebar: () => null,
}));
vi.mock('@/features/dashboard/components/DashboardLayoutContent', () => ({
  DashboardLayoutContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/dashboard/components/SurfaceHotkeys', () => ({
  SurfaceHotkeys: () => null,
}));
vi.mock('@/features/upcoming/provider', () => ({
  FeatureAnnouncements: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { URLS } from '@qoe/config';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { fetchPendingAcceptances } from '@qoe/sdk/actions/legal';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

import DashboardLayout from '../layout';

const user = vi.mocked(requireUser);
const workspace = vi.mocked(getActiveWorkspace);
const pending = vi.mocked(fetchPendingAcceptances);
const me = vi.mocked(goFetch);

describe('DashboardLayout — consentements légaux', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.length = 0;
    user.mockResolvedValue({
      id: 'user_1',
      role: 'creator',
      hasCompletedOnboarding: true,
    } as never);
    workspace.mockResolvedValue({ type: 'PERSONAL', permissions: undefined } as never);
    me.mockResolvedValue({ data: { publisherId: 'pub_1' } } as never);
    pending.mockResolvedValue([]);
  });

  it('rend le studio même si l’API légale est en panne', async () => {
    pending.mockRejectedValue(new Error('legal API down'));

    const tree = await DashboardLayout({ children: null });
    render(tree);

    expect(captured.at(-1)?.pending).toEqual([]);
  });

  it('construit les liens légaux depuis la configuration, pas depuis une origine en dur', async () => {
    const tree = await DashboardLayout({ children: null });
    render(tree);

    expect(captured.at(-1)?.hrefBase).toBe(`${URLS.APP}/legal`);
  });
});
