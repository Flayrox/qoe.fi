// @vitest-environment jsdom
// =====================================================================
// 🧪 FeatureAnnouncements (lecteur) — aucun rejet non capturé
// =====================================================================
// Le provider est monté une fois pour tout le lecteur. Deux rejets y
// échappaient : `onSignal` (l'action serveur lève pour un lecteur non
// connecté qui clique « me prévenir », et pour toute panne sur un `notify`)
// et le repli du catalogue. Le contrat de l'écran est explicite : un échec
// réseau ne masque pas les CTA et ne remonte pas en erreur non gérée.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { FeatureKey, FeatureSignal } from '@qoe/ui';

const captured = vi.hoisted(() => ({
  props: null as null | {
    onSignal?: (signal: FeatureSignal) => void | Promise<void>;
    notifyEnabledFeatures?: ReadonlySet<FeatureKey>;
  },
}));

vi.mock('@qoe/ui', () => ({
  // Le catalogue du produit est fermé : une clé inconnue n'ouvre aucun CTA.
  isFeatureKey: (value: string): value is FeatureKey => value === 'analytics-v2',
  FeatureAnnouncementProvider: (props: { children: unknown }) => {
    captured.props = props as typeof captured.props;
    return props.children;
  },
}));

const actions = vi.hoisted(() => ({
  getFeatureCatalogAction: vi.fn(),
  recordFeatureSignalAction: vi.fn(),
}));
vi.mock('../actions', () => actions);

import { FeatureAnnouncements } from '../provider';

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

beforeEach(() => {
  vi.clearAllMocks();
  unhandled.length = 0;
  captured.props = null;
  process.on('unhandledRejection', onUnhandled);
});

afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
  cleanup();
});

describe('FeatureAnnouncements', () => {
  it('avale l’échec d’un signal : le bouton affiche son propre état', async () => {
    actions.getFeatureCatalogAction.mockResolvedValue([]);
    actions.recordFeatureSignalAction.mockRejectedValue(
      new Error('Veuillez vous connecter pour être prévenu.')
    );

    render(
      <FeatureAnnouncements locale="fr">
        <span>contenu</span>
      </FeatureAnnouncements>
    );

    await waitFor(() => expect(captured.props?.onSignal).toBeTypeOf('function'));
    await expect(
      captured.props!.onSignal!({ feature: 'analytics-v2' as FeatureKey, kind: 'notify' })
    ).resolves.toBeUndefined();
    expect(unhandled).toEqual([]);
  });

  it('ne laisse pas filer le rejet du catalogue', async () => {
    actions.getFeatureCatalogAction.mockRejectedValue(new Error('panne API'));

    render(
      <FeatureAnnouncements locale="fr">
        <span>contenu</span>
      </FeatureAnnouncements>
    );

    await waitFor(() => expect(actions.getFeatureCatalogAction).toHaveBeenCalled());
    await waitFor(() => expect(unhandled).toEqual([]));
  });

  it('ne transmet que les clés connues du catalogue', async () => {
    actions.getFeatureCatalogAction.mockResolvedValue([
      { key: 'analytics-v2', status: 'planned', notifyEnabled: true, notified: false },
      { key: 'inconnue', status: 'planned', notifyEnabled: true, notified: true },
    ]);

    render(
      <FeatureAnnouncements locale="fr">
        <span>contenu</span>
      </FeatureAnnouncements>
    );

    await waitFor(() => expect(captured.props?.notifyEnabledFeatures).toBeDefined());
    expect([...captured.props!.notifyEnabledFeatures!]).toEqual(['analytics-v2']);
  });
});
