// @vitest-environment jsdom
// =====================================================================
// 🧪 Recours — un détail illisible se dit, il ne se tait pas
// =====================================================================
// `loadFullDetail` posait l'aperçu de synthèse puis remplaçait par le détail
// complet SI l'appel réussissait — sans un mot en cas d'échec. L'opérateur
// croyait lire le fil contradictoire alors qu'il n'avait que l'en-tête, et
// jugeait un recours sans les messages de la personne.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const getAppeal = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@qoe/sdk/actions/admin', () => ({
  getAbuseAppealAction: (input: { appealId: string }) => getAppeal(input),
  decideAbuseAppealAction: async () => ({ ok: true }),
}));
vi.mock('@qoe/ui/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AppealsQueue } from '../components/appeals-queue';
import type { AbuseAppealItem } from '@/lib/admin-data';

const appeal: AbuseAppealItem = {
  id: 'app_12345678',
  subjectType: 'user',
  subjectId: 'usr_12345678',
  openedBy: 'usr_87654321',
  status: 'open',
  outcome: null,
  staffNote: '',
  decidedBy: null,
  decisionId: '',
  decidedAt: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  messages: [],
};

describe('AppealsQueue — lecture du détail', () => {
  afterEach(() => {
    cleanup();
    getAppeal.mockReset();
  });

  it('dit que le détail n’a pas pu être lu', async () => {
    getAppeal.mockRejectedValue(new Error('Détail du recours indisponible'));

    render(<AppealsQueue initialItems={[appeal]} />);

    fireEvent.contextMenu(screen.getByText('user'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Aperçu du recours/ }));

    await waitFor(() => expect(getAppeal).toHaveBeenCalled());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Détail du recours indisponible');
  });
});
