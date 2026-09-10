export interface BillingTransaction {
  id: string;
  type: string;
  amountCents: number;
  createdAt: string;
}

export interface BillingSubscription {
  id: string;
  publication: { name: string | null; logoUrl: string | null; slug: string } | null;
}

export interface BillingData {
  walletBalanceCents: number;
  walletTransactions: BillingTransaction[];
  subscriptions: BillingSubscription[];
}

import {
  formatBalanceCents,
  formatTransactionAmount,
  formatTransactionDate,
} from '@qoe/formatters';

export { formatBalanceCents, formatTransactionAmount, formatTransactionDate };

export type BillingTransactionFilter = 'all' | 'credits' | 'debits';

/**
 * Filtre les transactions selon le filtre sélectionné (toutes, crédits, débits).
 */
export function filterBillingTransactions(
  transactions: BillingTransaction[],
  filter: BillingTransactionFilter
): BillingTransaction[] {
  if (!Array.isArray(transactions)) return [];
  if (filter === 'credits') {
    return transactions.filter((t) => t.amountCents > 0);
  }
  if (filter === 'debits') {
    return transactions.filter((t) => t.amountCents <= 0);
  }
  return transactions;
}

/**
 * Calcule les indicateurs clés de performance (KPIs) pour le portefeuille.
 */
export function calculateBillingKPIs(billing?: Partial<BillingData> | null): {
  totalTransactions: number;
  creditsCount: number;
  debitsCount: number;
  balanceEuros: string;
  activeSubscriptionsCount: number;
  totalCreditsCents: number;
  totalDebitsCents: number;
} {
  const transactions = billing?.walletTransactions || [];
  const subscriptions = billing?.subscriptions || [];
  const balanceCents = billing?.walletBalanceCents ?? 0;

  let creditsCount = 0;
  let debitsCount = 0;
  let totalCreditsCents = 0;
  let totalDebitsCents = 0;

  for (const t of transactions) {
    if (t.amountCents > 0) {
      creditsCount++;
      totalCreditsCents += t.amountCents;
    } else {
      debitsCount++;
      totalDebitsCents += Math.abs(t.amountCents);
    }
  }

  return {
    totalTransactions: transactions.length,
    creditsCount,
    debitsCount,
    balanceEuros: formatBalanceCents(balanceCents),
    activeSubscriptionsCount: subscriptions.length,
    totalCreditsCents,
    totalDebitsCents,
  };
}
