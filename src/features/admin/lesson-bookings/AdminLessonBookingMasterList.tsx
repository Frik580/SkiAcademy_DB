import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import { Loader2, RefreshCw } from 'lucide-react';
import { memo } from 'react';
import type {
  AdminLessonBookingReadError,
  AdminLessonBookingView,
} from './lessonBookingAdminContracts';
import {
  formatLessonAdminDuration,
  LESSON_ADMIN_ORIGIN_LABEL_KEYS,
  LESSON_ADMIN_PRIMARY_STATUS_KEYS,
  PAYMENT_STATUS_LABEL_KEYS,
  resolveLessonAdminPrimaryStatus,
} from './lessonBookingAdminPresentation';
import { AdminLessonBookingListRow } from './AdminLessonBookingUi';
import { useAdminLessonBookingTranslations } from './useAdminLessonBookingTranslations';

export interface AdminLessonBookingMasterListProps {
  readonly view: AdminLessonBookingView;
  readonly items: readonly LessonBookingReadModel[];
  readonly loading: boolean;
  readonly error?: AdminLessonBookingReadError;
  readonly loadingMore: boolean;
  readonly hasMore: boolean;
  readonly selectedBookingId?: string;
  readonly locale: string;
  readonly onViewChange: (view: AdminLessonBookingView) => void;
  readonly onSelectBooking: (bookingId: string) => void;
  readonly onLoadMore: () => void;
  readonly onRetryList: () => void;
}

function listOccurrenceParts(
  item: LessonBookingReadModel,
  locale: string
): { date: string; time: string } {
  const start = new Date(item.occurrence.startsAt.seconds * 1_000);
  return {
    date: new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: item.occurrence.timeZone,
    }).format(start),
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: item.occurrence.timeZone,
    })
      .format(start)
      .replace(/^24:/, '00:'),
  };
}

/**
 * Hard render boundary for the lesson/course master list.
 *
 * Detail-local draft typing must never reach these rows, so the component is memoized and
 * receives only primitives plus referentially stable callbacks. Localization is resolved
 * through the feature translation hook instead of a `t` prop, because a fresh `t` identity
 * on every container render would defeat the memo comparison.
 */
export const AdminLessonBookingMasterList = memo(function AdminLessonBookingMasterList({
  view,
  items,
  loading,
  error,
  loadingMore,
  hasMore,
  selectedBookingId,
  locale,
  onViewChange,
  onSelectBooking,
  onLoadMore,
  onRetryList,
}: AdminLessonBookingMasterListProps) {
  const { t } = useAdminLessonBookingTranslations();

  return (
    <section
      aria-label="Canonical lesson bookings"
      className="overflow-hidden rounded-[var(--radius)] bg-[var(--card-bg)] shadow-[var(--shadow-soft)]"
    >
      <div className="border-b border-[var(--border)] p-3">
        <div className="inline-flex rounded-full bg-[var(--profile-bg)] p-1">
          {(['hot', 'history'] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={view === candidate}
              onClick={() => onViewChange(candidate)}
              className={`px-4 py-2 text-xs font-semibold transition-colors ${
                view === candidate
                  ? 'bg-[var(--ink)] text-[var(--bg)] shadow-sm'
                  : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
              }`}
            >
              {candidate === 'hot' ? t('adminLessonHot') : t('adminLessonHistory')}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div role="status" className="flex min-h-36 items-center justify-center gap-2 text-xs">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('adminLessonLoading')}
          </div>
        ) : error ? (
          <div role="alert" className="border border-red-500/30 p-4 text-xs">
            {error === 'permission-denied'
              ? t('adminLessonPermissionDenied')
              : t('adminLessonReadFailed')}
            <button
              type="button"
              onClick={onRetryList}
              className="mt-3 flex items-center gap-2 border border-[var(--border)] px-3 py-2"
            >
              <RefreshCw className="h-3.5 w-3.5" /> {t('adminLessonRetry')}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="space-y-3 border border-dashed border-[var(--border)] p-8 text-center text-xs text-[var(--ink-dim)]">
            <p>{t('adminLessonEmpty')}</p>
            {hasMore && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={onLoadMore}
                className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
              >
                {loadingMore ? t('adminLessonLoadingMore') : t('adminLessonLoadNextPage')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const occurrence = listOccurrenceParts(item, locale);
              const primaryStatus = resolveLessonAdminPrimaryStatus(item);
              const paymentStatus = item.admin?.payment.status;
              return (
                <AdminLessonBookingListRow
                  key={item.bookingId}
                  selected={selectedBookingId === item.bookingId}
                  onSelect={() => onSelectBooking(item.bookingId)}
                  item={{
                    bookingId: item.bookingId,
                    participantNames: item.participants
                      .map((participant) => participant.displayName)
                      .join(', '),
                    date: occurrence.date,
                    time: occurrence.time,
                    instructor: item.instructor.displayName,
                    duration: formatLessonAdminDuration(item.occurrence.durationMinutes, t),
                    primaryStatus,
                    primaryStatusLabel: t(LESSON_ADMIN_PRIMARY_STATUS_KEYS[primaryStatus]),
                    ...(paymentStatus
                      ? {
                          paymentStatus,
                          paymentStatusLabel: t(PAYMENT_STATUS_LABEL_KEYS[paymentStatus]),
                        }
                      : {}),
                    origin: item.bookingOrigin,
                    originLabel: t(LESSON_ADMIN_ORIGIN_LABEL_KEYS[item.bookingOrigin]),
                  }}
                />
              );
            })}
            {hasMore && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={onLoadMore}
                className="w-full border border-[var(--border)] px-3 py-2 text-xs font-medium disabled:opacity-50"
              >
                {loadingMore ? t('adminLessonLoadingMore') : t('adminLessonLoadMore')}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
});
