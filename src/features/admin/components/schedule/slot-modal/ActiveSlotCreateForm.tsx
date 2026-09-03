import React, { useState } from 'react';
import { Calendar, Check, Loader2 } from 'lucide-react';
import type { Instructor, LessonDifficulty } from '../../../../../types';
import { useLanguage } from '../../../../../app/providers/LanguageContext';
import { formatDurationLabel } from '../../../../../lib/i18n/duration';
import { AdminManagedParticipantPicker } from '../../../identity';
import type { AdminManagedParticipantSelection } from '../../../identity';
import type { AccountDirectoryOption } from '../../../identity/accountDirectorySearch';

interface ActiveSlotCreateFormProps {
  instructor: Instructor;
  modalTab: 'break' | 'day_off' | 'booking';
  setModalTab: (tab: 'break' | 'day_off' | 'booking') => void;
  blockDuration: number;
  setBlockDuration: (duration: number) => void;
  availableBreakDurations: number[];
  blockNotes: string;
  setBlockNotes: (notes: string) => void;
  createSelection: AdminManagedParticipantSelection | undefined;
  setCreateSelection: (selection: AdminManagedParticipantSelection | undefined) => void;
  onCreateAccountIdChange?: (accountId: string | undefined) => void;
  clientAccounts?: readonly AccountDirectoryOption[];
  bookingDuration: number;
  setBookingDuration: (duration: number) => void;
  availableBookingDurations: number[];
  bookingDifficulty: LessonDifficulty;
  setBookingDifficulty: (difficulty: LessonDifficulty) => void;
  bookingNotes: string;
  setBookingNotes: (notes: string) => void;
  isSlotActionSubmitting: boolean;
  onSubmit: (event: React.FormEvent) => Promise<void>;
  onClose: () => void;
}

