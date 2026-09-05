import type { UserProfile, WalletCurrency, WalletLedgerEntry, WalletLedgerType } from '../../types';

export type SchoolCashFlowDirection = 'in' | 'out';
export type SchoolCashFlowTrack = 'cash' | 'revenue' | 'both' | 'none';
export type SchoolCashFlowKind = WalletLedgerType;

export interface SchoolCashFlowClassification {
  track: SchoolCashFlowTrack;
  direction: SchoolCashFlowDirection | null;
}

export interface SchoolCashFlowRow {
  id: string;
  userId: string;
  amount: number;
  currency: WalletCurrency;
  createdAt: string;
  kind: SchoolCashFlowKind;
  subjectName?: string;
  bookingId?: string;
  classification: SchoolCashFlowClassification;
  source: 'ledger';
}

export type SchoolCashFlowClientBalance = Pick<UserProfile, 'balanceUSD' | 'walletBalances'>;

const ZERO_CURRENCY: Record<WalletCurrency, number> = { USD: 0, KZT: 0 };

export function emptyCurrencyTotals(): Record<WalletCurrency, number> {
  return { ...ZERO_CURRENCY };
}

export function classifySchoolCashFlow(
  type: WalletLedgerType,
  amount: number
): SchoolCashFlowClassification {
  switch (type) {
    case 'top_up':
      return { track: 'cash', direction: 'in' };
    case 'admin_adjustment':
      return { track: 'cash', direction: amount > 0 ? 'in' : 'out' };
    case 'lesson_payment':
    case 'course_payment':
      return { track: 'revenue', direction: 'in' };
    case 'refund':
      return { track: 'revenue', direction: 'out' };
    case 'guest_payment':
      return { track: 'both', direction: amount >= 0 ? 'in' : 'out' };
    case 'starter_credit':
      return { track: 'none', direction: null };
  }
}

export function schoolCashFlowCurrency(entry: Pick<WalletLedgerEntry, 'currency'>): WalletCurrency {
  return entry.currency ?? 'KZT';
}

export function schoolCashFlowAmount(entry: Pick<WalletLedgerEntry, 'amount'>): number {
  return Math.abs(entry.amount);
}

export function rowMatchesTrack(row: SchoolCashFlowRow, track: 'cash' | 'revenue'): boolean {
  return row.classification.track === track || row.classification.track === 'both';
}

function ledgerRow(entry: WalletLedgerEntry): SchoolCashFlowRow {
  return {
    id: entry.id,
    userId: entry.userId,
    amount: schoolCashFlowAmount(entry),
    currency: schoolCashFlowCurrency(entry),
    createdAt: entry.createdAt,
    kind: entry.type,
    subjectName: entry.subjectName,
    bookingId: entry.bookingId,
    classification: classifySchoolCashFlow(entry.type, entry.amount),
    source: 'ledger',
  };
}

/** Cash-flow rows come only from wallet ledger (including guest_payment). */
export function buildSchoolCashFlowRows(entries: WalletLedgerEntry[]): SchoolCashFlowRow[] {
  return entries
    .map(ledgerRow)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export interface SchoolCashFlowTypeTotal {
  kind: SchoolCashFlowKind;
  count: number;
  byCurrency: Record<WalletCurrency, number>;
}

export interface SchoolCashFlowSummary {
  cashIn: Record<WalletCurrency, number>;
  cashOut: Record<WalletCurrency, number>;
  cashNet: Record<WalletCurrency, number>;
  revenueIn: Record<WalletCurrency, number>;
  revenueOut: Record<WalletCurrency, number>;
  revenueNet: Record<WalletCurrency, number>;
  liabilities: Record<WalletCurrency, number>;
  guestWalletBalanceUsd: number;
  byKind: SchoolCashFlowTypeTotal[];
}

function addAmount(
  target: Record<WalletCurrency, number>,
  currency: WalletCurrency,
  amount: number
): void {
  target[currency] += amount;
}

export function clientWalletLiability(
  client: SchoolCashFlowClientBalance
): Record<WalletCurrency, number> {
  return {
    USD: client.walletBalances?.USD ?? client.balanceUSD ?? 0,
    KZT: client.walletBalances?.KZT ?? 0,
  };
}

export function summarizeWalletLiabilities(
  clients: SchoolCashFlowClientBalance[]
): Record<WalletCurrency, number> {
  const totals = emptyCurrencyTotals();
  for (const client of clients) {
    const liability = clientWalletLiability(client);
    totals.USD += liability.USD;
    totals.KZT += liability.KZT;
  }
  return totals;
}

export function summarizeSchoolCashFlow(
  rows: SchoolCashFlowRow[],
  clients: SchoolCashFlowClientBalance[] = [],
  guestWalletBalanceUsd = 0
): SchoolCashFlowSummary {
  const cashIn = emptyCurrencyTotals();
  const cashOut = emptyCurrencyTotals();
  const revenueIn = emptyCurrencyTotals();
  const revenueOut = emptyCurrencyTotals();
  const kindMap = new Map<SchoolCashFlowKind, SchoolCashFlowTypeTotal>();

  for (const row of rows) {
    const { track, direction } = row.classification;
    if (direction && (track === 'cash' || track === 'both')) {
      addAmount(direction === 'in' ? cashIn : cashOut, row.currency, row.amount);
    }
    if (direction && (track === 'revenue' || track === 'both')) {
      addAmount(direction === 'in' ? revenueIn : revenueOut, row.currency, row.amount);
    }

    const existing = kindMap.get(row.kind);
    if (existing) {
      existing.count += 1;
      existing.byCurrency[row.currency] += row.amount;
    } else {
      const byCurrency = emptyCurrencyTotals();
      byCurrency[row.currency] = row.amount;
      kindMap.set(row.kind, { kind: row.kind, count: 1, byCurrency });
    }
  }

  const cashNet = emptyCurrencyTotals();
  cashNet.USD = cashIn.USD - cashOut.USD;
  cashNet.KZT = cashIn.KZT - cashOut.KZT;

  const revenueNet = emptyCurrencyTotals();
  revenueNet.USD = revenueIn.USD - revenueOut.USD;
  revenueNet.KZT = revenueIn.KZT - revenueOut.KZT;

  return {
    cashIn,
    cashOut,
    cashNet,
    revenueIn,
    revenueOut,
    revenueNet,
    liabilities: summarizeWalletLiabilities(clients),
    guestWalletBalanceUsd,
    byKind: [...kindMap.values()].sort((a, b) => b.count - a.count),
  };
}
