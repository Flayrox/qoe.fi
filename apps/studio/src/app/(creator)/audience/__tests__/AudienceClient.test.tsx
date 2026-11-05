import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AudienceClient, type SubscriberItem } from '../AudienceClient';

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (Array.isArray(strings)) {
      return strings.reduce(
        (res, str, i) => res + str + (values[i] !== undefined ? values[i] : ''),
        ''
      );
    }
    return String(strings || '');
  },
}));

const mockSubscribers: SubscriberItem[] = [
  {
    id: 'sub-1',
    email: 'alice@example.com',
    isActive: true,
    isPremium: true,
    ltvCents: 4500,
    createdAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'sub-2',
    email: 'bob@example.com',
    isActive: true,
    isPremium: false,
    ltvCents: 0,
    createdAt: '2026-02-20T14:30:00Z',
  },
  {
    id: 'sub-3',
    email: 'claire@example.com',
    isActive: false,
    isPremium: false,
    ltvCents: 1200,
    createdAt: '2025-11-05T09:15:00Z',
  },
];

describe('AudienceClient', () => {
  it('affiche les indicateurs KPI et le nombre total d abonnés', () => {
    render(<AudienceClient initialSubscribers={mockSubscribers} />);

    // Total Abonnés = 3
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    // Premium = 1
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    // LTV cumule = (4500 + 0 + 1200) / 100 = 57.00 €
    expect(screen.getByText('57.00 €')).toBeDefined();
  });

  it('affiche la liste des abonnés avec les badges et données', () => {
    render(<AudienceClient initialSubscribers={mockSubscribers} />);

    expect(screen.getByText('alice@example.com')).toBeDefined();
    expect(screen.getByText('bob@example.com')).toBeDefined();
    expect(screen.getByText('claire@example.com')).toBeDefined();

    // Badges Actif / Inactif
    expect(screen.getAllByText('Actif').length).toBe(2);
    expect(screen.getAllByText('Inactif').length).toBe(1);

    // Badges Premium / Gratuit
    expect(screen.getAllByText('Premium').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gratuit').length).toBeGreaterThan(0);
  });

  it('permet de filtrer par recherche texte', () => {
    render(<AudienceClient initialSubscribers={mockSubscribers} />);

    const searchInput = screen.getByPlaceholderText('Rechercher par adresse email...');
    fireEvent.change(searchInput, { target: { value: 'alice' } });

    expect(screen.getByText('alice@example.com')).toBeDefined();
    expect(screen.queryByText('bob@example.com')).toBeNull();
    expect(screen.queryByText('claire@example.com')).toBeNull();
  });

  it('affiche un message quand aucun abonné ne correspond', () => {
    render(<AudienceClient initialSubscribers={mockSubscribers} />);

    const searchInput = screen.getByPlaceholderText('Rechercher par adresse email...');
    fireEvent.change(searchInput, { target: { value: 'inconnu@domain.com' } });

    expect(screen.getByText('Aucun abonné trouvé')).toBeDefined();
    expect(screen.getByText('Aucun abonné ne correspond à votre recherche.')).toBeDefined();
  });
});
