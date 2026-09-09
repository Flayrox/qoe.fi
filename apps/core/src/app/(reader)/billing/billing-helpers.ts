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

export type BillingTransactionFilter = 'all' | 'credits' | 'debits';

/**
 * Formate un solde en centimes d'euro en chaîne décimale (ex: 4250 -> "42.50").
 */
export function formatBalanceCents(amountCents?: number | null): string {
  if (typeof amountCents !== 'number' || isNaN(amountCents)) {
    return '0.00';
  }
  return (amountCents / 100).toFixed(2);
}

/**
 * Formate le montant d'une transaction avec son signe et son statut de crédit.
 */
export function formatTransactionAmount(amountCents: number): {
  formatted: string;
  isCredit: boolean;
  sign: string;
  euros: number;
} {
  const isCredit = amountCents > 0;
  const euros = amountCents / 100;
  const sign = isCredit ? '+' : '';
  const formatted = `${sign}${euros.toFixed(2)} €`;

  return {
    formatted,
    isCredit,
    sign,
    euros,
  };
}

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

/**
 * Formate une date de transaction au format français (jour, mois court, heure).
 */
export function formatTransactionDate(dateInput: string | Date): string {
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
