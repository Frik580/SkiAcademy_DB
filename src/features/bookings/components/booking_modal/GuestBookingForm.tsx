import React from 'react';
import { User, Phone, Mail, Send, Loader2 } from 'lucide-react';
import { useBookingModal } from './useBookingModal';
import { BookingSelectors } from './BookingSelectors';
import { BOOKING_NOTES_FIELD_CLASS } from './bookingAppleFieldStyles';
import { useCurrency } from '../../../../app/providers/CurrencyContext';

interface GuestBookingFormProps {
  workspace: ReturnType<typeof useBookingModal>;
}

export const GuestBookingForm: React.FC<GuestBookingFormProps> = ({ workspace }) => {
  const { formatPrice } = useCurrency();
  const {
    t,
    language,
    getDifficultyLabel,
    date,
    setDate,
    time,
    setTime,
    duration,
    setDuration,
    difficulty,
    setDifficulty,
    notes,
    setNotes,
    isSubmitting,
    guestName,
    setGuestName,
    guestPhone,
    setGuestPhone,
    guestEmail,
    setGuestEmail,
    isLoadingBookings,
    occupancyLoadFailed,
    availableSlots,
    minBookingDateStr,
    isTimeSlotOccupied,
    totalCost,
    targetInstructor,
    handleSubmitGuest,
  } = workspace;

  const fieldClass =
    'ui-field-plain focus:outline-none focus:border-[var(--ink)] focus:border-[var(--accent)]';

  const labelStyle = 'flex items-center gap-1.5 text-xs text-[var(--ink-dim)] mb-1';

  const totalFormatted = formatPrice(
    totalCost,
    targetInstructor?.pricePerHourKZT ? targetInstructor.pricePerHourKZT * duration : undefined
  );

  return (
    <form onSubmit={handleSubmitGuest} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--accent-muted)] p-3 text-xs leading-relaxed text-[var(--ink)]">
          {t('guestBookingNotice')}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 items-end gap-2.5">
            <div className="flex flex-col justify-end">
              <label className={`${labelStyle} min-h-[20px]`}>
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('guestNameLabel')} *</span>
              </label>
              <input
                type="text"
                required
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder={t('guestNamePlaceholder')}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col justify-end">
              <label className={`${labelStyle} min-h-[20px]`}>
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('guestPhoneLabel')} *</span>
              </label>
              <input
                type="tel"
                required
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder={t('guestPhonePlaceholder')}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className={labelStyle}>
              <Mail className="h-3.5 w-3.5" /> {t('guestEmailLabel')}
            </label>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder={t('guestEmailPlaceholder')}
              className={fieldClass}
            />
          </div>
        </div>

        <BookingSelectors
          date={date}
          setDate={setDate}
          time={time}
          setTime={setTime}
          duration={duration}
          setDuration={setDuration}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          isLoadingBookings={isLoadingBookings}
          occupancyLoadFailed={occupancyLoadFailed}
          availableSlots={availableSlots}
          minBookingDateStr={minBookingDateStr}
          t={t}
          language={language}
          getDifficultyLabel={getDifficultyLabel}
          gapClass="gap-2.5"
        />

        <div>
          <label className={labelStyle}>{t('personalGoalsNotes')}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('personalGoalsPlaceholder')}
            rows={2}
            className={BOOKING_NOTES_FIELD_CLASS}
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--card-bg)] px-4 pb-4 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-[var(--ink)]">{t('totalLessonFee')}</span>
          <span className="text-lg font-extrabold text-[var(--accent)]">{totalFormatted}</span>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || isTimeSlotOccupied || !targetInstructor?.isAvailable}
          className="btn-primary flex w-full items-center justify-center gap-2 py-3"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('submitting')}
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              {t('submitGuestApplication')}
            </>
          )}
        </button>
      </div>
    </form>
  );
};
