// =====================================================================
// 🧪 loadAudience — une panne analytics devient un état dit
// =====================================================================
// Le défaut mesuré (R147) : `audience/page.tsx` appelait Go sans capture,
// donc une panne du module analytics renvoyait une page en erreur. La lecture
// dégrade désormais en `{ subscribers: [], unavailable: true }` et l'écran dit
// pourquoi la liste est vide — un tableau vide sans explication ferait croire
// à zéro abonné.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const goFetch = vi.hoisted(() => vi.fn());

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch }));

import { loadAudience } from '../load-audience';
import { AudienceClient } from '../AudienceClient';

const SUBSCRIBER = {
  id: 'sub_1',
  email: 'lecteur@qoe.fi',
  isActive: true,
  isPremium: false,
  ltvCents: 0,
  createdAt: '2026-11-01T10:00:00.000Z',
};

describe('loadAudience', () => {
  beforeEach(() => {
    goFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rend les abonnés et marque la lecture disponible', async () => {
    goFetch.mockResolvedValue({ subscribers: [SUBSCRIBER] });

    const snapshot = await loadAudience('pub_1');

    expect(goFetch).toHaveBeenCalledWith('/v1/analytics/audience/subscribers?publisherId=pub_1');
    expect(snapshot).toEqual({
      subscribers: [SUBSCRIBER],
      unavailable: false,
    });
  });

  it('encode l’identifiant de publication', async () => {
    goFetch.mockResolvedValue({ subscribers: [] });

    await loadAudience('pub 1/2');

    expect(goFetch).toHaveBeenCalledWith(
      '/v1/analytics/audience/subscribers?publisherId=pub%201%2F2'
    );
  });

  it('dégrade au lieu de lever quand analytics ne répond pas', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    goFetch.mockRejectedValue(new Error('analytics indisponible'));

    await expect(loadAudience('pub_1')).resolves.toEqual({
      subscribers: [],
      unavailable: true,
    });
    expect(logged).toHaveBeenCalled();
  });

  it('accepte une réponse sans liste (champ absent) sans planter', async () => {
    goFetch.mockResolvedValue({});

    await expect(loadAudience('pub_1')).resolves.toEqual({
      subscribers: [],
      unavailable: false,
    });
  });
});

describe('AudienceClient — état indisponible', () => {
  it('explique une liste vide quand la lecture a échoué', () => {
    render(<AudienceClient initialSubscribers={[]} unavailable />);

    expect(
      screen.getByText('Statistiques d’audience momentanément indisponibles')
    ).toBeInTheDocument();
    expect(screen.getByText(/pas parce que vous n’avez aucun abonné/)).toBeInTheDocument();
  });

  it('ne montre aucun bandeau quand la lecture a réussi', () => {
    render(<AudienceClient initialSubscribers={[]} />);

    expect(screen.queryByText('Statistiques d’audience momentanément indisponibles')).toBeNull();
  });
});
