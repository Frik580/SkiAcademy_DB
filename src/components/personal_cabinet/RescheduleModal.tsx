import React from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import { Skeleton } from '../ui/Skeleton';
import { BodyScrollLock } from '../ui/BodyScrollLock';

interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  newDate: string;
  setNewDate: (value: string) => void;
  newTime: string;
  setNewTime: (value: string) => void;
  availableSlots: string[];
  isLoadingSlots: boolean;
  isSubmitting: boolean;
  minDate: string;
  onSubmit: (e: React.FormEvent) => void;
}

export const RescheduleModal: React.FC<RescheduleModalProps> = ({
  isOpen,
  onClose,
  newDate,
  setNewDate,
  newTime,
  setNewTime,
  availableSlots,
  isLoadingSlots,
  isSubmitting,
  minDate,
  onSubmit,
}) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return createPortal(
    <div className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <BodyScrollLock />
      <div className="ui-modal shadow-2xl w-full max-w-sm max-h-[80vh] overflow-y-auto relative rounded-2xl bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)] m-auto">
        <div className="flex justify-between items-center p-4 border-b border-[var(--border)] bg-black/5 dark:bg-white/5">
          <h4 className="font-serif text-sm font-light text-[var(--ink)]">
            {t('rescheduleCoaching')}
          </h4>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--profile-bg)] transition-colors text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer z-10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
              {t('newDate').toUpperCase()}
            </label>
            <input
              type="date"
              required
              min={minDate}
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full px-3 py-2 rounded-none border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
              {t('newTime').toUpperCase()}
            </label>
            {isLoadingSlots ? (
              <Skeleton className="h-9 w-full rounded-none" />
            ) : availableSlots.length === 0 ? (
              <div className="text-xs text-rose-400 font-mono py-2.5 px-3 bg-rose-955/20 rounded-none border border-rose-900/40">
                ⚠️ {t('noAvailableSlots')}
              </div>
            ) : (
              <select
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-full px-3 py-2 rounded-none border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer"
              >
                {availableSlots.map((slot) => (
                  <option key={slot} value={slot} className="bg-[var(--card-bg)] text-[var(--ink)]">
                    {slot}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isLoadingSlots || availableSlots.length === 0}
            className="w-full py-2.5 border border-[var(--border)] bg-transparent hover:border-[var(--ink)] hover:bg-black/5 disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              t('confirmRescheduling')
            )}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};
