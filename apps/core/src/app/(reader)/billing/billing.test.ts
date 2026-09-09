import { describe, it, expect } from 'vitest';
import {
  formatBalanceCents,
  formatTransactionAmount,
  filterBillingTransactions,
  calculateBillingKPIs,
  formatTransactionDate,
  type BillingTransaction,
  type BillingData,
} from './billing-helpers';

describe('Billing Helpers (Portefeuille & Abonnements 2026)', () => {
  describe('formatBalanceCents', () => {
    it('formate correctement les centimes en euros', () => {
      expect(formatBalanceCents(4250)).toBe('42.50');
      expect(formatBalanceCents(100)).toBe('1.00');
      expect(formatBalanceCents(99)).toBe('0.99');
      expect(formatBalanceCents(0)).toBe('0.00');
    });

    it('gère les valeurs négatives', () => {
      expect(formatBalanceCents(-1500)).toBe('-15.00');
    });

    it('gère les valeurs invalides, nulles ou non numériques', () => {
      expect(formatBalanceCents(null)).toBe('0.00');
      expect(formatBalanceCents(undefined)).toBe('0.00');
      expect(formatBalanceCents(NaN)).toBe('0.00');
    });
  });

  describe('formatTransactionAmount', () => {
    it('formate un montant positif (crédit) avec le signe +', () => {
      const res = formatTransactionAmount(1500);
      expect(res.formatted).toBe('+15.00 €');
      expect(res.isCredit).toBe(true);
      expect(res.sign).toBe('+');
      expect(res.euros).toBe(15);
    });

    it('formate un montant négatif (débit) sans signe positif supplémentaire', () => {
      const res = formatTransactionAmount(-499);
      expect(res.formatted).toBe('-4.99 €');
      expect(res.isCredit).toBe(false);
      expect(res.sign).toBe('');
      expect(res.euros).toBe(-4.99);
    });

    it('formate un montant nul comme non-crédit', () => {
      const res = formatTransactionAmount(0);
      expect(res.formatted).toBe('0.00 €');
      expect(res.isCredit).toBe(false);
      expect(res.sign).toBe('');
      expect(res.euros).toBe(0);
    });
  });

  describe('filterBillingTransactions', () => {
    const mockTransactions: BillingTransaction[] = [
      {
        id: 't1',
        type: 'Rechargement Stripe',
        amountCents: 2000,
        createdAt: '2026-03-01T10:00:00Z',
      },
      { id: 't2', type: 'Abonnement Philo', amountCents: -500, createdAt: '2026-03-02T12:00:00Z' },
      {
        id: 't3',
        type: 'Pourboire créateur',
        amountCents: -200,
        createdAt: '2026-03-03T15:00:00Z',
      },
      { id: 't4', type: 'Bonus fidélité', amountCents: 500, createdAt: '2026-03-04T18:00:00Z' },
      { id: 't5', type: 'Régularisation', amountCents: 0, createdAt: '2026-03-05T09:00:00Z' },
    ];

    it('retourne toutes les transactions avec le filtre "all"', () => {
      const result = filterBillingTransactions(mockTransactions, 'all');
      expect(result).toHaveLength(5);
    });

    it('filtre uniquement les crédits (> 0) avec "credits"', () => {
      const result = filterBillingTransactions(mockTransactions, 'credits');
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.id)).toEqual(['t1', 't4']);
    });

    it('filtre uniquement les débits et montants nuls (<= 0) avec "debits"', () => {
      const result = filterBillingTransactions(mockTransactions, 'debits');
      expect(result).toHaveLength(3);
      expect(result.map((t) => t.id)).toEqual(['t2', 't3', 't5']);
    });

    it('gère les tableaux non définis ou non valides', () => {
      expect(filterBillingTransactions([] as unknown as BillingTransaction[], 'all')).toEqual([]);
      expect(filterBillingTransactions(null as unknown as BillingTransaction[], 'credits')).toEqual(
        []
      );
    });
  });

  describe('calculateBillingKPIs', () => {
    it('calcule correctement les KPIs avec un jeu complet de données', () => {
      const data: BillingData = {
        walletBalanceCents: 4500,
        walletTransactions: [
          { id: '1', type: 'Recharge', amountCents: 5000, createdAt: '2026-03-01' },
          { id: '2', type: 'Sub', amountCents: -1000, createdAt: '2026-03-02' },
          { id: '3', type: 'Tip', amountCents: -500, createdAt: '2026-03-03' },
        ],
        subscriptions: [
          { id: 's1', publication: { name: 'Le Monde 2026', logoUrl: null, slug: 'lemonde' } },
          { id: 's2', publication: { name: 'Mediapart', logoUrl: null, slug: 'mediapart' } },
        ],
      };

      const kpis = calculateBillingKPIs(data);
      expect(kpis.totalTransactions).toBe(3);
      expect(kpis.creditsCount).toBe(1);
      expect(kpis.debitsCount).toBe(2);
      expect(kpis.balanceEuros).toBe('45.00');
      expect(kpis.activeSubscriptionsCount).toBe(2);
      expect(kpis.totalCreditsCents).toBe(5000);
      expect(kpis.totalDebitsCents).toBe(1500);
    });

    it('gère un objet vide ou null', () => {
      const kpis = calculateBillingKPIs(null);
      expect(kpis.totalTransactions).toBe(0);
      expect(kpis.creditsCount).toBe(0);
      expect(kpis.debitsCount).toBe(0);
      expect(kpis.balanceEuros).toBe('0.00');
      expect(kpis.activeSubscriptionsCount).toBe(0);
      expect(kpis.totalCreditsCents).toBe(0);
      expect(kpis.totalDebitsCents).toBe(0);
    });
  });

  describe('formatTransactionDate', () => {
    it('formate correctement une chaîne ISO en date française', () => {
      const formatted = formatTransactionDate('2026-03-09T14:30:00Z');
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('2026');
    });

    it('formate correctement un objet Date', () => {
      const d = new Date('2026-06-15T10:15:00Z');
      const formatted = formatTransactionDate(d);
      expect(formatted).toBeTruthy();
      expect(formatted).toContain('2026');
    });

    it('gère les entrées invalides de manière robuste sans lever d’exception', () => {
      expect(formatTransactionDate('invalid-date')).toBe('');
      expect(formatTransactionDate(NaN as unknown as Date)).toBe('');
    });
  });
});
