import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ADMIN_GUEST_FUNDS_DISCOVERY_FILTERS,
  type AdminGuestFundsDiscoveryFilter,
  type AdminGuestFundsDiscoveryRow,
} from '@ski-academy/shared-domain';
import type { TranslationKey } from '../../../lib/i18n/translations';
import {
  ADMIN_COURSE_ENROLLMENT_QUERY_KEY,
  ADMIN_FINANCE_ACCOUNT_QUERY_KEY,
  ADMIN_FINANCE_PAYMENT_QUERY_KEY,
  ADMIN_LESSON_BOOKING_QUERY_KEY,
  ADMIN_TAB_QUERY_KEY,
} from '../adminNavigation';
import { useAdminFinanceTranslations } from '../components/finance/useAdminFinanceTranslations';
import { localDateTimeFromTimestamp, resolveAdminTimeZone } from '../operations/adminTimeZone';
import { useAdminGuestFundsReadModel } from './useAdminGuestFundsReadModel';

function formatKzt(amount: number, locale: string): string {
  return `${amount.toLocaleString(locale)} ₸`;
}

function filterLabelKey(filter: AdminGuestFundsDiscoveryFilter): TranslationKey {
  switch (filter) {
    case 'all':
      return 'canonicalGuestFundsFilterAll';
    case 'unlinked':
      return 'canonicalGuestFundsFilterUnlinked';
    case 'linked':
      return 'canonicalGuestFundsFilterLinked';
    case 'outstanding':
      return 'canonicalGuestFundsFilterOutstanding';
    case 'unpaid':
      return 'canonicalGuestFundsFilterUnpaid';
    case 'partially_paid':
      return 'canonicalGuestFundsFilterPartiallyPaid';
    case 'paid':
      return 'canonicalGuestFundsFilterPaid';
    case 'refunded':
      return 'canonicalGuestFundsFilterRefunded';
    case 'partially_refunded':
      return 'canonicalGuestFundsFilterPartiallyRefunded';
  }
}

function matchesPageLocalSearch(row: AdminGuestFundsDiscoveryRow, query: string): boolean {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  const haystacks = [
    row.guestDisplayName,
    row.payer?.displayName,
    row.payer?.accountId,
    row.paymentId,
    row.service.subjectKind === 'booking'
      ? row.service.bookingId
      : `${row.service.enrollmentId} ${row.service.courseTitle ?? ''} ${row.service.courseId}`,
  ];
  return haystacks.some((value) => value?.toLowerCase().includes(needle));
}

function serviceLabel(row: AdminGuestFundsDiscoveryRow): string {
  if (row.service.subjectKind === 'booking') {
    const local = localDateTimeFromTimestamp(
      row.service.startsAt.seconds,
      row.service.timeZone || resolveAdminTimeZone()
    );
    return `Lesson · ${local.date} ${local.time}`;
  }
  return `Course · ${row.service.courseTitle ?? row.service.courseId}`;
}

