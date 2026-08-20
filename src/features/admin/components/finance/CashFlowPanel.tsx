import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Minus, Search } from 'lucide-react';
import { useCurrency } from '../../../../app/providers/CurrencyContext';
import {
  buildSchoolCashFlowRows,
  formatWalletOperationLabel,
  ledgerEntryToView,
  rowMatchesTrack,
  summarizeSchoolCashFlow,
  WALLET_LEDGER_LABEL_KEYS,
  type SchoolCashFlowKind,
  type SchoolCashFlowRow,
} from '../../../../domain/wallet';
import { logger, QUERY_LIMITS } from '../../../../shared';
import {
  subscribeWalletLedger,
  subscribeGuestWalletBalance,
} from '../../../../features/admin/adminService';
import { ActionButton } from '../../../../ui/ActionButton';
import { ApplePagination } from '../../../../ui/ApplePagination';
import { StateCard } from '../../../../ui/StateCard';
import { TableSkeleton } from '../../../../ui/Skeleton';
import type { WalletCurrency, WalletLedgerEntry } from '../../../../types';
import type { CashFlowClient } from './financeContracts';
import { useAdminFinanceTranslations } from './useAdminFinanceTranslations';
import { SCHOOL_GUEST_WALLET_USER_ID } from '../../../../domain/wallet';

const ITEMS_PER_PAGE = 20;

type TrackFilter = 'all' | 'cash' | 'revenue';
type KindFilter = 'all' | SchoolCashFlowKind;

interface CashFlowPanelProps {
  usersList: CashFlowClient[];
}

const KIND_FILTERS: KindFilter[] = [
  'all',
  'top_up',
  'admin_adjustment',
  'guest_payment',
  'lesson_payment',
  'course_payment',
  'refund',
  'starter_credit',
];

function formatCurrencyTotals(
  totals: Record<WalletCurrency, number>,
  formatUsd: (amount: number) => string
): string {
  const parts: string[] = [];
  if (totals.USD !== 0) parts.push(formatUsd(totals.USD));
  if (totals.KZT !== 0) parts.push(`${totals.KZT.toLocaleString('ru-RU')} ₸`);
  if (parts.length === 0) parts.push(formatUsd(0));
  return parts.join(' · ');
}

function formatEntryAmount(
  amount: number,
  currency: WalletCurrency,
  formatUsd: (n: number) => string
) {
  return currency === 'KZT' ? `${amount.toLocaleString('ru-RU')} ₸` : formatUsd(amount);
}

