import React from 'react';
import { useLanguage } from '../../../../lib/LanguageContext';
import { SUMMARY_STATS } from './constants';

export const AchievementGrid: React.FC<{
  isDark: boolean;
  visibleLevelCount: number;
}> = ({ isDark, visibleLevelCount }) => {
  const { t } = useLanguage();

  return (
    <ul
      className={`flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:gap-x-8 rounded-2xl border px-5 py-4 sm:px-8 transition-all duration-700 transform ${
        visibleLevelCount >= 4
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4 pointer-events-none'
      } ${
        isDark
          ? 'border-white/10 bg-black/30 text-white/70 backdrop-blur-[2px]'
          : 'border-black/8 bg-white/80 text-[var(--ink-dim)]'
      }`}
    >
      {SUMMARY_STATS.map(({ key, icon: Icon }) => (
        <li key={key} className="inline-flex items-center gap-2 text-xs sm:text-sm">
          <Icon
            className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-[#7ec8ff]' : 'text-[var(--accent)]'}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>{t(key)}</span>
        </li>
      ))}
    </ul>
  );
};
