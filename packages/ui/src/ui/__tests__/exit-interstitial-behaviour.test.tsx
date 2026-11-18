// @vitest-environment jsdom
// =====================================================================
// 🧭 Interstitiel de sortie — ce qu'il ne doit PAS faire
// =====================================================================
// 📖 Deux comportements silencieusement faux ont été verrouillés ici :
//    1. le repli sans provider ouvrait n'importe quel schéma
//       (`javascript:`, `data:`) — `window.open` accepte tout ;
//    2. l'intercepteur consommait aussi les clics modifiés (Cmd/Ctrl/Shift),
//       donc « ouvrir dans un nouvel onglet » devenait un dialogue.
// =====================================================================

import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  ExternalLinkInterceptor,
  ExitInterstitialProvider,
  useExitInterstitial,
} from '../exit-interstitial';

afterEach(() => vi.restoreAllMocks());

function WithoutProvider() {
  const { openExitWarning } = useExitInterstitial();
  return (
    <>
      <button onClick={() => openExitWarning('javascript:alert(1)')}>dangereux</button>
      <button onClick={() => openExitWarning('https://example.com/x')}>valide</button>
    </>
  );
}

describe('useExitInterstitial hors provider', () => {
  it('n’ouvre jamais un schéma refusé', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WithoutProvider />);

    fireEvent.click(screen.getByText('dangereux'));

    expect(open).not.toHaveBeenCalled();
  });

  it('ouvre un lien externe valide, sans opener ni referrer', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WithoutProvider />);

    fireEvent.click(screen.getByText('valide'));

    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener,noreferrer');
  });
});

describe('ExternalLinkInterceptor', () => {
  function renderInterceptor() {
    return render(
      <ExitInterstitialProvider sourceName="Le Carnet">
        <ExternalLinkInterceptor sourceName="Le Carnet">
          <a href="https://example.com/ailleurs">lien externe</a>
        </ExternalLinkInterceptor>
      </ExitInterstitialProvider>
    );
  }

  it('intercepte un clic gauche simple et propose le dialogue', () => {
    renderInterceptor();
    const link = screen.getByText('lien externe');

    const notCancelled = fireEvent.click(link);

    expect(notCancelled).toBe(false); // preventDefault posé
    expect(screen.getByText('Ouvrir example.com ?')).toBeTruthy();
  });

  it('laisse un clic modifié au navigateur (nouvel onglet)', () => {
    renderInterceptor();
    const link = screen.getByText('lien externe');

    const notCancelled = fireEvent.click(link, { metaKey: true });

    expect(notCancelled).toBe(true); // aucun preventDefault
    expect(screen.queryByText('Ouvrir example.com ?')).toBeNull();
  });

  it('ignore les liens internes et les ancres', () => {
    render(
      <ExternalLinkInterceptor>
        <a href="/interne">interne</a>
      </ExternalLinkInterceptor>
    );
    const link = screen.getByText('interne');

    const notCancelled = fireEvent.click(link);

    expect(notCancelled).toBe(true);
  });
});
