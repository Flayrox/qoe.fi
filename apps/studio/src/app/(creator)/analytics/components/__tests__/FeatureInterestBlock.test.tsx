import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureAnnouncementProvider } from '@qoe/ui';
import { FeatureInterestBlock } from '../FeatureInterestBlock';

function renderBlock(signals: Parameters<typeof FeatureInterestBlock>[0]['signals']) {
  return render(
    <FeatureAnnouncementProvider locale="fr">
      <FeatureInterestBlock signals={signals} />
    </FeatureAnnouncementProvider>
  );
}

describe('FeatureInterestBlock', () => {
  it('affiche un état vide honnête plutôt qu’un bloc vide', () => {
    renderBlock([]);
    expect(screen.getByText('Fonctionnalités à venir').textContent).toBeTruthy();
    expect(screen.getByText(/aucune fonctionnalité à venir consultée/i).textContent).toBeTruthy();
  });

  it('résume les vues et les demandes par fonctionnalité du catalogue', () => {
    renderBlock([
      { feature: 'custom-domain', views: 12, notifies: 3 },
      { feature: 'email-customization', views: 4, notifies: 1 },
    ]);

    expect(screen.getByText('Domaine personnalisé').textContent).toBeTruthy();
    expect(screen.getByText('12 vues').textContent).toBeTruthy();
    expect(screen.getByText('3 demandes').textContent).toBeTruthy();
    expect(screen.getByText('Personnalisation des emails').textContent).toBeTruthy();
  });

  it('n’explose pas sur une clé retirée du registre', () => {
    renderBlock([{ feature: 'ancienne-fonctionnalite', views: 2, notifies: 0 }]);
    expect(screen.getByText('ancienne-fonctionnalite').textContent).toBeTruthy();
  });
});
