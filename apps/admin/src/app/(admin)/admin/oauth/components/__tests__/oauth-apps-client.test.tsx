// @vitest-environment jsdom
// =====================================================================
// 🧪 OAuthAppsClient — un statut inconnu ne se lit pas « En attente »
// =====================================================================
// Le défaut mesuré (R166) : `STATUS_META[c.status] ?? STATUS_META.PENDING`
// affichait « En attente » pour toute valeur hors du jeu fermé du Go, et les
// boutons d'approbation restaient offerts pour une demande en attente.
// =====================================================================

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@qoe/sdk/actions/admin', () => ({
  updateOAuthClientStatusAction: vi.fn(),
}));

vi.mock('@qoe/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/authz-feedback', () => ({
  attemptWithStepUp: (run: () => Promise<unknown>) => run(),
  notifyActionFailure: vi.fn(),
  readMessage: () => null,
}));

import { OAuthAppsClient, type OAuthClientAdmin } from '../oauth-apps-client';

function client(overrides: Partial<OAuthClientAdmin> = {}): OAuthClientAdmin {
  return {
    id: 'oac_1',
    clientId: 'client_abc',
    name: 'Application test',
    description: null,
    logoUrl: null,
    homepageUrl: null,
    redirectUris: ['https://example.test/callback'],
    scopes: ['profile'],
    clientType: 'PUBLIC',
    status: 'PENDING',
    ownerName: 'Ada',
    ownerEmail: 'ada@example.test',
    ownerUsername: 'ada',
    createdAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('OAuthAppsClient — statuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche « En attente » et les deux décisions pour une demande réelle', () => {
    render(<OAuthAppsClient initialClients={[client()]} />);

    // « En attente » est aussi le libellé d'un filtre : on lit la ligne.
    const row = within(screen.getByRole('row', { name: /Application test/ }));
    expect(row.getByText('En attente')).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Approuver' })).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Rejeter' })).toBeInTheDocument();
  });

  it('dit « Statut inconnu » et n’offre aucune décision sur une valeur hors jeu', () => {
    render(<OAuthAppsClient initialClients={[client({ status: 'SUSPENDED' })]} />);

    const row = within(screen.getByRole('row', { name: /Application test/ }));
    expect(row.getByText('Statut inconnu')).toBeInTheDocument();
    expect(row.queryByText('En attente')).toBeNull();
    expect(row.queryByRole('button', { name: 'Approuver' })).toBeNull();
    expect(row.queryByRole('button', { name: 'Rejeter' })).toBeNull();
    expect(row.getByText('Aucune action avant vérification du statut')).toBeInTheDocument();
  });
});
