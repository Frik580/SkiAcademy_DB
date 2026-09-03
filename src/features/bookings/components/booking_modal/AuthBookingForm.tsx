import React from 'react';
import { Sparkles, ShieldAlert, Loader2 } from 'lucide-react';
import { useBookingModal } from './useBookingModal';
import { BookingSelectors } from './BookingSelectors';
import { BookingOverlapWarnings } from './BookingOverlapWarnings';
import { BookingPriceAccordion } from './BookingPriceAccordion';
import { ParticipantPicker } from '../../../participants/components/ParticipantPicker';
import { BOOKING_NOTES_FIELD_CLASS } from './bookingAppleFieldStyles';
import { useCurrency } from '../../../../app/providers/CurrencyContext';
import { isAuthenticatedBookingSubmitDisabled } from './authBookingState';

interface AuthBookingFormProps {
  workspace: ReturnType<typeof useBookingModal>;
}

export const AuthBookingForm: React.FC<AuthBookingFormProps> = ({ workspace }) => {
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
    isLoadingBookings,
    occupancyLoadFailed,
    availableSlots,
    minBookingDateStr,
    isTimeSlotOccupied,
    overlappingBooking,
    overlappingCourse,
    totalCost,
    managedParticipants,
    managedParticipantsLoading,
    managedParticipantsError,
    reloadManagedParticipants,
    selectedParticipantIds,
    toggleParticipant,
    targetInstructor,
    userProfile,
    handleSubmit,
  } = workspace;

  if (!targetInstructor) return null;

  const totalFormatted = formatPrice(
    totalCost,
    targetInstructor.pricePerHourKZT ? targetInstructor.pricePerHourKZT * duration : undefined
  );

  const hourlyRateLabel = `${formatPrice(targetInstructor.pricePerHour, targetInstructor.pricePerHourKZT)} / ${t('hr')}`;

  const isSubmitDisabled = isAuthenticatedBookingSubmitDisabled({
    isSubmitting,
    isTimeSlotOccupied,
    instructorAvailable: targetInstructor.isAvailable,
    clientActive: userProfile?.isClientActive !== false,
    selectedParticipantCount: selectedParticipantIds.length,
  });

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
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

        <BookingOverlapWarnings
          isTimeSlotOccupied={isTimeSlotOccupied}
          overlappingBooking={overlappingBooking}
          overlappingCourse={overlappingCourse}
          targetInstructor={targetInstructor}
          t={t}
          language={language}
        />

        <ParticipantPicker
          participants={managedParticipants}
          selectedParticipantIds={selectedParticipantIds}
          onToggleParticipant={toggleParticipant}
          loading={managedParticipantsLoading}
          error={managedParticipantsError}
          onRetry={() => void reloadManagedParticipants()}
          t={t as (key: string) => string}
        />

        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-xs text-[var(--ink-dim)]">
            {t('personalGoalsNotes')}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('personalGoalsPlaceholder')}
            rows={2}
            className={BOOKING_NOTES_FIELD_CLASS}
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--card-bg)]">
        <BookingPriceAccordion
          hourlyRateLabel={hourlyRateLabel}
          duration={duration}
          totalLabel={totalFormatted}
          t={t}
        />

        <div className="space-y-2.5 px-4 pb-4 pt-3">
          {userProfile?.isClientActive === false ? (
            <div className="flex items-center gap-2 text-xs font-medium text-rose-600 dark:text-rose-400">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              <span>{t('bookingAccessRestricted')}</span>
            </div>
          ) : (
            <p className="text-xs text-[var(--ink-dim)]">
              Payment is confirmed server-side when you submit.
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="btn-primary flex w-full items-center justify-center gap-2 py-3"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('submitting')}
              </>
            ) : userProfile?.isClientActive === false ? (
              <>
                <ShieldAlert className="h-3.5 w-3.5" />
                {t('accessSuspended')}
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {t('payConfirmLesson').replace('{amount}', totalFormatted)}
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
};
