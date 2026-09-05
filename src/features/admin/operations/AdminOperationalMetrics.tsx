import { BookOpen, BookOpenCheck, Users } from 'lucide-react';
import { useLanguage } from '../../../app/providers/LanguageContext';

interface AdminOperationalMetricsProps {
  readonly activeBookings: number;
  readonly completedBookings: number;
  readonly instructorsCount: number;
}

/** Operations-only booking counters. No finance overview / monetary_events. */
export function AdminOperationalMetrics({
  activeBookings,
  completedBookings,
  instructorsCount,
}: AdminOperationalMetricsProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink-dim)] font-bold">
        {t('financialOverview') || 'Финансовый обзор'}
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-transparent border border-[var(--border)] p-5 rounded-none flex items-center justify-between transition-colors duration-300">
          <div className="space-y-1.5">
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
              {t('activeLessons')}
            </span>
            <span className="text-2xl font-serif font-light text-[var(--ink)]">
              {activeBookings}
            </span>
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
    </div>
  );
}
