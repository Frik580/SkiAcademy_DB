import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { ApplePagination } from '../../../../ui/ApplePagination';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { buildWalletOperationHistory, formatWalletOperationLabel } from '../../../../domain/wallet';
import type { Booking, Course, WalletLedgerEntry } from '../../../../types';
import { useWalletStore } from '../../../../features/wallet';
import { ActionButton } from '../../../../ui/ActionButton';
import { StateCard } from '../../../../ui/StateCard';

const ITEMS_PER_PAGE = 15;

interface StudentWalletHistoryListProps {
  userId: string;
  bookings: Booking[];
  courses: Course[];
  ledgerEntries: WalletLedgerEntry[];
}

export const StudentWalletHistoryList: React.FC<StudentWalletHistoryListProps> = ({
  userId,
  bookings,
  courses,
  ledgerEntries,
}) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';

  const [currentPage, setCurrentPage] = useState(1);
  const walletLedgerHasMore = useWalletStore((state) => state.walletLedgerHasMore);
  const loadMoreWalletLedger = useWalletStore((state) => state.loadMoreWalletLedger);
  const formatWalletAmount = (amount: number) => `${amount.toLocaleString('ru-RU')} ₸`;

  const operations = useMemo(
    () => buildWalletOperationHistory(userId, bookings, courses, ledgerEntries, lang),
    [userId, bookings, courses, ledgerEntries, lang]
  );

  const totalPages = Math.max(1, Math.ceil(operations.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const paginatedOperations = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return operations.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [operations, currentPage]);

  if (operations.length === 0) {
    return <StateCard title={t('scProfileWalletHistoryEmpty')} />;
  }

  return (
    <div>
      <div className="rounded-2xl border border-[var(--border-subtle)] overflow-hidden divide-y divide-[var(--border-subtle)]">
        {paginatedOperations.map((operation) => {
          const isCredit = operation.amount > 0;
          const Icon = isCredit ? ArrowDownLeft : ArrowUpRight;
          const formattedDate = new Date(operation.createdAt).toLocaleString(
            lang === 'ru' ? 'ru-RU' : 'en-US',
            {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }
          );

          return (
            <div
              key={operation.id}
              className="flex items-start gap-3 px-4 py-3.5 bg-[var(--surface)]"
            >
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                  isCredit
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--ink)] leading-snug">
                  {formatWalletOperationLabel(operation, t)}
                </p>
                <p className="text-xs text-[var(--ink-dim)] mt-1">{formattedDate}</p>
                {operation.balanceAfter != null && (
                  <p className="text-[11px] text-[var(--ink-dim)] mt-1">
                    {t('scProfileWalletBalanceAfter')}: {formatWalletAmount(operation.balanceAfter)}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p
                  className={`text-sm font-semibold font-mono ${
                    isCredit
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {isCredit ? '+' : '−'}
                  {formatWalletAmount(Math.abs(operation.amount))}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <ApplePagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={operations.length}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={setCurrentPage}
        itemLabel={lang === 'ru' ? 'операций' : 'transactions'}
      />
      {walletLedgerHasMore && (
        <div className="flex justify-center pt-3">
          <ActionButton onClick={loadMoreWalletLedger} size="sm">
            Load more transactions
          </ActionButton>
        </div>
      )}
    </div>
  );
};
