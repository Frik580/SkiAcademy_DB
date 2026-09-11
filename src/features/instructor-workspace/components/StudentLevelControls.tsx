import React from 'react';
import { type TranslationKey } from '../../../app/providers/LanguageContext';

interface StudentLevelControlsProps {
  level: number;
  theme: string;
  t: (key: TranslationKey) => string;
  badgeTitleKey: TranslationKey;
  selectLabelKey?: TranslationKey;
  badgeLabelKey?: TranslationKey;
  showSetLevelLabel?: boolean;
  disabled?: boolean;
  selectAriaLabel?: string;
  onChange: (newLevel: number) => void;
}

export const StudentLevelControls: React.FC<StudentLevelControlsProps> = ({
  level,
  theme,
  t,
  badgeTitleKey,
  selectLabelKey = 'instructorLevel',
  badgeLabelKey = 'instructorLevelShort',
  showSetLevelLabel = false,
  disabled = false,
  selectAriaLabel,
  onChange,
}) => {
  const studentLevel = level || 1;

  const select = (
    <select
      value={studentLevel}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
      aria-label={selectAriaLabel}
      className="text-[9px] font-mono bg-white dark:bg-slate-900 text-[var(--ink)] border border-slate-200 dark:border-slate-700 rounded-xs px-1.5 py-0.5 focus:outline-none focus:ring-1 ring-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value={1}>{t(selectLabelKey)} 1</option>
      <option value={2}>{t(selectLabelKey)} 2</option>
      <option value={3}>{t(selectLabelKey)} 3</option>
      <option value={4}>{t(selectLabelKey)} 4</option>
    </select>
  );

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-xs"
        title={`${t(badgeTitleKey)}: ${studentLevel}`}
      >
        <img
          key={`${theme}-${studentLevel}`}
          src={`https://storage.yandexcloud.net/carve/level/${theme === 'light' ? 'b' : 'w'}/${studentLevel}.png`}
          alt={`Level ${studentLevel}`}
          className="w-4 h-4 object-contain shrink-0"
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            e.currentTarget.style.display = 'block';
          }}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <span className="text-[9px] font-mono font-bold text-[var(--ink)]">
          {t(badgeLabelKey)} {studentLevel}
        </span>
      </div>

      {showSetLevelLabel ? (
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-mono text-[var(--ink-dim)] uppercase tracking-wider hidden sm:inline">
            {t('instructorSetLevel')}
          </span>
          {select}
        </div>
      ) : (
        select
      )}
    </div>
  );
};
