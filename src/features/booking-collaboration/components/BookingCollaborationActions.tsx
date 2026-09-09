import React from 'react';
import {
  resolveLessonBookingClientExercisedCapability,
  type LessonBookingCabinetItem,
} from '../../lesson-bookings/lessonBookingContracts';
import { useBookingCollaborationTranslations } from '../useBookingCollaborationTranslations';

export interface BookingCollaborationActionsProps {
  readonly booking: LessonBookingCabinetItem;
  readonly onWithdrawCancellation: (booking: LessonBookingCabinetItem) => void | Promise<void>;
  readonly onReschedule: (booking: LessonBookingCabinetItem) => void;
  readonly onCancel?: (booking: LessonBookingCabinetItem) => void;
  readonly submitting?: boolean;
}

export const BookingCollaborationActions: React.FC<BookingCollaborationActionsProps> = ({
  booking,
  onWithdrawCancellation,
  onReschedule,
  onCancel,
  submitting = false,
}) => {
  const copy = useBookingCollaborationTranslations();
  const actions = booking.authorizedActions;
  if (!booking.isLessonBooking || !actions) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.canWithdrawCancellation && (
        <button
          type="button"
          disabled={submitting}
          onClick={() => void onWithdrawCancellation(booking)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition"
        >
          {copy.withdrawCancellation}
        </button>
      )}
      {actions.canReschedule && resolveLessonBookingClientExercisedCapability(booking) && (
        <button
          type="button"
          disabled={submitting}
          onClick={() => onReschedule(booking)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-subtle)] text-[var(--ink)] hover:border-[var(--accent)] transition"
        >
          {copy.rescheduleBooking}
        </button>
      )}
      {actions.canRequestCancellation && onCancel && booking.status === 'confirmed' && (
        <button
          type="button"
          disabled={submitting}
          onClick={() => onCancel(booking)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition"
        >
          {copy.t('cancelBookingRefund')}
        </button>
      )}
    </div>
  );
};
