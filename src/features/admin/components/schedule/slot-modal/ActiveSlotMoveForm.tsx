import React from 'react';
import { Check, Loader2, Trash2 } from 'lucide-react';
import type { Booking, Instructor } from '../../../../../types';
import { useLanguage } from '../../../../../app/providers/LanguageContext';
import { formatDurationLabel } from '../../../../../lib/i18n/duration';

interface ActiveSlotMoveFormProps {
  booking: Booking;
  canReassignInstructor: boolean;
  canChangeDuration: boolean;
  canCompleteLesson: boolean;
  newInstructorId: string;
  setNewInstructorId: (id: string) => void;
  availableInstructors: Instructor[];
  newMoveDate: string;
  setNewMoveDate: (date: string) => void;
  newMoveTime: string;
  setNewMoveTime: (time: string) => void;
  newMoveDuration: number;
  setNewMoveDuration: (duration: number) => void;
  availableMoveTimeSlots: string[];
  availableMoveDurations: number[];
  isSlotActionSubmitting: boolean;
  onCompleteBooking?: (id: string) => Promise<void>;
  onOpenLessonDetail?: (bookingId: string) => void;
  onDeleteRequest: (id: string) => void;
  onSubmit: (event: React.FormEvent) => Promise<void>;
  onClose: () => void;
}

export const ActiveSlotMoveForm: React.FC<ActiveSlotMoveFormProps> = ({
  booking,
  canReassignInstructor,
  canChangeDuration,
  canCompleteLesson,
  newInstructorId,
  setNewInstructorId,
  availableInstructors,
  newMoveDate,
  setNewMoveDate,
  newMoveTime,
  setNewMoveTime,
  newMoveDuration,
  setNewMoveDuration,
  availableMoveTimeSlots,
  availableMoveDurations,
  isSlotActionSubmitting,
  onCompleteBooking,
  onOpenLessonDetail,
  onDeleteRequest,
  onSubmit,
  onClose,
}) => {
  const { t, language } = useLanguage();

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-3">
        <h5 className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
          {t('rescheduleMove')}
        </h5>

        {canReassignInstructor && (
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
              {t('reassignInstructor')}
            </label>
            <select
              value={newInstructorId}
              onChange={(event) => setNewInstructorId(event.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono"
            >
              {availableInstructors.map((instructor) => (
                <option
                  key={instructor.id}
                  value={instructor.id}
                  className="bg-[var(--bg)] text-[var(--ink)]"
                >
                  {instructor.name}
                  {!instructor.isAvailable ? ` (${t('unavailableLabel')})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
              {t('selectDate')}
            </label>
            <input
              type="date"
              required
              value={newMoveDate}
              onChange={(event) => setNewMoveDate(event.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
              {t('newStartTime')}
            </label>
            <select
              required
              value={newMoveTime}
              onChange={(event) => setNewMoveTime(event.target.value)}
              disabled={availableMoveTimeSlots.length === 0}
              className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono disabled:opacity-60"
            >
              {availableMoveTimeSlots.length === 0 ? (
                <option value="" className="bg-[var(--bg)] text-[var(--ink)]">
                  {t('noSlotsAvailable')}
                </option>
              ) : (
                availableMoveTimeSlots.map((time: string) => (
                  <option key={time} value={time} className="bg-[var(--bg)] text-[var(--ink)]">
                    {time}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {canChangeDuration && (
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
              {t('hoursLabel')}
            </label>
            <select
              aria-label={t('hoursLabel')}
              value={newMoveDuration}
              onChange={(event) => setNewMoveDuration(Number(event.target.value))}
              disabled={availableMoveDurations.length === 0}
              className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono disabled:opacity-60"
            >
              {availableMoveDurations.length === 0 ? (
                <option value="" className="bg-[var(--bg)] text-[var(--ink)]">
                  {t('noHoursAvailable')}
                </option>
              ) : (
                availableMoveDurations.map((duration: number) => (
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
        )}
      </div>

      {canCompleteLesson && (
        <button
          type="button"
          onClick={async () => {
            if (onCompleteBooking) {
              await onCompleteBooking(booking.id);
              onClose();
            }
          }}
          disabled={isSlotActionSubmitting}
          className="w-full py-2.5 border border-emerald-900/40 bg-emerald-950/20 hover:bg-emerald-955/40 hover:border-emerald-500 text-emerald-400 rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer mb-2"
        >
          <Check className="w-4 h-4" />
          {t('markLessonCompleted')}
        </button>
      )}

      {onOpenLessonDetail && (
        <button
          type="button"
          aria-label={t('openLessonDetail')}
          onClick={() => {
            onOpenLessonDetail(booking.id);
            onClose();
          }}
          className="w-full py-2.5 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer"
        >
          {t('openLessonDetail')}
        </button>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={() => onDeleteRequest(booking.id)}
          className="flex-1 py-2.5 border border-rose-900/40 bg-rose-955/20 hover:bg-rose-955/40 hover:border-rose-500 text-rose-400 rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          {t('deleteCancelBlock')}
        </button>

        <button
          type="submit"
          disabled={isSlotActionSubmitting}
          className="flex-1 py-2 px-3 border border-[var(--border)] bg-[var(--ink)] hover:bg-transparent text-[var(--bg)] hover:text-[var(--ink)] disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
        >
          {isSlotActionSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {t('applyMove')}
        </button>
      </div>
    </form>
  );
};
