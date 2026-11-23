// =====================================================================
// 🧪 Accès développeur — « indisponible » n'est pas « non demandé »
// =====================================================================
// Le défaut mesuré (R153) : `getDeveloperAccess` capturait l'échec de
// `GET /v1/users/me` et renvoyait `status: 'none'`. L'écran annonçait donc
// « Activez votre accès développeur » — un mensonge quand la lecture a échoué,
// et une invitation à redéposer un dossier qui existe peut-être déjà.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const goFetch = vi.hoisted(() => vi.fn());

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch }));

import { getDeveloperAccess } from '../server';
import { DeveloperAccessState } from '../components/developer-access-state';
import { DeveloperStatusBadge } from '../components/developer-status-badge';
import type { DeveloperAccess } from '../types';

const UNAVAILABLE: DeveloperAccess = {
  status: 'unavailable',
  grants: [],
  reason: null,
  updatedAt: null,
};

describe('getDeveloperAccess', () => {
  beforeEach(() => {
    goFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marque le statut indisponible quand l’API tombe', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    goFetch.mockRejectedValue(new Error('api down'));

    await expect(getDeveloperAccess()).resolves.toEqual(UNAVAILABLE);
  });

  it('lit toujours les dossiers réels quand l’API répond', async () => {
    goFetch.mockResolvedValue({
      data: { apiAccessStatus: 'approved', apiGrants: ['api:read'], updatedAt: '2026-11-01' },
    });

    await expect(getDeveloperAccess()).resolves.toEqual({
      status: 'approved',
      grants: ['api:read'],
      reason: null,
      updatedAt: '2026-11-01',
    });
  });
});

describe('écrans de l’accès développeur', () => {
  it('le badge dit « Indisponible », pas « Non demandé »', () => {
    render(<DeveloperStatusBadge status="unavailable" />);

    expect(screen.getByText('Indisponible')).toBeInTheDocument();
  });

  it('l’état explique l’échec de lecture et n’invite pas à redéposer un dossier', () => {
    render(<DeveloperAccessState access={UNAVAILABLE} />);

    expect(screen.getByText('Statut d’accès momentanément indisponible')).toBeInTheDocument();
    expect(screen.queryByText('Activez votre accès développeur')).toBeNull();
  });
});
