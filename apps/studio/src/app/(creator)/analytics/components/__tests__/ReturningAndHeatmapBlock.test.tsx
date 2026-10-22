import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReturningAndHeatmapBlock } from '../ReturningAndHeatmapBlock';

describe('ReturningAndHeatmapBlock', () => {
  it('ne casse pas sur un payload partiel (publication sans Umami)', () => {
    // Régression : le backend renvoyait `{}` et le composant lisait
    // `returningVisitors` sans garde → page analytics entière en erreur.
    render(
      <ReturningAndHeatmapBlock
        // @ts-expect-error — on reproduit volontairement un contrat incomplet.
        insights={{ returning: {}, hours: [] }}
      />
    );

    expect(screen.getByText('0 visiteurs').textContent).toBeTruthy();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('accepte des insights totalement vides', () => {
    render(
      <ReturningAndHeatmapBlock
        // @ts-expect-error — champs absents (dégradation d'API).
        insights={{}}
      />
    );
    expect(screen.getByText('0 visiteurs').textContent).toBeTruthy();
  });

  it('affiche la répartition quand la donnée est complète', () => {
    render(
      <ReturningAndHeatmapBlock
        insights={{
          returning: { total: 10, newVisitors: 6, returningVisitors: 4 },
          hours: [{ hour: 9, visits: 12 }],
        }}
      />
    );
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('10 visiteurs').textContent).toBeTruthy();
  });
});
