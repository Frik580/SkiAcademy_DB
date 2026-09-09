import { useMemo } from 'react';
import type { Booking } from '../../../types';
import { useLanguage } from '../../../app/providers/LanguageContext';
import {
  lessonAdminPrimaryStatusBadgeTone,
  resolveAdminMonitorLessonStatusFromRow,
} from '../lesson-bookings/lessonBookingAdminPresentation';
import { StatusBadge } from '../../../ui/StatusBadge';

interface AdminMonitorLessonStatusBadgeProps {
  readonly booking: Pick<
    Booking,
    | 'canonicalLifecycleStatus'
    | 'occurrenceStartsAtSeconds'
    | 'occurrenceEndsAtSeconds'
    | 'paymentOutstanding'
    | 'paymentStatus'
    | 'status'
  >;
}

export function AdminMonitorLessonStatusBadge({ booking }: AdminMonitorLessonStatusBadgeProps) {
  const { t } = useLanguage();
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const presentation = useMemo(
    () => resolveAdminMonitorLessonStatusFromRow(booking, nowSeconds),
    [booking, nowSeconds]
  );

  if (!presentation) {
    return <StatusBadge status={booking.status} size="xs" />;
  }

  const tone = lessonAdminPrimaryStatusBadgeTone(presentation.kind);
  if (tone === 'info') {
    return <StatusBadge variant="info" label={t(presentation.labelKey)} size="xs" />;
  }
  return <StatusBadge status={tone} label={t(presentation.labelKey)} size="xs" />;
}
