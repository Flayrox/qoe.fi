// @vitest-environment jsdom
// =====================================================================
// 🧪 SubscribersSignedExportPanel — un refus ne s'affiche pas en succès
// =====================================================================
// Rouge mesuré avant correctif : le message d'état unique (succès comme
// refus) était rendu avec l'icône ShieldCheck et la couleur `text-success`.
// Un export refusé par le garde se lisait donc comme un export scellé.
// =====================================================================

import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/security/step-up', () => ({ requestStepUp: vi.fn(async () => false) }));

import { SubscribersSignedExportPanel } from '../SubscribersSignedExportPanel';

describe('SubscribersSignedExportPanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Accès refusé : capacité requise.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    );
  });

  afterEach(() => cleanup());

  it('affiche un refus avec le ton d’erreur', async () => {
    render(<SubscribersSignedExportPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Télécharger le registre signé/ }));

    await waitFor(() => {
      const status = document.querySelector('[data-status-tone]');
      expect(status?.getAttribute('data-status-tone')).toBe('error');
    });
    expect(screen.getByText(/Accès refusé/)).toBeTruthy();
  });
});
