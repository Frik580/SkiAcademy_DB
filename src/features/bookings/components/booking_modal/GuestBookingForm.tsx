import React from 'react';
import { User, Phone, Mail, Send, Loader2 } from 'lucide-react';
import { useBookingModal } from './useBookingModal';
import { BookingSelectors } from './BookingSelectors';

interface GuestBookingFormProps {
  workspace: ReturnType<typeof useBookingModal>;
}

export const GuestBookingForm: React.FC<GuestBookingFormProps> = ({ workspace }) => {
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
    availableSlots,
    minBookingDateStr,
    isTimeSlotOccupied,
    totalCost,
    targetInstructor,
    handleSubmitGuest,
  } = workspace;

  const fieldClass =
    'ui-field-plain focus:outline-none focus:border-[var(--ink)] focus:border-[var(--accent)]';

  const labelStyle =
    'uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5 mb-1 font-sans text-xs';

  return (
    <form onSubmit={handleSubmitGuest} className="space-y-4">
      {/* Notice matching Auth style */}
      <div className="p-3 bg-[var(--accent-muted)] border border-[var(--border)] text-xs text-[var(--ink)] leading-relaxed rounded-none rounded-[var(--radius-md)]">
        💡 {t('guestBookingNotice')}
      </div>

      {/* Contact Info Group */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 items-end">
          <div className="flex flex-col justify-end">
            <label className={`${labelStyle} min-h-[20px]`}>
              <User className="w-3.5 h-3.5 shrink-0" />{' '}
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
              <Phone className="w-3.5 h-3.5 shrink-0" />{' '}
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
            <Mail className="w-3.5 h-3.5" /> {t('guestEmailLabel')}
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

      {/* Booking Selectors */}
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
        gapClass="gap-3"
      />

      {/* Notes */}
      <div>
        <label className={labelStyle}>{t('personalGoalsNotes')}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('personalGoalsPlaceholder')}
          className={`${fieldClass} h-16 resize-none`}
        />
      </div>

      {/* Total Price Card */}
      <div className="p-3.5 border border-[var(--border)] bg-black/5 dark:bg-white/5 rounded-none rounded-[var(--radius-md)] flex items-center justify-between">
        <span className="text-xs text-[var(--ink)] font-sans normal-case text-sm">
          {t('totalLessonFee')}
        </span>
        <span className="text-lg font-extrabold text-[var(--accent)] font-sans">
          ${totalCost}
        </span>
      </div>

      {/* Primary Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting || isTimeSlotOccupied || !targetInstructor?.isAvailable}
        className="btn-primary w-full py-3 flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('submitting')}
          </>
        ) : (
          <>
            <Send className="w-3.5 h-3.5" />
            {t('submitGuestApplication')}
          </>
        )}
      </button>
    </form>
  );
};
