import React from 'react';
import { Lock } from 'lucide-react';
import type { Instructor } from '../../../../types';
import type { Language, TranslationKey } from '../../../../app/providers/LanguageContext';
import { getSpecialtyLabel } from './scheduleUtils';

interface ScheduleInstructorCellProps {
  instructor: Instructor;
  language: Language;
  t: (key: TranslationKey) => string;
}

export const ScheduleInstructorCell: React.FC<ScheduleInstructorCellProps> = ({
  instructor,
  language,
  t,
}) => (
  <td
    className={`p-3 align-middle border-r border-[var(--border)] bg-black/5 dark:bg-white/5 ${!instructor.isAvailable ? 'opacity-75' : ''}`}
  >
    <div className="flex items-center gap-2 min-w-0">
      <div className="relative">
        <img
          src={instructor.avatarUrl}
          alt={instructor.name}
          className={`w-7 h-7 rounded-none border border-[var(--border)] object-cover shrink-0 ${!instructor.isAvailable ? 'grayscale opacity-60' : ''}`}
          referrerPolicy="no-referrer"
        />
        {!instructor.isAvailable && (
          <div className="absolute inset-0 bg-rose-955/20 border border-rose-500/30 flex items-center justify-center">
            <Lock className="w-2.5 h-2.5 text-rose-500" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div
          className={`text-xs font-bold truncate flex items-center gap-1 ${!instructor.isAvailable ? 'text-[var(--ink-dim)] line-through' : 'text-[var(--ink)]'}`}
        >
          {instructor.name}
        </div>
        <div className="text-[9px] text-[var(--ink-dim)] font-mono capitalize truncate flex items-center gap-1">
          {!instructor.isAvailable ? (
            <span className="text-rose-500 font-bold uppercase tracking-wider text-[8px]">
              {t('unavailableLabel')}
            </span>
          ) : (
            `${getSpecialtyLabel(instructor.specialty, language)} • $${instructor.pricePerHour}/h`
          )}
        </div>
      </div>
    </div>
  </td>
);
