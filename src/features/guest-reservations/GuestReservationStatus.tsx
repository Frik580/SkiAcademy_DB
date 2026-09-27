import type { CanonicalTimestamp, GuestPaymentSummary } from '@ski-academy/shared-domain';
import type { TranslationKey } from '../../lib/i18n/translations';

interface GuestReservationStatusProps {
  kind: 'lesson' | 'course';
  lifecycleStatus: string;
  reasonCode?: string;
  reservationExpiresAt?: CanonicalTimestamp;
  payment?: GuestPaymentSummary;
  language: 'ru' | 'en';
  t: (key: TranslationKey) => string;
  onRefresh: () => void;
  refreshing: boolean;
  refreshError: boolean;
  /** True when lifecycle/payment details came from a successful read-model fetch. */
  statusHydrated: boolean;
  onClose: () => void;
  onNewBooking?: () => void;
}

export function GuestReservationStatus({
  kind,
  lifecycleStatus,
  reasonCode,
  reservationExpiresAt,
  payment,
  language,
  t,
  onRefresh,
  refreshing,
  refreshError,
  statusHydrated,
  onClose,
  onNewBooking,
}: GuestReservationStatusProps) {
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const deadline =
    reservationExpiresAt &&
    new Date(reservationExpiresAt.seconds * 1000 + reservationExpiresAt.nanoseconds / 1_000_000);
  const expired = lifecycleStatus === 'cancelled' && reasonCode === 'reservation_expired';
  const confirmed = lifecycleStatus === 'confirmed';
  const cancelled = lifecycleStatus === 'cancelled';
  const createdWithoutStatusDetails =
    !statusHydrated && !confirmed && !expired && !cancelled && lifecycleStatus === 'pending';
  const title = confirmed
    ? t(kind === 'lesson' ? 'guestLessonConfirmedTitle' : 'guestCourseConfirmedTitle')
    : expired
      ? t(kind === 'lesson' ? 'guestLessonExpiredTitle' : 'guestCourseExpiredTitle')
      : cancelled
        ? t('guestCancelledTitle')
        : createdWithoutStatusDetails
          ? t(
              kind === 'lesson'
                ? 'postCreateRefreshFailedLessonTitle'
                : 'postCreateRefreshFailedCourseTitle'
            )
          : t('guestPendingTitle');
  const formattedDeadline =
    deadline &&
    new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(deadline);
  const formatAmount = (amount: number) =>
    `${new Intl.NumberFormat(locale).format(amount)} ${language === 'ru' ? '₸' : 'KZT'}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5" role="status">
      <h3 className="font-serif text-xl text-[var(--ink)]">{title}</h3>
      {confirmed ? (
        <p className="text-sm text-[var(--ink)]">{t('guestConfirmedBody')}</p>
      ) : expired ? (
        <p className="text-sm text-[var(--ink)]">
          {t(kind === 'lesson' ? 'guestLessonExpiredBody' : 'guestCourseExpiredBody')}
        </p>
      ) : cancelled ? (
        <p className="text-sm text-[var(--ink)]">{t('guestCancelledBody')}</p>
      ) : createdWithoutStatusDetails ? (
        <p className="text-sm text-[var(--ink)]">{t('postCreateRefreshFailedBody')}</p>
      ) : (
        <div className="space-y-3 text-sm text-[var(--ink)]">
          {formattedDeadline && (
            <p>
              {t(kind === 'lesson' ? 'guestLessonHoldUntil' : 'guestCourseHoldUntil').replace(
                '{deadline}',
                formattedDeadline
              )}
            </p>
          )}
          {payment && (
            <>
              <p>
                {t(kind === 'lesson' ? 'guestBookingPrice' : 'guestCoursePrice').replace(
                  '{amount}',
                  formatAmount(payment.price)
                )}
              </p>
              {payment.outstandingAmount > 0 && payment.outstandingAmount < payment.price && (
                <p>
                  {t('guestOutstandingAmount').replace(
                    '{amount}',
                    formatAmount(payment.outstandingAmount)
                  )}
                </p>
              )}
            </>
          )}
          {payment?.paymentSatisfied ? (
            <p>{t('guestPaymentReceivedPendingConfirmation')}</p>
          ) : statusHydrated ? (
            <>
              <p>{t('guestAdminContactPayment')}</p>
              <p>
                {t(
                  kind === 'lesson' ? 'guestLessonAfterFullPayment' : 'guestCourseAfterFullPayment'
                )}
              </p>
            </>
          ) : null}
        </div>
      )}
      {refreshError && statusHydrated && (
        <p className="text-sm text-rose-600">{t('guestStatusRefreshFailed')}</p>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        {cancelled && onNewBooking ? (
          <button type="button" onClick={onNewBooking} className="btn-secondary px-4 py-2 text-sm">
            {t('guestNewBooking')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="btn-secondary px-4 py-2 text-sm"
          >
            {refreshing ? t('processing') : t('guestCheckStatus')}
          </button>
        )}
        <button type="button" onClick={onClose} className="btn-primary px-4 py-2 text-sm">
          {t('closeBtn')}
        </button>
      </div>
    </div>
  );
}
