// @vitest-environment jsdom
// =====================================================================
// 🧪 Incidents — une mesure saisie ne part pas sur un autre dossier
// =====================================================================
// `measure` est un état partagé par la liste. Ouverte sur le dossier A, la
// zone « Nouvelle mesure » y restait remplie quand on dépliait B : cliquer
// « Résoudre » sur B consignait la mesure de A dans l'historique de B — une
// mesure d'incident attribuée au mauvais dossier, dans un registre d'audit.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const updateIncident = vi.fn(async (_input: { incidentId?: string; measure?: string }) => ({
  ok: true,
}));
const openIncident = vi.fn(async (_input: unknown) => ({ ok: true }));

vi.mock('@qoe/sdk/actions/admin', () => ({
  updateAbuseIncidentAction: (input: { incidentId?: string; measure?: string }) =>
    updateIncident(input),
  openAbuseIncidentAction: (input: unknown) => openIncident(input),
}));
vi.mock('@qoe/ui/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { IncidentsQueue } from '../components/incidents-queue';
import type { AbuseIncidentItem } from '@/lib/admin-data';

const incident = (id: string, title: string): AbuseIncidentItem => ({
  id,
  title,
  kind: 'other',
  status: 'open' as AbuseIncidentItem['status'],
  scope: '',
  impact: '',
  measures: '',
  openedBy: 'staff-1',
  resolvedBy: null,
  resolvedAt: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
});

describe('IncidentsQueue — mesure par dossier', () => {
  afterEach(() => {
    cleanup();
    updateIncident.mockClear();
  });

  it('ne reporte pas la mesure du dossier A sur le dossier B', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: vi.fn() },
    });

    render(
      <IncidentsQueue
        initialItems={[incident('a', 'Ferme A'), incident('b', 'Raid B')]}
        metrics={null}
      />
    );

    const mesures = screen.getAllByRole('button', { name: 'Mesures' });
    fireEvent.click(mesures[0]);
    fireEvent.change(screen.getByLabelText('Nouvelle mesure'), {
      target: { value: 'blocage du sous-réseau A' },
    });

    // On déplie le second dossier : la zone de saisie doit repartir vide.
    // (Le dossier A affiche désormais « Refermer » : il ne reste qu'un « Mesures ».)
    fireEvent.click(screen.getByRole('button', { name: 'Mesures' }));
    expect((screen.getByLabelText('Nouvelle mesure') as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getAllByRole('button', { name: 'Résoudre' })[1]!);
    await waitFor(() => expect(updateIncident).toHaveBeenCalled());
    expect(updateIncident.mock.calls[0]?.[0]).toMatchObject({ incidentId: 'b', measure: '' });
  });
});
