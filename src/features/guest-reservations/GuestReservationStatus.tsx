import { useState } from 'react';
import type { CanonicalTimestamp, GuestPaymentSummary } from '@ski-academy/shared-domain';
import type { TranslationKey } from '../../lib/i18n/translations';
import { CourseEnrollmentScheduleList } from '../course-enrollments/CourseEnrollmentScheduleList';
import type { CourseEnrollmentScheduleLine } from '../course-enrollments/courseEnrollmentListProjection';

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
  onCancelPending?: () => Promise<boolean>;
  reservationDetails?: {
    readonly title: string;
    readonly participantName: string;
    readonly scheduleLines: readonly CourseEnrollmentScheduleLine[];
  };
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
  onCancelPending,
  reservationDetails,
}: GuestReservationStatusProps) {
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const deadline =
    reservationExpiresAt &&
    new Date(reservationExpiresAt.seconds * 1000 + reservationExpiresAt.nanoseconds / 1_000_000);
  const expired = lifecycleStatus === 'cancelled' && reasonCode === 'reservation_expired';
  const confirmed = lifecycleStatus === 'confirmed';
  const cancelled = lifecycleStatus === 'cancelled';
  const canCancelPending =
    statusHydrated &&
    lifecycleStatus === 'pending' &&
    payment?.unpaidCancellationEligible === true &&
    (!deadline || deadline.getTime() > Date.now()) &&
    Boolean(onCancelPending);
  const createdWithoutStatusDetails =
    !statusHydrated && !confirmed && !expired && !cancelled && lifecycleStatus === 'pending';
  const title = confirmed
    ? t(kind === 'lesson' ? 'guestLessonConfirmedTitle' : 'guestCourseConfirmedTitle')
    : expired
      ? t(kind === 'lesson' ? 'guestLessonExpiredTitle' : 'guestCourseExpiredTitle')
      : cancelled
        ? t(kind === 'lesson' ? 'guestCancelledTitle' : 'guestCourseCancelledTitle')
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
      {reservationDetails && (
        <div className="space-y-3 text-sm text-[var(--ink)]">
          <p>{reservationDetails.title}</p>
          <p>{reservationDetails.participantName}</p>
          <CourseEnrollmentScheduleList lines={reservationDetails.scheduleLines} />
        </div>
      )}
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
        {canCancelPending && !confirmCancellation && (
          <button
            type="button"
            onClick={() => setConfirmCancellation(true)}
            className="btn-secondary px-4 py-2 text-sm"
          >
            {t('guestCancelPending')}
          </button>
        )}
        {canCancelPending && confirmCancellation && (
          <div className="w-full space-y-2">
            <p className="text-sm text-[var(--ink)]">{t('guestCancelConfirm')}</p>
            <button
              type="button"
              disabled={cancelling}
              onClick={async () => {
                if (!onCancelPending) return;
                setCancelling(true);
                try {
                  if (await onCancelPending()) setConfirmCancellation(false);
                } finally {
                  setCancelling(false);
                }
              }}
              className="btn-secondary px-4 py-2 text-sm"
            >
              {t('guestCancelPending')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancellation(false)}
              className="btn-secondary px-4 py-2 text-sm"
            >
              {t('cancel')}
            </button>
          </div>
        )}
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
