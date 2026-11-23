// @vitest-environment jsdom
// =====================================================================
// 🧪 ApiRequestsClient — la cellule de statut ne reste plus vide
// =====================================================================
// Le défaut mesuré (R166) : cinq comparaisons `===` sans repli. Un statut hors
// jeu n'affichait **aucune** pastille et l'écran proposait quand même
// « Activer l'accès API » sur une ligne dont il ne comprenait pas l'état.
// =====================================================================

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@qoe/sdk/actions/admin', () => ({
  updateCreatorApiAccessAction: vi.fn(),
  updateCreatorApiGrantsAction: vi.fn(),
}));

vi.mock('@qoe/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/authz-feedback', () => ({
  attemptWithStepUp: (run: () => Promise<void>) => run(),
  notifyActionFailure: vi.fn(),
  readMessage: () => null,
}));

import { ApiRequestsClient, type ApiApplicant } from '../api-requests-client';

function applicant(overrides: Partial<ApiApplicant> = {}): ApiApplicant {
  return {
    id: 'usr_1',
    name: 'Ada',
    email: 'ada@example.test',
    subdomain: 'ada',
    apiAccessStatus: 'pending',
    apiGrants: [],
    apiApplicationReason: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

const MODULES = [
  {
    key: 'api:read',
    label: 'Lecture',
    description: 'Articles publics',
    category: 'api',
    enabled: true,
  },
];

describe('ApiRequestsClient — statuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche la pastille et les décisions d’une demande en attente', () => {
    render(<ApiRequestsClient initialApplicants={[applicant()]} modules={MODULES} />);

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approuver' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeInTheDocument();
  });

  it('nomme un statut inconnu et n’offre aucune décision', () => {
    render(
      <ApiRequestsClient
        initialApplicants={[applicant({ apiAccessStatus: 'suspended' })]}
        modules={MODULES}
      />
    );

    expect(screen.getByText('Statut inconnu')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Activer l'accès API" })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approuver' })).toBeNull();
    expect(screen.getByText('Aucune action avant vérification du statut')).toBeInTheDocument();
  });
});
