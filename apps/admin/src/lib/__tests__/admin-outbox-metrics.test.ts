// =====================================================================
// 🧪 métriques d'outbox — une API muette n'est pas un « flux nominal »
// =====================================================================
// `getAdminOutboxMetrics` avalait l'échec et rendait des zéros avec
// `status: 'healthy'`. L'écran Notifications affichait alors une pastille verte
// « Flux nominal » pendant une panne d'API : l'opérateur lisait une bonne
// nouvelle fabriquée. L'absence de mesure doit se voir comme une absence.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch: vi.fn() }));

import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getAdminOutboxMetrics } from '../admin-data';

const mockGoFetch = vi.mocked(goFetch);

const healthy = {
  queuedTotal: 3,
  processingTotal: 0,
  stuckProcessing: 0,
  failedTotal: 1,
  sent24h: 40,
  failed24h: 1,
  oldestQueuedSeconds: 12,
  channels: [{ channel: 'email', queued: 3, sent: 40, failed: 1 }],
  status: 'healthy' as const,
};

describe('getAdminOutboxMetrics', () => {
  beforeEach(() => {
    mockGoFetch.mockReset();
  });

  it('rend les mesures du serveur quand il répond', async () => {
    mockGoFetch.mockResolvedValue(healthy);
    await expect(getAdminOutboxMetrics()).resolves.toEqual(healthy);
  });

  it('rend null quand l’API est injoignable, au lieu d’un faux « healthy »', async () => {
    mockGoFetch.mockRejectedValue(new Error('go indisponible'));
    await expect(getAdminOutboxMetrics()).resolves.toBeNull();
  });
});
