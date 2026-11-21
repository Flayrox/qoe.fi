// @vitest-environment jsdom
// =====================================================================
// 🧪 Step-up — une panne de lecture des facteurs n'est pas « aucun facteur »
// =====================================================================
// La liste des facteurs pouvait échouer (session expirée, variables Supabase
// absentes, réseau). Le `catch` retombait sur `{ totp: [], hasUnverified: false }`
// et l'écran affirmait « Aucun facteur fort compatible n'est enregistré sur ce
// compte » : une affirmation fausse sur la sécurité du compte, et un parcours
// d'enrôlement qui échouera lui aussi.
// =====================================================================

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    throw new Error('SUPABASE_URL manquante');
  },
}));
vi.mock('@qoe/ui/security', () => ({ sanitizeInlineSvg: () => null }));

import { StepUpGate, requestStepUp } from '../step-up';

describe('StepUpGate — lecture des facteurs en échec', () => {
  afterEach(cleanup);

  it('dit la panne au lieu d’affirmer qu’aucun facteur n’existe', async () => {
    render(<StepUpGate />);
    act(() => {
      void requestStepUp('Acte sensible');
    });

    expect(await screen.findByText(/SUPABASE_URL manquante/)).toBeTruthy();
    expect(screen.getByText(/Aucun facteur fort compatible/)).toBeTruthy();
    expect(screen.queryByTestId('step-up-enroll')).not.toBeNull();
  });
});
