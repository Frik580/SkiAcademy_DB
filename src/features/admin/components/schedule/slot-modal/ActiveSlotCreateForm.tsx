import {
  ADMIN_MODAL_CHOICE_CLASS,
  ADMIN_MODAL_FIELD_CLASS,
  ADMIN_MODAL_PRIMARY_CLASS,
  ADMIN_MODAL_SECONDARY_CLASS,
} from '../../adminModalStyles';
import {
  activeLessonLevels,
  resolveLessonLevel,
  formatLessonLevelLabel,
} from '@ski-academy/shared-domain';
import { useLessonLevelsStore } from '../../../../settings/lessonLevelsStore';
import React, { useState } from 'react';
import { Calendar, Check } from 'lucide-react';
import { ActionButton } from '../../../../../ui/ActionButton';
import type { Instructor, LessonDifficulty } from '../../../../../types';
import { useLanguage } from '../../../../../app/providers/LanguageContext';
import { formatDurationLabel } from '../../../../../lib/i18n/duration';
import { resolveInstructorHourlyRateKztForDisplay } from '../../../../../domain/pricing';
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
  const levels = useLessonLevelsStore((state) => state.levels);
  React.useEffect(() => {
    if (!resolveLessonLevel(bookingDifficulty, levels)?.isActive) {
      setBookingDifficulty(activeLessonLevels(levels)[0]?.id ?? '');
    }
  }, [bookingDifficulty, levels, setBookingDifficulty]);
  const [bookingIdentityReady, setBookingIdentityReady] = useState(false);
  const hourlyRateKzt = resolveInstructorHourlyRateKztForDisplay(instructor);
  const submitDisabled =
    isSlotActionSubmitting ||
    (modalTab === 'booking' &&
      (!instructor.isAvailable || !bookingIdentityReady || hourlyRateKzt === undefined));

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div
        className="flex gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-black/5 p-1"
        role="tablist"
      >
        {(['break', 'day_off', 'booking'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={modalTab === tab}
            onClick={() => setModalTab(tab)}
            className={`min-w-0 flex-1 rounded-[10px] px-1 py-2 text-center type-button transition-all cursor-pointer ${
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
            <label className="type-caption uppercase text-[var(--ink-dim)] block">
              {t('breakDuration')}
            </label>
            <select
              value={blockDuration}
              onChange={(event) => setBlockDuration(Number(event.target.value))}
              disabled={availableBreakDurations.length === 0}
              className={ADMIN_MODAL_CHOICE_CLASS}
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
            <label className="type-caption uppercase text-[var(--ink-dim)] block">
              {t('notesTitle')}
            </label>
            <input
              type="text"
              value={blockNotes}
              onChange={(event) => setBlockNotes(event.target.value)}
              placeholder={t('lunchBreakPlaceholder')}
              className={ADMIN_MODAL_FIELD_CLASS}
            />
          </div>
        </div>
      )}

      {modalTab === 'day_off' && (
        <div className="p-3 bg-black/10 border border-[var(--border)] type-caption text-[var(--ink-dim)] animate-fade-in space-y-2 rounded-none">
          <div className="type-caption text-[var(--ink)] flex items-center gap-1">
            <Calendar className="w-4 h-4 text-[var(--ink-dim)]" />
            {t('fullDayOff')}
          </div>
          <p>{t('fullDayOffDesc')}</p>
        </div>
      )}

      {modalTab === 'booking' && (
        <div className="space-y-3 animate-fade-in">
          {!instructor.isAvailable && (
            <div className="bg-rose-955/20 border border-rose-900/40 p-3 type-caption text-rose-400 rounded-none">
              <p className="font-bold">⚠️ {t('instructorUnavailableTitle')}</p>
              <p className="type-caption opacity-90 mt-0.5">
                {`${instructor.name} ${t('instructorUnavailableSlotDesc')}`}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="type-caption uppercase text-[var(--ink-dim)] block">
              {t('selectClient')}
            </span>
            <AdminManagedParticipantPicker
              appearance="booking"
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
              <label className="type-caption uppercase text-[var(--ink-dim)] block">
                {t('hoursLabel')}
              </label>
              <select
                value={bookingDuration}
                onChange={(event) => setBookingDuration(Number(event.target.value))}
                disabled={availableBookingDurations.length === 0}
                className={ADMIN_MODAL_CHOICE_CLASS}
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
              <label className="type-caption uppercase text-[var(--ink-dim)] block">
                {t('skillLevel')}
              </label>
              <select
                value={bookingDifficulty}
                onChange={(event) => setBookingDifficulty(event.target.value as LessonDifficulty)}
                className={ADMIN_MODAL_CHOICE_CLASS}
              >
                {activeLessonLevels(levels).map((level) => (
                  <option
                    key={level.id}
                    value={level.id}
                    className="bg-[var(--card-bg)] text-[var(--ink)]"
                  >
                    {formatLessonLevelLabel(level.id, language, levels)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="type-caption uppercase text-[var(--ink-dim)] block">
              {t('bookingNotesAdmin')}
            </label>
            <input
              type="text"
              value={bookingNotes}
              onChange={(event) => setBookingNotes(event.target.value)}
              placeholder={t('bookingNotesPlaceholder')}
              className={ADMIN_MODAL_FIELD_CLASS}
            />
          </div>
        </div>
      )}

      <div className="admin-modal-actions">
        <button type="button" onClick={onClose} className={ADMIN_MODAL_SECONDARY_CLASS}>
          {t('cancel')}
        </button>

        <ActionButton
          type="submit"
          pending={isSlotActionSubmitting}
          pendingLabel={t('saveSchedule')}
          disabled={submitDisabled}
          unstyled
          className={ADMIN_MODAL_PRIMARY_CLASS}
        >
          <Check className="w-4 h-4" />
          {t('saveSchedule')}
        </ActionButton>
      </div>
    </form>
  );
};
