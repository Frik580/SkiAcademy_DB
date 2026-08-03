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

  return (
    <form onSubmit={handleSubmitGuest} className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/30 p-3 text-[11px] font-mono text-amber-700 dark:text-amber-300 leading-relaxed">
        💡 {t('guestBookingNotice')}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1">
            <User className="w-3 h-3" /> {t('guestNameLabel')} *
          </label>
          <input
            type="text"
            required
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder={t('guestNamePlaceholder')}
            className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-sans"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1">
            <Phone className="w-3 h-3" /> {t('guestPhoneLabel')} *
          </label>
          <input
            type="tel"
            required
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            placeholder={t('guestPhonePlaceholder')}
            className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-mono"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1">
          <Mail className="w-3 h-3" /> {t('guestEmailLabel')}
        </label>
        <input
          type="email"
          value={guestEmail}
          onChange={(e) => setGuestEmail(e.target.value)}
          placeholder={t('guestEmailPlaceholder')}
          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-mono"
        />
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
        availableSlots={availableSlots}
        minBookingDateStr={minBookingDateStr}
        t={t}
        language={language}
        getDifficultyLabel={getDifficultyLabel}
        gapClass="gap-3"
      />

      <div className="space-y-1">
        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
          {t('personalGoalsNotes')}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('personalGoalsPlaceholder')}
          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition h-14 resize-none rounded-none"
        />
      </div>

      <div className="bg-black/10 rounded-none p-3 border border-[var(--border)] space-y-1.5">
        <div className="flex justify-between items-baseline">
          <span className="text-xs font-mono uppercase tracking-widest text-[var(--ink)]">
            {t('totalLessonFee')}
          </span>
          <span className="text-lg font-extrabold text-sky-600 dark:text-sky-400 font-mono">
            ${totalCost}
          </span>
        </div>
      </div>

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
