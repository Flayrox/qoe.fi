// @vitest-environment jsdom
// =====================================================================
// 🧪 ReaderToolbarProvider — un handler de signet qui rejette (R126)
// =====================================================================
// `toggleBookmark` appelait le handler enregistré par
// `registerToggleBookmark` sans l'attendre ni attraper son rejet : un handler
// `async` en échec devenait une promesse non gérée, silencieuse. La garantie
// est double : aucun rejet non géré, et l'échec est rapporté explicitement.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ReaderToolbarProvider, useReaderToolbar } from '../ReaderToolbarContext';

function Probe({ handler }: { handler: () => Promise<void> }) {
  const toolbar = useReaderToolbar();
  React.useEffect(() => {
    toolbar?.registerToggleBookmark(handler);
  }, [toolbar, handler]);
  return (
    <button type="button" onClick={() => toolbar?.toggleBookmark()}>
      signet
    </button>
  );
}

afterEach(() => cleanup());

describe('ReaderToolbarProvider — bascule de signet', () => {
  it('rapporte un handler qui rejette au lieu de laisser une promesse non gérée', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);

    render(
      <ReaderToolbarProvider>
        <Probe
          handler={async () => {
            throw new Error('signet refusé');
          }}
        />
      </ReaderToolbarProvider>
    );

    fireEvent.click(screen.getByText('signet'));
    // Laisse la microtâche de la promesse rejetée se propager.
    await new Promise((resolve) => setTimeout(resolve, 20));

    process.off('unhandledRejection', onUnhandled);
    const reported = consoleError.mock.calls.flat().join(' ');
    consoleError.mockRestore();

    expect(unhandled).toHaveLength(0);
    expect(reported).toContain('signet refusé');
  });
});
