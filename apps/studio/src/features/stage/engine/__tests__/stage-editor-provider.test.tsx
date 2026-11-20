// @vitest-environment jsdom
// =====================================================================
// L21b — StageEditorProvider : clear différé et double montage StrictMode
// =====================================================================
// Le cleanup d'effet programmait `engine.clear()` à t+0 sans jamais annuler ce
// timer. Sous StrictMode (dev), React démonte puis remonte le même effet : le
// timer du premier démontage s'exécutait donc APRÈS le remontage et effaçait
// sélection, rects et historique du moteur vivant — au démarrage de l'éditeur.
// Le clear doit rester différé (pour le démontage réel) mais annulable.
// =====================================================================

import React, { StrictMode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StageEditorProvider, useStageEditorEngine } from '../index';

let engine: ReturnType<typeof useStageEditorEngine>;

function Probe() {
  const e = useStageEditorEngine();
  engine = e;
  React.useEffect(() => {
    e.frames.select('bloc-1');
  }, [e]);
  return null;
}

function mountStrict() {
  return render(
    <StrictMode>
      <StageEditorProvider>
        <Probe />
      </StageEditorProvider>
    </StrictMode>
  );
}

afterEach(() => cleanup());

describe('StageEditorProvider', () => {
  it('garde le moteur du montage vivant après le double montage StrictMode', async () => {
    mountStrict();
    expect(engine.frames.selected).toEqual(['bloc-1']);

    // Laisse passer le timer de clear programmé par le premier démontage.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(engine.frames.selected).toEqual(['bloc-1']);
  });

  it('nettoie quand même le moteur au démontage réel', async () => {
    const { unmount } = mountStrict();
    unmount();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(engine.frames.selected).toEqual([]);
  });
});
