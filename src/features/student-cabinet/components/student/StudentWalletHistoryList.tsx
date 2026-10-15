import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { ApplePagination } from '../../../../ui/ApplePagination';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';
import { formatWalletOperationLabel } from '../../../../domain/wallet';
import type { StudentWalletHistoryInput } from './studentWalletHistoryContracts';
import { ActionButton } from '../../../../ui/ActionButton';
import { StateCard } from '../../../../ui/StateCard';

const ITEMS_PER_PAGE = 15;

export const StudentWalletHistoryList: React.FC<StudentWalletHistoryInput> = ({
  operations,
  loading,
  error,
  hasMore,
  loadMore,
  retry,
}) => {
  const { lang, t } = useStudentCabinetTranslations();

  const [currentPage, setCurrentPage] = useState(1);
  // Current pricing/Wallet adapters use integer KZT 1:1 (despite the
  // KztMinorUnits type name). Never divide these values a second time.
  const formatWalletAmount = (amount: number, currency: 'KZT' | 'USD') =>
    `${amount.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')} ${currency === 'KZT' ? '₸' : 'USD'}`;

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

  if (loading && operations.length === 0)
    return (
      <div role="status">
        <StateCard title={t('loading')} />
      </div>
    );
  const errorCard = error ? (
    <div role="alert">
      <StateCard title={t('walletHistoryLoadError')}>
        <ActionButton onClick={retry} size="sm">
          {t('retry')}
        </ActionButton>
      </StateCard>
    </div>
  ) : null;
  if (error && operations.length === 0) return errorCard;
  if (operations.length === 0 && !hasMore) {
    return <StateCard title={t('scProfileWalletHistoryEmpty')} />;
  }

  return (
    <div>
      {errorCard}
      <div
        role="list"
        data-testid="wallet-operation-history"
        className="rounded-2xl border border-[var(--border-subtle)] overflow-hidden divide-y divide-[var(--border-subtle)]"
      >
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
              role="listitem"
              data-operation-id={operation.id}
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
                <p className="type-compact font-medium text-[var(--ink)]">
                  {formatWalletOperationLabel(operation, t)}
                </p>
                <p className="type-caption text-[var(--ink-dim)] mt-1">{formattedDate}</p>
                {operation.balanceAfter != null && (
                  <p className="type-caption text-[var(--ink-dim)] mt-1">
                    {t('scProfileWalletBalanceAfter')}:{' '}
                    {formatWalletAmount(operation.balanceAfter, operation.currency ?? 'KZT')}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p
                  className={`type-compact font-medium ${
                    isCredit
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {isCredit ? '+' : '−'}
                  {formatWalletAmount(Math.abs(operation.amount), operation.currency ?? 'KZT')}
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
      {hasMore && !error && (
        <div className="flex justify-center pt-3">
          <ActionButton onClick={loadMore} disabled={loading} size="sm">
            {loading ? t('loading') : t('walletHistoryLoadMore')}
          </ActionButton>
        </div>
      )}
    </div>
  );
};
