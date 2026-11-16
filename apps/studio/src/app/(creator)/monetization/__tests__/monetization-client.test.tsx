import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { createCreatorTierAction, openBillingPortalAction } from '@qoe/sdk';
import type { BillingTier } from '@qoe/sdk';

import { MonetizationClient } from '../monetization-client';

// Les macros Lingui sont compilées au build : en test on rend le message brut.
vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (Array.isArray(strings)) {
      return strings.reduce(
        (res, str, i) => res + str + (values[i] !== undefined ? String(values[i]) : ''),
        ''
      );
    }
    return String(strings || '');
  },
}));

vi.mock('@qoe/sdk', () => ({
  createCreatorTierAction: vi.fn(),
  openBillingPortalAction: vi.fn(),
}));

const createTier = vi.mocked(createCreatorTierAction);
const openPortal = vi.mocked(openBillingPortalAction);

const TIER: BillingTier = {
  id: 'tier_1',
  name: 'Membre Premium',
  description: 'Accès aux archives.',
  monthlyPriceCents: 500,
  stripePriceIdMonthly: 'price_1Pabc',
} as BillingTier;

function renderClient(tiers: BillingTier[] = []) {
  return render(<MonetizationClient publisherId="pub_1" initialTiers={tiers} />);
}

describe('MonetizationClient — portail de facturation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explique l’indisponibilité au lieu de laisser un écran vide (aucun Stripe côté serveur)', async () => {
    openPortal.mockResolvedValue({
      ok: false,
      error: { code: 'BILLING_UNAVAILABLE', message: 'Stripe non configuré' },
    } as never);

    renderClient();
    fireEvent.click(screen.getByRole('button', { name: 'Portail de facturation' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Portail indisponible pour le moment.');
  });

  it('distingue l’absence d’abonnement Stripe d’une panne', async () => {
    openPortal.mockResolvedValue({
      ok: false,
      error: { code: 'NO_CUSTOMER', message: 'aucun client' },
    } as never);

    renderClient();
    fireEvent.click(screen.getByRole('button', { name: 'Portail de facturation' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Aucun abonnement Stripe sur ce compte pour l’instant.');
    expect(screen.queryByText('Portail indisponible pour le moment.')).toBeNull();
  });
});

describe('MonetizationClient — création de formule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuse un prix nul sans appeler le backend', async () => {
    renderClient();
    fireEvent.change(screen.getByPlaceholderText('Membre Premium'), {
      target: { value: 'Membre Premium' },
    });
    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '0' } });

    fireEvent.click(screen.getByRole('button', { name: 'Créer la formule' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Un nom et un prix mensuel positif sont requis.');
    expect(createTier).not.toHaveBeenCalled();
  });

  it('refuse un nom vide sans appeler le backend', async () => {
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: 'Créer la formule' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Un nom et un prix mensuel positif sont requis.'
    );
    expect(createTier).not.toHaveBeenCalled();
  });

  it('convertit les euros en centimes et ajoute la formule à la liste', async () => {
    createTier.mockResolvedValue({ ok: true, data: TIER } as never);

    renderClient();
    fireEvent.change(screen.getByPlaceholderText('Membre Premium'), {
      target: { value: 'Membre Premium' },
    });
    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '4,50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Créer la formule' }));

    await waitFor(() => expect(screen.getByText('Formule créée.')).toBeDefined());
    expect(createTier).toHaveBeenCalledWith(
      expect.objectContaining({ publisherId: 'pub_1', monthlyPriceCents: 450 })
    );
    expect(screen.getByText('Membre Premium')).toBeDefined();
    expect(screen.getByText('Payable')).toBeDefined();
  });

  it('affiche l’erreur du backend sans perdre la saisie', async () => {
    createTier.mockResolvedValue({
      ok: false,
      error: { code: 'PRICE_MISMATCH', message: 'Le tarif Stripe ne correspond pas au montant.' },
    } as never);

    renderClient();
    fireEvent.change(screen.getByPlaceholderText('Membre Premium'), {
      target: { value: 'Premium annuel' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer la formule' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Le tarif Stripe ne correspond pas au montant.');
    expect(screen.getByDisplayValue('Premium annuel')).toBeDefined();
  });
});

describe('MonetizationClient — catalogue', () => {
  it('signale une formule non payable quand le tarif Stripe manque', () => {
    renderClient([{ ...TIER, stripePriceIdMonthly: '' } as BillingTier]);

    expect(screen.getByText('Tarif Stripe manquant')).toBeDefined();
    expect(screen.queryByText('Payable')).toBeNull();
  });
});
