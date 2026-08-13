import React from 'react';
import { Sparkles, ShieldAlert, Wallet, Loader2 } from 'lucide-react';
import { useBookingModal } from './useBookingModal';
import { BookingSelectors } from './BookingSelectors';
import { BookingOverlapWarnings } from './BookingOverlapWarnings';
import { useCurrency } from '../../lib/CurrencyContext';

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
    availableSlots,
    minBookingDateStr,
    isTimeSlotOccupied,
    overlappingBooking,
    overlappingCourse,
    totalCost,
    userBalance,
    hasSufficientFunds,
    targetInstructor,
    userProfile,
    handleSubmit,
  } = workspace;

  if (!targetInstructor) return null;

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
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
        availableSlots={availableSlots}
        minBookingDateStr={minBookingDateStr}
        t={t}
        language={language}
        getDifficultyLabel={getDifficultyLabel}
        gapClass="gap-4"
      />

      <BookingOverlapWarnings
        isTimeSlotOccupied={isTimeSlotOccupied}
        overlappingBooking={overlappingBooking}
        overlappingCourse={overlappingCourse}
        targetInstructor={targetInstructor}
        t={t}
        language={language}
      />

      <div className="space-y-1">
        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
          {t('personalGoalsNotes')}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('personalGoalsPlaceholder')}
          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition h-16 resize-none rounded-none"
        />
      </div>

      <div className="bg-black/10 rounded-none p-4 border border-[var(--border)] space-y-2.5">
        <div className="flex justify-between text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider">
          <span>{t('hourlyRate')}:</span>
          <span className="font-bold text-[var(--ink)]">
            {formatPrice(targetInstructor.pricePerHour, targetInstructor.pricePerHourKZT)} /{' '}
            {t('hr')}
          </span>
        </div>
        <div className="flex justify-between text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider">
          <span>{t('hoursBooked')}</span>
          <span className="font-bold text-[var(--ink)]">x {duration}</span>
        </div>
        <div className="h-[1px] bg-[var(--border)]" />
        <div className="flex justify-between items-baseline pt-1">
          <span className="text-xs font-mono uppercase tracking-widest text-[var(--ink)]">
            {t('totalLessonFee')}
          </span>
          <span className="text-xl font-extrabold text-sky-600 dark:text-sky-400 font-mono">
            {formatPrice(
              totalCost,
              targetInstructor.pricePerHourKZT
                ? targetInstructor.pricePerHourKZT * duration
                : undefined
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-3 rounded-none border border-[var(--border)] text-xs bg-black/5">
        {userProfile?.isClientActive === false ? (
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-mono text-[10px] uppercase tracking-wider font-semibold">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>{t('bookingAccessRestricted')}</span>
          </div>
        ) : hasSufficientFunds ? (
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] uppercase tracking-wider">
            <Wallet className="w-3.5 h-3.5" />
            <span>
              {t('walletBalancePrefix')} <strong>{formatPrice(userBalance)}</strong>{' '}
              {t('walletSufficient')}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 w-full">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-mono text-[10px] uppercase tracking-wider font-medium">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t('insufficientCreditsPrefix')} <strong>{formatPrice(userBalance)}</strong>)
              </span>
            </div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-rose-600/90 dark:text-rose-400/90">
              {t('contactAdminForTopUp')}
            </p>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={
          isSubmitting ||
          !hasSufficientFunds ||
          isTimeSlotOccupied ||
          !targetInstructor.isAvailable ||
          userProfile?.isClientActive === false
        }
        className="btn-primary w-full py-3 flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('submitting')}
          </>
        ) : userProfile?.isClientActive === false ? (
          <>
            <ShieldAlert className="w-3.5 h-3.5" />
            {t('accessSuspended')}
          </>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5" />
            {t('payConfirmLesson').replace(
              '{amount}',
              formatPrice(
                totalCost,
                targetInstructor.pricePerHourKZT
                  ? targetInstructor.pricePerHourKZT * duration
                  : undefined
              )
            )}
          </>
        )}
      </button>
    </form>
  );
};
