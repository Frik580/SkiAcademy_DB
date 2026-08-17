import React from 'react';
import { useLanguage } from '../../../lib/LanguageContext';
import { formatPointsCount } from '../../../lib/i18n/pluralize';

export const TrainingStreak: React.FC<{
  isDark: boolean;
  xpToNextLevel: { remaining: number; isMax: true } | { remaining: number; isMax: false };
}> = ({ isDark, xpToNextLevel }) => {
  const { t, language } = useLanguage();

  return (
    <p
      className={`text-sm sm:text-base leading-relaxed ${
        isDark ? 'text-white/70' : 'text-[var(--ink-dim)]'
      }`}
    >
      {xpToNextLevel.isMax ? (
        t('journeyMaxLevelReached')
      ) : (
        <>
          {t('scPointsToNextLevel')
            .replace('{pointsLabel}', `§${formatPointsCount(xpToNextLevel.remaining, language)}§`)
            .split('§')
            .map((part, i) =>
              i % 2 === 1 ? (
                <span
                  key={i}
                  className={`font-semibold tabular-nums ${
                    isDark ? 'text-[#f5d76e]' : 'text-[#b8860b]'
                  }`}
                >
                  {part}
                </span>
              ) : (
                <React.Fragment key={i}>{part}</React.Fragment>
              )
            )}
        </>
      )}
    </p>
  );
};
