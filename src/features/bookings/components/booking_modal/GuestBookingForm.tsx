import React from 'react';
import { User, Phone, Mail, Send } from 'lucide-react';
import { useBookingModal } from './useBookingModal';
import { BookingSelectors } from './BookingSelectors';
import { BOOKING_NOTES_FIELD_CLASS } from './bookingAppleFieldStyles';
import { useCurrency } from '../../../../app/providers/CurrencyContext';
import { ActionButton } from '../../../../ui/ActionButton';
import { GuestReservationLimitAlert } from '../../../../ui/GuestReservationLimitAlert';
import { resolveInstructorHourlyRateKztForDisplay } from '../../../../domain/pricing';

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
    guestQuotaError,
    guestName,
    setGuestName,
    guestPhone,
    setGuestPhone,
    guestEmail,
    setGuestEmail,
    showGuestOptionalDetails,
    setShowGuestOptionalDetails,
    guestDiscipline,
    setGuestDiscipline,
    isLoadingBookings,
    occupancyLoadFailed,
    availableSlots,
    minBookingDateStr,
    isTimeSlotOccupied,
    targetInstructor,
    handleSubmitGuest,
    checkPreviousGuestStatus,
    previousGuestReservationId,
    guestRefreshing,
    guestLookupError,
  } = workspace;

  const fieldClass =
    'ui-field-plain focus:outline-none focus:border-[var(--ink)] focus:border-[var(--accent)]';

  const labelStyle = 'flex items-center gap-1.5 text-xs text-[var(--ink-dim)] mb-1';

  const hourlyRateKzt = targetInstructor
    ? resolveInstructorHourlyRateKztForDisplay(targetInstructor)
    : undefined;
  const totalFormatted = hourlyRateKzt === undefined ? '—' : formatPrice(hourlyRateKzt * duration);

  return (
    <form onSubmit={handleSubmitGuest} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        {previousGuestReservationId && (
          <button
            type="button"
            onClick={() => void checkPreviousGuestStatus()}
            disabled={guestRefreshing}
            className="text-xs text-[var(--ink-dim)] underline-offset-2 hover:underline"
          >
            {guestRefreshing ? t('processing') : t('guestHaveRequest')}
          </button>
        )}
        {guestLookupError && (
          <p role="status" className="text-sm text-[var(--ink)]">
            {t(
              guestLookupError === 'stale' ? 'guestPreviousUnavailable' : 'guestStatusRefreshFailed'
            )}
          </p>
        )}
        <div className="space-y-3">
          <div className="grid grid-cols-1 items-end gap-2.5 sm:grid-cols-2">
            <div className="flex flex-col justify-end">
              <label htmlFor="guest-lesson-name" className={`${labelStyle} min-h-[20px]`}>
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('guestCourseNameLabel')} *</span>
              </label>
              <input
                id="guest-lesson-name"
                type="text"
                required
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder={t('guestNamePlaceholder')}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col justify-end">
              <label htmlFor="guest-lesson-phone" className={`${labelStyle} min-h-[20px]`}>
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('guestCoursePhoneLabel')} *</span>
              </label>
              <input
                id="guest-lesson-phone"
                type="tel"
                required
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder={t('guestPhonePlaceholder')}
                className={fieldClass}
              />
            </div>
          </div>
        </div>

        <label className="block space-y-1 text-xs text-[var(--ink-dim)]">
          <span>{t('participantsDisciplineLabel')} *</span>
          <select
            required
            value={guestDiscipline}
            onChange={(e) => setGuestDiscipline(e.target.value as typeof guestDiscipline)}
            className={fieldClass}
          >
            <option value="" disabled>
              —
            </option>
            <option value="ski">{t('participantsDisciplineSki')}</option>
            <option value="snowboard">{t('participantsDisciplineSnowboard')}</option>
          </select>
        </label>

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
          showDifficulty={false}
        />

        <button
          type="button"
          aria-expanded={showGuestOptionalDetails}
          aria-controls="guest-lesson-optional"
          onClick={() => setShowGuestOptionalDetails(!showGuestOptionalDetails)}
          className="text-left text-xs text-[var(--ink-dim)] underline-offset-2 hover:underline"
        >
          {t('guestCourseAddOptionalDetails')}
        </button>
        {showGuestOptionalDetails && (
          <div id="guest-lesson-optional" className="space-y-3">
            <label className="block space-y-1 text-xs text-[var(--ink-dim)]">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {t('guestCourseEmailLabel')} · {t('guestOptional')}
              </span>
              <input
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder={t('guestEmailPlaceholder')}
                className={fieldClass}
              />
            </label>
            <label className="block space-y-1 text-xs text-[var(--ink-dim)]">
              <span>
                {t('guestCourseCommentLabel')} · {t('guestOptional')}
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                placeholder={t('personalGoalsPlaceholder')}
                rows={2}
                className={BOOKING_NOTES_FIELD_CLASS}
              />
            </label>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--card-bg)] px-4 pb-4 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-[var(--ink)]">{t('guestTotal')}</span>
          <span className="text-lg font-extrabold text-[var(--accent)]">{totalFormatted}</span>
        </div>

        {guestQuotaError && (
          <div className="mb-3">
            <GuestReservationLimitAlert
              title={t('guestReservationLimitTitle')}
              description={t('guestReservationLimit')}
            />
          </div>
        )}

        <ActionButton
          type="submit"
          pending={isSubmitting}
          pendingLabel={t('submitting')}
          disabled={
            isTimeSlotOccupied || !targetInstructor?.isAvailable || hourlyRateKzt === undefined
          }
          className="btn-primary w-full py-3"
        >
          <Send className="h-3.5 w-3.5" />
          {t('submitGuestCourseApplicationShort')}
        </ActionButton>
        <p className="mt-2 text-center text-[11px] text-[var(--ink-dim)]">
          {t('guestCoursePaymentNote')}
        </p>
      </div>
    </form>
  );
};
