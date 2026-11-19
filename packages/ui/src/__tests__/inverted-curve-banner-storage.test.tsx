// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { InvertedCurveBanner } from '../notifications/InvertedCurveBanner';

describe('InvertedCurveBanner — stockage indisponible', () => {
  it('affiche l’annonce quand localStorage lève à la lecture', () => {
    // F138 — `localStorage.getItem` était appelé hors try/catch : en navigation
    // privée (Safari) l'accès lève une SecurityError et l'effet casse le rendu
    // de tout l'écran, alors que l'écriture était déjà protégée.
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: localStorage is disabled');
      },
    });

    expect(() =>
      render(<InvertedCurveBanner id="ann_prive" message="Annonce protégée" type="info" />)
    ).not.toThrow();
    expect(screen.getByText('Annonce protégée')).not.toBeNull();
  });
});
