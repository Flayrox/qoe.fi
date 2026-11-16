// =====================================================================
// 🧪 OfferCompare — comparatif Gratuit / Pro
// =====================================================================
// Deux promesses produit à ne pas casser : le gratuit reste complet, et rien
// n'est « vendu » tant que le paiement n'existe pas (pas de faux bouton
// d'achat, pas de waitlist sans stockage). Ce test verrouille les deux.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OfferCompare } from '../offer-compare';

const SUPPORT_URL = 'https://qoe.fi/support';

describe('OfferCompare', () => {
  it('présente les deux offres et le statut du Pro', () => {
    render(<OfferCompare supportUrl={SUPPORT_URL} />);

    expect(screen.getAllByText('Gratuit').length).toBeGreaterThan(0);
    expect(screen.getByText(/0 €/)).toBeDefined();
    expect(screen.getAllByText(/Bientôt/).length).toBeGreaterThan(0);
    expect(screen.getByText(/lancement prochain/)).toBeDefined();
  });

  it('renvoie vers le support au lieu d’un faux achat', () => {
    render(<OfferCompare supportUrl={SUPPORT_URL} />);

    const link = screen.getByRole('link', { name: /Être tenu au courant/i });
    expect(link.getAttribute('href')).toBe(SUPPORT_URL);

    // Aucun chemin de paiement ne doit apparaître avant Stripe.
    expect(screen.queryByRole('link', { name: /acheter/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /acheter|s’abonner|s'abonner/i })).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/checkout|stripe/i);
  });

  it('classe chaque ligne : inclus, Pro, ou bientôt', () => {
    render(<OfferCompare supportUrl={SUPPORT_URL} />);

    const rows = [
      'Publier textes, newsletters, collections',
      'Abonnés, audience, imports validés',
      'API & webhooks développeur',
      'Personnalisation des e-mails',
      'Domaine personnalisé + DKIM/SPF/DMARC',
      'Statistiques avancées',
    ];

    for (const label of rows) {
      expect(screen.getByText(label)).toBeDefined();
    }

    // Les quatre lignes gratuites sont marquées « Inclus » côté Gratuit.
    expect(screen.getAllByText('Inclus')).toHaveLength(4);
    // Le domaine et les statistiques sont annoncés, jamais facturés.
    expect(screen.getAllByText('Bientôt').length).toBeGreaterThanOrEqual(2);
  });

  it('rappelle ce qui reste gratuit pour toujours', () => {
    render(<OfferCompare supportUrl={SUPPORT_URL} />);

    expect(screen.getByText(/Ce qui crée le réseau reste gratuit/i)).toBeDefined();
    expect(screen.getByText(/ne passeront jamais en payant/i)).toBeDefined();
  });
});
