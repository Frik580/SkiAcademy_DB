import React from 'react';
import { BookOpen, BookOpenCheck, DollarSign, Users } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';

interface FinancialOverviewProps {
  totalRevenue: number;
  activeBookings: number;
  completedBookings: number;
  instructorsCount: number;
}

export const FinancialOverview: React.FC<FinancialOverviewProps> = ({
  totalRevenue,
  activeBookings,
  completedBookings,
  instructorsCount,
}) => {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-transparent border border-[var(--border)] p-5 rounded-none flex items-center justify-between transition-colors duration-300">
        <div className="space-y-1.5">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
            {t('totalRevenue')}
          </span>
          <span className="text-2xl font-serif font-light text-[var(--ink)]">${totalRevenue}</span>
        </div>
        <div className="w-10 h-10 border border-[var(--border)] rounded-none flex items-center justify-center text-[var(--ink)] bg-black/5 dark:bg-white/5">
          <DollarSign className="w-4 h-4" />
        </div>
      </div>

      <div className="bg-transparent border border-[var(--border)] p-5 rounded-none flex items-center justify-between transition-colors duration-300">
        <div className="space-y-1.5">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
            {t('activeLessons')}
          </span>
          <span className="text-2xl font-serif font-light text-[var(--ink)]">{activeBookings}</span>
        </div>
        <div className="w-10 h-10 border border-[var(--border)] rounded-none flex items-center justify-center text-[var(--ink)] bg-black/5 dark:bg-white/5">
          <BookOpen className="w-4 h-4" />
        </div>
      </div>

      <div className="bg-transparent border border-[var(--border)] p-5 rounded-none flex items-center justify-between transition-colors duration-300">
        <div className="space-y-1.5">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
            {t('completedLessons')}
          </span>
          <span className="text-2xl font-serif font-light text-[var(--ink)]">
            {completedBookings}
          </span>
        </div>
        <div className="w-10 h-10 border border-[var(--border)] rounded-none flex items-center justify-center text-[var(--ink)] bg-black/5 dark:bg-white/5">
          <BookOpenCheck className="w-4 h-4" />
        </div>
      </div>

      <div className="bg-transparent border border-[var(--border)] p-5 rounded-none flex items-center justify-between transition-colors duration-300">
        <div className="space-y-1.5">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
            {t('allGuidesCount')}
          </span>
          <span className="text-2xl font-serif font-light text-[var(--ink)]">
            {instructorsCount}
          </span>
        </div>
        <div className="w-10 h-10 border border-[var(--border)] rounded-none flex items-center justify-center text-[var(--ink)] bg-black/5 dark:bg-white/5">
          <Users className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};
