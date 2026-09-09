import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock } from 'lucide-react';
import type { LessonBookingCabinetItem } from '../../lesson-bookings/lessonBookingContracts';
import { toLocalDateStr } from '../../../domain/availability';
import { resolveLessonStartTimeSelection } from '../../bookings/instructorOccupancyForBookingModal';
import { BookingAppleDatePicker } from '../../bookings/components/booking_modal/BookingAppleDatePicker';
import { BookingAppleWheelPicker } from '../../bookings/components/booking_modal/BookingAppleWheelPicker';
import { buildBookingTimePickerOptions } from '../../bookings/components/booking_modal/bookingTimePickerOptions';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { useBookingCollaborationTranslations } from '../useBookingCollaborationTranslations';
import { useRescheduleBookingAvailability } from '../useRescheduleBookingAvailability';

export interface RescheduleBookingModalProps {
  readonly booking: LessonBookingCabinetItem | null;
  readonly onClose: () => void;
  readonly onSubmit: (input: {
    readonly localDate: string;
    readonly localTime: string;
    readonly durationMinutes: number;
  }) => Promise<void>;
}

export const RescheduleBookingModal: React.FC<RescheduleBookingModalProps> = ({
  booking,
  onClose,
  onSubmit,
}) => {
  const copy = useBookingCollaborationTranslations();
  const { language } = useLanguage();
  const [localDate, setLocalDate] = useState('');
  const [localTime, setLocalTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const minBookingDateStr = useMemo(() => toLocalDateStr(), []);
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const labelStyle = 'mb-1.5 flex items-center gap-1.5 truncate text-xs text-[var(--ink-dim)]';

  useEffect(() => {
    if (!booking) return;
    setLocalDate(booking.date);
    setLocalTime(booking.time);
  }, [booking?.bookingId, booking?.date, booking?.time]);

  const { availableSlots, isLoadingBookings, occupancyLoadFailed } = useRescheduleBookingAvailability(
    {
      isOpen: booking !== null,
      instructorId: booking?.instructorId ?? '',
      localDate,
      durationHours: booking?.durationHours ?? 1,
      excludeBookingId: booking?.bookingId ?? '',
    }
  );

  const timeOptions = useMemo(
    () =>
      buildBookingTimePickerOptions({
        isLoadingBookings,
        occupancyLoadFailed,
        availableSlots,
        t: copy.t as (key: string) => string,
      }),
    [availableSlots, copy.t, isLoadingBookings, occupancyLoadFailed]
  );

  useEffect(() => {
    const nextTime = resolveLessonStartTimeSelection(localTime, availableSlots);
    if (nextTime !== localTime) {
      setLocalTime(nextTime);
    }
  }, [availableSlots, localTime]);

  if (!booking) return null;

  const canSubmit =
    !submitting &&
    !!localDate &&
    !!localTime &&
    !isLoadingBookings &&
    !occupancyLoadFailed &&
    availableSlots.includes(localTime);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--card-bg)] p-5 shadow-xl space-y-4">
        <h3 className="text-lg font-serif text-[var(--ink)]">{copy.rescheduleTitle}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelStyle}>
              <Calendar className="h-3.5 w-3.5" /> {copy.t('selectDate')}
            </label>
            <BookingAppleDatePicker
              value={localDate}
              onChange={setLocalDate}
              min={minBookingDateStr}
              locale={locale}
              placeholder={copy.t('selectDate')}
              aria-label={copy.t('selectDate')}
            />
          </div>
          <div>
            <label className={labelStyle}>
              <Clock className="h-3.5 w-3.5" /> {copy.t('collabSelectTime')}
            </label>
            <BookingAppleWheelPicker
              value={localTime}
              onChange={setLocalTime}
              options={timeOptions}
              disabled={isLoadingBookings || occupancyLoadFailed || availableSlots.length === 0}
              placeholder={
                isLoadingBookings
                  ? `${copy.t('loading')}...`
                  : occupancyLoadFailed
                    ? copy.t('instructorOccupancyLoadFailed')
                    : availableSlots.length === 0
                      ? copy.t('noSlotsAvailable')
                      : ''
              }
              aria-label={copy.t('collabSelectTime')}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--border-subtle)]"
          >
            {copy.t('cancel')}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmit({
                  localDate,
                  localTime,
                  durationMinutes: Math.round(booking.durationHours * 60),
                });
                onClose();
              } finally {
                setSubmitting(false);
              }
            }}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--accent)] text-white disabled:opacity-50"
          >
            {copy.rescheduleConfirm}
          </button>
        </div>
      </div>
    </div>
  );
};
