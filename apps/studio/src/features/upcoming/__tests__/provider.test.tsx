// @vitest-environment jsdom
// =====================================================================
// 🧪 FeatureAnnouncements — aucun rejet non capturé
// =====================================================================
// Le provider est monté une fois par le layout : un rejet qui s'échappe
// (`onSignal` d'une action serveur qui lève, repli `getFeatureNotifiedAction`
// dans un `.catch`) devient une erreur non gérée côté navigateur. Le contrat
// de l'écran est explicite : « un échec réseau ne doit pas masquer les CTA ».
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { FeatureKey, FeatureSignal } from '@qoe/ui';

const captured = vi.hoisted(() => ({
  props: null as null | {
    onSignal?: (signal: FeatureSignal) => void | Promise<void>;
  },
}));

vi.mock('@qoe/ui', () => ({
  isFeatureKey: (value: string): value is FeatureKey => typeof value === 'string',
  FeatureAnnouncementProvider: (props: { children: unknown }) => {
    captured.props = props as typeof captured.props;
    return props.children;
  },
}));

const actions = vi.hoisted(() => ({
  getFeatureCatalogAction: vi.fn(),
  getFeatureNotifiedAction: vi.fn(),
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
  process.on('unhandledRejection', onUnhandled);
  captured.props = null;
});

afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
  cleanup();
});

describe('FeatureAnnouncements', () => {
  it('avale l’échec d’un signal : le bouton gère son propre état', async () => {
    actions.getFeatureCatalogAction.mockResolvedValue([]);
    actions.getFeatureNotifiedAction.mockResolvedValue([]);
    actions.recordFeatureSignalAction.mockRejectedValue(new Error('Non autorisé'));

    render(
      <FeatureAnnouncements locale="fr">
        <span>contenu</span>
      </FeatureAnnouncements>
    );

    await waitFor(() => expect(captured.props?.onSignal).toBeTypeOf('function'));
    await expect(
      captured.props!.onSignal!({ feature: 'analytics-v2' as FeatureKey, kind: 'view' })
    ).resolves.toBeUndefined();
  });

  it('ne laisse pas filer le rejet du repli « déjà demandé »', async () => {
    actions.getFeatureCatalogAction.mockRejectedValue(new Error('catalogue indisponible'));
    actions.getFeatureNotifiedAction.mockRejectedValue(new Error('compte indisponible'));

    render(
      <FeatureAnnouncements locale="fr">
        <span>contenu</span>
      </FeatureAnnouncements>
    );

    await waitFor(() => expect(actions.getFeatureNotifiedAction).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(unhandled).toEqual([]);
  });
});
