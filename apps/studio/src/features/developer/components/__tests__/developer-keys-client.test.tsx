// @vitest-environment jsdom
// =====================================================================
// 🧪 DeveloperKeysClient — une rotation doit se voir dans le tableau
// =====================================================================
// Après une rotation réussie, le secret change et le préfixe affiché aussi.
// Sans relecture, la ligne continue d'afficher l'ancien préfixe : l'écran
// décrit une clé qui n'existe plus, et l'utilisateur qui la compare à ses
// variables d'environnement ne peut pas savoir laquelle est vivante.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const dashboardActions = vi.hoisted(() => ({
  generateApiKeyAction: vi.fn(),
  revokeApiKeyAction: vi.fn(),
  rotateApiKeyAction: vi.fn(),
}));
const mediaActions = vi.hoisted(() => ({
  createMediaApiKeyAction: vi.fn(),
  revokeMediaApiKeyAction: vi.fn(),
  rotateMediaApiKeyAction: vi.fn(),
}));
const developerActions = vi.hoisted(() => ({ listDeveloperKeysAction: vi.fn() }));

vi.mock('@qoe/sdk/actions/dashboard', () => dashboardActions);
vi.mock('@/app/(creator)/media/actions', () => mediaActions);
vi.mock('../../actions', () => developerActions);
vi.mock('@/lib/authz-feedback', () => ({
  attemptWithStepUp: async <T,>(run: () => Promise<T>) => run(),
}));
vi.mock('@qoe/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { DeveloperKeysClient } from '../developer-keys-client';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false;
  },
})) as typeof window.matchMedia;

const ACCESS = {
  status: 'approved' as const,
  grants: ['api:read', 'api:write', 'api:analytics'],
  reason: null,
  updatedAt: null,
};

const WORKSPACE = { type: 'PERSONAL' as const, name: 'Alex', publisherId: 'pub_1' };

function keyWith(prefix: string) {
  return {
    id: 'key_1',
    name: 'Site',
    keyPrefix: prefix,
    scopes: ['READ'],
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dashboardActions.rotateApiKeyAction.mockResolvedValue({
    ok: true,
    data: { apiKey: 'qoe_new_secret' },
  });
  developerActions.listDeveloperKeysAction.mockResolvedValue({
    success: true,
    keys: [keyWith('qoe_new_')],
  });
});

afterEach(() => {
  cleanup();
});

describe('DeveloperKeysClient', () => {
  it('relit la liste après une rotation : le préfixe affiché est celui du serveur', async () => {
    render(
      <DeveloperKeysClient
        access={ACCESS}
        initialKeys={[keyWith('qoe_old_')]}
        workspace={WORKSPACE}
      />
    );

    expect(screen.getByText(/qoe_old_/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Rotater la clé' }));

    await waitFor(() => expect(dashboardActions.rotateApiKeyAction).toHaveBeenCalledWith('key_1'));
    // Le préfixe du tableau (suivi des puces), pas le secret de la modale.
    await waitFor(() => expect(screen.getByText(/qoe_new_••/)).toBeDefined());
    expect(screen.queryByText(/qoe_old_/)).toBeNull();
  });
});