export function CanonicalGuestFinancePanel() {
  const { t, language } = useAdminFinanceTranslations();
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const [, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<AdminGuestFundsDiscoveryFilter>('all');
  const [pageSearch, setPageSearch] = useState('');
  const read = useAdminGuestFundsReadModel(filter);

  const visibleRows = useMemo(
    () => (read.item?.items ?? []).filter((row) => matchesPageLocalSearch(row, pageSearch)),
    [pageSearch, read.item?.items]
  );

  const openPayment = (row: AdminGuestFundsDiscoveryRow) => {
    if (!row.paymentId) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(ADMIN_TAB_QUERY_KEY, 'finance');
        next.set(ADMIN_FINANCE_PAYMENT_QUERY_KEY, row.paymentId!);
        if (row.linkState === 'linked' && row.payer?.accountId) {
          next.set(ADMIN_FINANCE_ACCOUNT_QUERY_KEY, row.payer.accountId);
        } else {
          next.delete(ADMIN_FINANCE_ACCOUNT_QUERY_KEY);
        }
        return next;
      },
      { replace: true }
    );
  };

  const openLesson = (bookingId: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(ADMIN_TAB_QUERY_KEY, 'operations');
        next.set(ADMIN_LESSON_BOOKING_QUERY_KEY, bookingId);
        next.delete(ADMIN_FINANCE_PAYMENT_QUERY_KEY);
        next.delete(ADMIN_FINANCE_ACCOUNT_QUERY_KEY);
        return next;
      },
      { replace: true }
    );
  };

  const openEnrollment = (enrollmentId: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(ADMIN_TAB_QUERY_KEY, 'operations');
        next.set(ADMIN_COURSE_ENROLLMENT_QUERY_KEY, enrollmentId);
        next.delete(ADMIN_FINANCE_PAYMENT_QUERY_KEY);
        next.delete(ADMIN_FINANCE_ACCOUNT_QUERY_KEY);
        return next;
      },
      { replace: true }
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] font-mono text-[var(--ink-dim)] leading-relaxed">
        {t('canonicalGuestFinanceHint')}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">
          {t('canonicalGuestFundsFilterLabel')}
          <select
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as AdminGuestFundsDiscoveryFilter)
            }
            className="mt-1 block w-full sm:w-56 px-3 py-2 border border-[var(--border)] bg-transparent text-xs font-mono"
          >
            {ADMIN_GUEST_FUNDS_DISCOVERY_FILTERS.map((value) => (
              <option key={value} value={value}>
                {t(filterLabelKey(value))}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)] flex-1">
          {t('canonicalGuestFundsPageSearchLabel')}
          <input
            value={pageSearch}
            onChange={(event) => setPageSearch(event.target.value)}
            placeholder={t('canonicalGuestFundsPageSearchPlaceholder')}
            className="mt-1 block w-full px-3 py-2 border border-[var(--border)] bg-transparent text-xs font-mono"
          />
        </label>
      </div>
      <p className="text-[10px] font-mono text-[var(--ink-dim)]">
        {t('canonicalGuestFundsPageSearchHint')}
      </p>

      {read.loading ? (
        <p className="text-xs font-mono text-[var(--ink-dim)]">{t('canonicalGuestFundsLoading')}</p>
      ) : null}

      {read.error ? (
        <div className="border border-[var(--border)] p-3 space-y-2">
          <p className="text-xs font-mono text-[var(--ink)]">
            {read.error === 'permission-denied'
              ? t('adminFinancePermissionDenied')
              : t('canonicalGuestFundsLoadFailed')}
          </p>
          <button
            type="button"
            onClick={() => void read.refetch()}
            className="text-xs font-mono underline"
          >
            {t('canonicalGuestFundsRetry')}
          </button>
        </div>
      ) : null}

      {!read.loading && !read.error && visibleRows.length === 0 ? (
        read.item?.hasMore ? (
          <div className="space-y-2">
            <p className="text-xs font-mono text-[var(--ink-dim)]">
              {t('canonicalGuestFundsContinueScan')}
            </p>
            <button
              type="button"
              disabled={read.loadingMore}
              onClick={() => void read.loadMore()}
              className="border border-[var(--border)] px-3 py-2 text-xs font-mono disabled:opacity-50"
            >
              {read.loadingMore
                ? t('canonicalGuestFundsLoadingMore')
                : t('canonicalGuestFundsLoadMore')}
            </button>
          </div>
        ) : (
          <p className="text-xs font-mono text-[var(--ink-dim)]">{t('canonicalGuestFundsEmpty')}</p>
        )
      ) : null}

      <div className="space-y-3">
        {visibleRows.map((row) => (
          <article
            key={row.rowId}
            className="border border-[var(--border)] p-3 text-xs font-mono space-y-2"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="space-y-1">
                <div className="text-sm text-[var(--ink)]">
                  {row.guestDisplayName ?? t('canonicalGuestFundsIdentityUnknown')}
                </div>
                <div className="text-[var(--ink-dim)]">{serviceLabel(row)}</div>
              </div>
              <span className="text-[10px] uppercase tracking-widest text-[var(--ink-dim)]">
                {row.linkState === 'linked'
                  ? t('canonicalGuestFinanceLinked')
                  : t('canonicalGuestFinanceUnlinked')}
              </span>
            </div>

            <div className="grid gap-1 sm:grid-cols-2">
              <div>
                {t('canonicalGuestFundsPaymentStatus')}:{' '}
                {row.paymentStatus ?? t('canonicalGuestFundsPaymentStatusUnknown')}
              </div>
              {row.payer ? (
                <div>
                  {t('adminFinancePayer')}: {row.payer.displayName}
                </div>
              ) : row.linkState === 'linked' ? (
                <div>
                  {t('adminFinancePayer')}: {t('canonicalGuestFundsPayerUnassigned')}
                </div>
              ) : null}
              {row.price !== undefined ? (
                <div>
                  {t('canonicalGuestFundsPrice')}: {formatKzt(row.price, locale)}
                </div>
              ) : null}
              {row.paidAmount !== undefined ? (
                <div>
                  {t('canonicalGuestFundsPaid')}: {formatKzt(row.paidAmount, locale)}
                </div>
              ) : null}
              {row.outstandingAmount !== undefined ? (
                <div>
                  {t('canonicalGuestFundsOutstanding')}:{' '}
                  {formatKzt(row.outstandingAmount, locale)}
                </div>
              ) : null}
              {row.refundedAmount !== undefined ? (
                <div>
                  {t('adminFinanceRefunded')}: {formatKzt(row.refundedAmount, locale)}
                </div>
              ) : null}
              {row.writtenOffAmount !== undefined ? (
                <div>
                  {t('adminFinanceWrittenOff')}: {formatKzt(row.writtenOffAmount, locale)}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {row.paymentId ? (
                <button
                  type="button"
                  onClick={() => openPayment(row)}
                  className="border border-[var(--border)] px-3 py-1.5 text-[11px]"
                >
                  {t('canonicalGuestFundsOpenPayment')}
                </button>
              ) : null}
              {row.service.subjectKind === 'booking' ? (
                <button
                  type="button"
                  onClick={() => {
                    if (row.service.subjectKind === 'booking') {
                      openLesson(row.service.bookingId);
                    }
                  }}
                  className="border border-[var(--border)] px-3 py-1.5 text-[11px]"
                >
                  {t('canonicalGuestFundsOpenLesson')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (row.service.subjectKind === 'course_enrollment') {
                      openEnrollment(row.service.enrollmentId);
                    }
                  }}
                  className="border border-[var(--border)] px-3 py-1.5 text-[11px]"
                >
                  {t('canonicalGuestFundsOpenEnrollment')}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {read.item?.hasMore ? (
        <button
          type="button"
          disabled={read.loadingMore}
          onClick={() => void read.loadMore()}
          className="border border-[var(--border)] px-3 py-2 text-xs font-mono disabled:opacity-50"
        >
          {read.loadingMore
            ? t('canonicalGuestFundsLoadingMore')
            : t('canonicalGuestFundsLoadMore')}
        </button>
      ) : null}
    </div>
  );
}