export const ActiveSlotCreateForm: React.FC<ActiveSlotCreateFormProps> = ({
  instructor,
  modalTab,
  setModalTab,
  blockDuration,
  setBlockDuration,
  availableBreakDurations,
  blockNotes,
  setBlockNotes,
  createSelection,
  setCreateSelection,
  onCreateAccountIdChange,
  clientAccounts,
  bookingDuration,
  setBookingDuration,
  availableBookingDurations,
  bookingDifficulty,
  setBookingDifficulty,
  bookingNotes,
  setBookingNotes,
  isSlotActionSubmitting,
  onSubmit,
  onClose,
}) => {
  const { t, language } = useLanguage();
  const [bookingIdentityReady, setBookingIdentityReady] = useState(false);
  const submitDisabled =
    isSlotActionSubmitting ||
    (modalTab === 'booking' && (!instructor.isAvailable || !bookingIdentityReady));

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div
        className="flex gap-1 overflow-x-auto border border-[var(--border)] bg-black/10 p-1 [scrollbar-width:none]"
        role="tablist"
      >
        {(['break', 'day_off', 'booking'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={modalTab === tab}
            onClick={() => setModalTab(tab)}
            className={`min-w-24 flex-1 py-2 text-center text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer rounded-none ${
              modalTab === tab
                ? 'bg-[var(--ink)] text-[var(--bg)] font-bold'
                : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
          >
            {tab === 'break' && t('breakLabel')}
            {tab === 'day_off' && t('dayOffLabel')}
            {tab === 'booking' && t('lessonTab')}
          </button>
        ))}
      </div>

      {modalTab === 'break' && (
        <div className="space-y-3 animate-fade-in">
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
              {t('breakDuration')}
            </label>
            <select
              value={blockDuration}
              onChange={(event) => setBlockDuration(Number(event.target.value))}
              disabled={availableBreakDurations.length === 0}
              className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono disabled:opacity-60"
            >
              {availableBreakDurations.length === 0 ? (
                <option value="" className="bg-[var(--bg)] text-[var(--ink)]">
                  {t('noHoursAvailable')}
                </option>
              ) : (
                availableBreakDurations.map((duration: number) => (
                  <option
                    key={duration}
                    value={duration}
                    className="bg-[var(--bg)] text-[var(--ink)]"
                  >
                    {formatDurationLabel(duration, language === 'ru' ? 'ru' : 'en')}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
              {t('notesTitle')}
            </label>
            <input
              type="text"
              value={blockNotes}
              onChange={(event) => setBlockNotes(event.target.value)}
              placeholder={t('lunchBreakPlaceholder')}
              className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none"
            />
          </div>
        </div>
      )}

      {modalTab === 'day_off' && (
        <div className="p-3 bg-black/10 border border-[var(--border)] text-xs text-[var(--ink-dim)] leading-relaxed animate-fade-in space-y-2 rounded-none">
          <div className="font-serif text-xs font-light text-[var(--ink)] flex items-center gap-1">
            <Calendar className="w-4 h-4 text-[var(--ink-dim)]" />
            {t('fullDayOff')}
          </div>
          <p>{t('fullDayOffDesc')}</p>
        </div>
      )}

      {modalTab === 'booking' && (
        <div className="space-y-3 animate-fade-in">
          {!instructor.isAvailable && (
            <div className="bg-rose-955/20 border border-rose-900/40 p-3 text-xs text-rose-400 rounded-none font-mono">
              <p className="font-bold">⚠️ {t('instructorUnavailableTitle')}</p>
              <p className="text-[11px] opacity-90 mt-0.5">
                {`${instructor.name} ${t('instructorUnavailableSlotDesc')}`}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
              {t('selectClient')}
            </span>
            <AdminManagedParticipantPicker
              selected={createSelection}
              onChange={setCreateSelection}
              autoSelectUniqueSelf
              onAccountIdChange={onCreateAccountIdChange}
              onReadyChange={setBookingIdentityReady}
              additionalAccounts={clientAccounts}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                {t('hoursLabel')}
              </label>
              <select
                value={bookingDuration}
                onChange={(event) => setBookingDuration(Number(event.target.value))}
                disabled={availableBookingDurations.length === 0}
                className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono disabled:opacity-60"
              >
                {availableBookingDurations.length === 0 ? (
                  <option value="" className="bg-[var(--bg)] text-[var(--ink)]">
                    {t('noHoursAvailable')}
                  </option>
                ) : (
                  availableBookingDurations.map((duration: number) => (
                    <option
                      key={duration}
                      value={duration}
                      className="bg-[var(--bg)] text-[var(--ink)]"
                    >
                      {formatDurationLabel(duration, language === 'ru' ? 'ru' : 'en')}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                {t('skillLevel')}
              </label>
              <select
                value={bookingDifficulty}
                onChange={(event) => setBookingDifficulty(event.target.value as LessonDifficulty)}
                className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer"
              >
                <option value="beginner" className="bg-[var(--card-bg)] text-[var(--ink)]">
                  {t('difficultyBeginner')}
                </option>
                <option value="intermediate" className="bg-[var(--card-bg)] text-[var(--ink)]">
                  {t('difficultyIntermediate')}
                </option>
                <option value="advanced" className="bg-[var(--card-bg)] text-[var(--ink)]">
                  {t('difficultyAdvanced')}
                </option>
                <option value="freeride" className="bg-[var(--card-bg)] text-[var(--ink)]">
                  {t('difficultyFreeride')}
                </option>
                <option value="freestyle" className="bg-[var(--card-bg)] text-[var(--ink)]">
                  {t('difficultyFreestyle')}
                </option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
              {t('bookingNotesAdmin')}
            </label>
            <input
              type="text"
              value={bookingNotes}
              onChange={(event) => setBookingNotes(event.target.value)}
              placeholder={t('bookingNotesPlaceholder')}
              className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2.5 pt-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2 px-4 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center"
        >
          {t('cancel')}
        </button>

        <button
          type="submit"
          disabled={submitDisabled}
          className="flex-1 py-2 px-4 border border-[var(--border)] bg-[var(--ink)] hover:bg-transparent text-[var(--bg)] hover:text-[var(--ink)] disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer text-center"
        >
          {isSlotActionSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {t('saveSchedule')}
        </button>
      </div>
    </form>
  );
};
