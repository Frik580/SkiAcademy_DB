import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Language, TranslationKey } from '../../lib/LanguageContext';

export type ScheduleViewMode = 'day' | 'week';

interface ScheduleToolbarProps {
  viewMode: ScheduleViewMode;
  selectedDate: string;
  weekStart: Date;
  weekEnd: Date;
  language: Language;
  t: (key: TranslationKey) => string;
  onViewModeChange: (viewMode: ScheduleViewMode) => void;
  onDateChange: (date: Date) => void;
  onAdjustDate: (days: number) => void;
  onToday: () => void;
}

export const ScheduleToolbar: React.FC<ScheduleToolbarProps> = ({
  viewMode,
  selectedDate,
  weekStart,
  weekEnd,
  language,
  t,
  onViewModeChange,
  onDateChange,
  onAdjustDate,
  onToday,
}) => (
  <div className="flex items-center gap-3 text-xs font-mono">
    <div className="flex items-center gap-1 border border-[var(--border)] p-1 rounded-none">
      <button
        onClick={() => onViewModeChange('day')}
        className={`px-2.5 py-1 text-xs font-mono rounded-none transition ${viewMode === 'day' ? 'bg-[var(--ink)] text-[var(--bg)]' : 'bg-transparent text-[var(--ink)]'}`}
      >
        {t('scheduleDay')}
      </button>
      <button
        onClick={() => onViewModeChange('week')}
        className={`px-2.5 py-1 text-xs font-mono rounded-none transition ${viewMode === 'week' ? 'bg-[var(--ink)] text-[var(--bg)]' : 'bg-transparent text-[var(--ink)]'}`}
      >
        {t('scheduleWeek')}
      </button>
    </div>

    <div className="flex items-center gap-1">
      <button
        onClick={() => onAdjustDate(-1)}
        className="p-1.5 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] transition cursor-pointer bg-transparent rounded-none"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {viewMode === 'day' ? (
        <input
          type="date"
          value={selectedDate}
          onChange={(event) => onDateChange(new Date(event.target.value))}
          className="px-2.5 py-1.5 bg-black/5 dark:bg-white/5 border border-[var(--border)] rounded-none text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
        />
      ) : (
        <div className="px-2.5 py-1.5 bg-black/5 dark:bg-white/5 border border-[var(--border)] rounded-none text-xs text-center text-[var(--ink)] w-48">
          {weekStart.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric' })} - {weekEnd.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      )}

      <button
        onClick={() => onAdjustDate(1)}
        className="p-1.5 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] transition cursor-pointer bg-transparent rounded-none"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <button
        onClick={onToday}
        className="px-2.5 py-1.5 text-xs border border-[var(--border)] text-[var(--ink)] hover:border-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer bg-transparent rounded-none"
      >
        {t('today')}
      </button>
    </div>
  </div>
);