export const CashFlowPanel: React.FC<CashFlowPanelProps> = ({ usersList }) => {
  const { t, language } = useAdminFinanceTranslations();
  const { formatPrice } = useCurrency();
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';

  const [entries, setEntries] = useState<WalletLedgerEntry[]>([]);
  const [guestWalletBalanceUsd, setGuestWalletBalanceUsd] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState<number>(QUERY_LIMITS.walletLedger);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState<TrackFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeWalletLedger(
      (nextEntries, nextHasMore) => {
        setEntries(nextEntries);
        setHasMore(nextHasMore);
        setLoading(false);
      },
      (error) => {
        logger.error('Failed to load school cash flow:', error);
        setLoading(false);
      },
      pageSize
    );
    return unsubscribe;
  }, [pageSize]);

  useEffect(() => {
    return subscribeGuestWalletBalance(setGuestWalletBalanceUsd, (error) =>
      logger.error('Failed to load guest wallet balance:', error)
    );
  }, []);

  const clientsById = useMemo(() => {
    const map = new Map<string, CashFlowClient>();
    for (const client of usersList) {
      map.set(client.uid, client);
    }
    return map;
  }, [usersList]);

  const rows = useMemo(() => buildSchoolCashFlowRows(entries), [entries]);

  const summary = useMemo(
    () => summarizeSchoolCashFlow(rows, usersList, guestWalletBalanceUsd),
    [rows, usersList, guestWalletBalanceUsd]
  );

  const kindLabel = (kind: SchoolCashFlowKind): string => t(WALLET_LEDGER_LABEL_KEYS[kind]);

  const rowLabel = (row: SchoolCashFlowRow): string => {
    const entry = entries.find((item) => item.id === row.id);
    if (!entry) return kindLabel(row.kind);
    return formatWalletOperationLabel(ledgerEntryToView(entry), t);
  };

  const filteredRows = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (trackFilter !== 'all' && !rowMatchesTrack(row, trackFilter)) return false;
      if (kindFilter !== 'all' && row.kind !== kindFilter) return false;
      if (!searchLower) return true;

      const client = clientsById.get(row.userId);
      const haystack = [
        client?.displayName,
        client?.email,
        row.userId,
        row.subjectName,
        rowLabel(row),
        row.bookingId,
        kindLabel(row.kind),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(searchLower);
    });
  }, [rows, trackFilter, kindFilter, search, clientsById, t, entries]);

  useEffect(() => {
    setPage(1);
  }, [search, trackFilter, kindFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredRows.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRows, page]);

  const typeFilterLabel = (filter: KindFilter): string => {
    if (filter === 'all') return t('cashFlowFilterAllTypes');
    return kindLabel(filter);
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="border border-[var(--border)] p-4 space-y-2">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
            {t('cashFlowCash')}
          </span>
          <p className="text-xl font-serif font-light text-[var(--ink)]">
            {formatCurrencyTotals(summary.cashNet, formatPrice)}
          </p>
          <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
            {t('cashFlowCashIn')}: {formatCurrencyTotals(summary.cashIn, formatPrice)}
          </p>
          <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400">
            {t('cashFlowCashOut')}: {formatCurrencyTotals(summary.cashOut, formatPrice)}
          </p>
        </div>
        <div className="border border-[var(--border)] p-4 space-y-2">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
            {t('cashFlowRevenue')}
          </span>
          <p className="text-xl font-serif font-light text-[var(--ink)]">
            {formatCurrencyTotals(summary.revenueNet, formatPrice)}
          </p>
          <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
            {t('cashFlowRevenueIn')}: {formatCurrencyTotals(summary.revenueIn, formatPrice)}
          </p>
          <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400">
            {t('cashFlowRevenueOut')}: {formatCurrencyTotals(summary.revenueOut, formatPrice)}
          </p>
        </div>
        <div className="border border-[var(--border)] p-4 space-y-2">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
            {t('cashFlowGuestWallet')}
          </span>
          <p className="text-xl font-serif font-light text-[var(--ink)]">
            {formatPrice(summary.guestWalletBalanceUsd)}
          </p>
          <p className="text-[11px] font-mono text-[var(--ink-dim)] leading-relaxed">
            {t('cashFlowGuestWalletHint')}
          </p>
        </div>
        <div className="border border-[var(--border)] p-4 space-y-2">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
            {t('cashFlowLiabilities')}
          </span>
          <p className="text-xl font-serif font-light text-[var(--ink)]">
            {formatCurrencyTotals(summary.liabilities, formatPrice)}
          </p>
          <p className="text-[11px] font-mono text-[var(--ink-dim)] leading-relaxed">
            {t('cashFlowLiabilitiesHint')}
          </p>
        </div>
      </div>

      {summary.byKind.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.byKind.map((item) => (
            <span
              key={item.kind}
              className="text-[10px] font-mono uppercase tracking-wider border border-[var(--border)] px-2 py-1 text-[var(--ink-dim)]"
            >
              {kindLabel(item.kind)} · {item.count} ·{' '}
              {formatCurrencyTotals(item.byCurrency, formatPrice)}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--ink-dim)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('cashFlowSearchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none placeholder-[var(--ink-dim)] font-mono"
          />
        </div>
        <select
          value={trackFilter}
          onChange={(event) => setTrackFilter(event.target.value as TrackFilter)}
          className="w-full px-3 py-2 border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
        >
          <option value="all">{t('cashFlowFilterAll')}</option>
          <option value="cash">{t('cashFlowCash')}</option>
          <option value="revenue">{t('cashFlowRevenue')}</option>
        </select>
        <select
          value={kindFilter}
          onChange={(event) => setKindFilter(event.target.value as KindFilter)}
          className="w-full px-3 py-2 border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
        >
          {KIND_FILTERS.map((filter) => (
            <option key={filter} value={filter}>
              {typeFilterLabel(filter)}
            </option>
          ))}
        </select>
      </div>

      {hasMore && (
        <div className="flex justify-end">
          <ActionButton
            onClick={() => setPageSize((current) => current + QUERY_LIMITS.walletLedger)}
            size="sm"
          >
            {t('cashFlowLoadMore')}
          </ActionButton>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : pagedRows.length === 0 ? (
        <StateCard title={t('cashFlowEmpty')} />
      ) : (
        <div className="border border-[var(--border)] divide-y divide-[var(--border)] max-h-[560px] overflow-y-auto">
          {pagedRows.map((row) => {
            const direction = row.classification.direction;
            const isIn = direction === 'in';
            const isOut = direction === 'out';
            const Icon = isIn ? ArrowDownLeft : isOut ? ArrowUpRight : Minus;
            const client = clientsById.get(row.userId);
            const track = row.classification.track;

            return (
              <div key={row.id} className="flex items-start gap-3 p-3 sm:p-4">
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border ${
                    isIn
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : isOut
                        ? 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'border-[var(--border)] bg-black/5 dark:bg-white/5 text-[var(--ink-dim)]'
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm text-[var(--ink)] leading-snug">{rowLabel(row)}</p>
                  <div className="flex flex-wrap gap-1">
                    {(track === 'cash' || track === 'both') && (
                      <span className="text-[8px] font-mono uppercase tracking-widest border border-[var(--border)] px-1.5 py-0.5 text-[var(--ink-dim)]">
                        {t('cashFlowCash')}
                      </span>
                    )}
                    {(track === 'revenue' || track === 'both') && (
                      <span className="text-[8px] font-mono uppercase tracking-widest border border-[var(--border)] px-1.5 py-0.5 text-[var(--ink-dim)]">
                        {t('cashFlowRevenue')}
                      </span>
                    )}
                    {track === 'none' && (
                      <span className="text-[8px] font-mono uppercase tracking-widest border border-[var(--border)] px-1.5 py-0.5 text-[var(--ink-dim)]">
                        {t('cashFlowBonus')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-[var(--ink-dim)]">
                    {client?.displayName ||
                      client?.email ||
                      (row.userId === SCHOOL_GUEST_WALLET_USER_ID
                        ? t('cashFlowGuestWallet')
                        : null) ||
                      row.subjectName ||
                      t('cashFlowUnknownClient')}
                    {client?.email && client.displayName ? ` · ${client.email}` : ''}
                  </p>
                  <p className="text-[10px] font-mono text-[var(--ink-dim)]">
                    {new Date(row.createdAt).toLocaleString(locale, {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <p
                  className={`text-sm font-semibold font-mono shrink-0 ${
                    isIn
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : isOut
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-[var(--ink-dim)]'
                  }`}
                >
                  {isIn ? '+' : isOut ? '−' : ''}
                  {formatEntryAmount(row.amount, row.currency, formatPrice)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <ApplePagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={filteredRows.length}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={setPage}
        itemLabel={t('cashFlowOperationsLabel')}
      />
    </div>
  );
};
