import React from 'react';
import { User, Star } from 'lucide-react';
import { translateInstructorName } from '../../lib/LanguageContext';
import { useInstructorWorkspace } from './useInstructorWorkspace';

interface InstructorDashboardHeaderProps {
  workspace: ReturnType<typeof useInstructorWorkspace>;
}

export const InstructorDashboardHeader: React.FC<InstructorDashboardHeaderProps> = ({
  workspace,
}) => {
  const { t, language, linkedInstructor, stats, userProfile } = workspace;

  return (
    <div className="space-y-8">
      {/* Active Profile Header */}
      <div className="border border-slate-200/70 dark:border-slate-800/70 p-6 bg-[var(--card-bg)] rounded-xs shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 border border-slate-200/60 dark:border-slate-800/60 rounded-full overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 relative">
            {linkedInstructor?.avatarUrl ? (
              <img
                src={linkedInstructor.avatarUrl}
                alt={linkedInstructor.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <User className="w-8 h-8 text-[var(--ink-dim)] absolute inset-0 m-auto" />
            )}
            <div className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white dark:border-black animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase bg-accent-muted dark:bg-accent-muted border border-accent-soft px-2 py-0.5 text-accent dark:text-accent tracking-wider rounded-xs font-bold">
                {t('instructorActiveAccount')}
              </span>
            </div>
            <h3 className="text-2xl font-serif font-light text-[var(--ink)] tracking-tight mt-1.5 leading-none">
              {linkedInstructor
                ? translateInstructorName(linkedInstructor.name, language)
                : userProfile.displayName}
            </h3>
            <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--ink-dim)] mt-2">
              {linkedInstructor?.specialty === 'both'
                ? t('instructorSkiSnowboardSpecialist')
                : linkedInstructor?.specialty === 'ski'
                  ? t('instructorSkiCoach')
                  : t('instructorSnowboardCoach')}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-slate-200/70 dark:border-slate-800/70 p-4 bg-[var(--card-bg)] rounded-xs shadow-xs space-y-1">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {t('rating')}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-serif font-light text-[var(--ink)]">
              {linkedInstructor?.rating || '0.0'}
            </span>
            <Star className="w-4 h-4 text-amber-400 fill-amber-400 self-center" />
          </div>
          <span className="text-[8px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {linkedInstructor?.reviewsCount || 0} {t('instructorReviewsCount')}
          </span>
        </div>

        <div className="border border-slate-200/70 dark:border-slate-800/70 p-4 bg-[var(--card-bg)] rounded-xs shadow-xs space-y-1">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {t('instructorTotalLessons')}
          </span>
          <span className="text-3xl font-serif font-light text-[var(--ink)] block">
            {stats.total}
          </span>
          <span className="text-[8px] font-mono text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
            {stats.completed} {t('completed')}
          </span>
        </div>

        <div className="border border-slate-200/70 dark:border-slate-800/70 p-4 bg-[var(--card-bg)] rounded-xs shadow-xs space-y-1">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {t('instructorPendingActions')}
          </span>
          <span className="text-3xl font-serif font-light text-[var(--ink)] block">
            {stats.pending}
          </span>
          <span className="text-[8px] font-mono text-accent dark:text-accent uppercase tracking-wider block">
            {stats.confirmed} {t('confirmed')}
          </span>
        </div>

        <div className="border border-slate-200/70 dark:border-slate-800/70 p-4 bg-[var(--card-bg)] rounded-xs shadow-xs space-y-1">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {t('instructorEstimatedEarnings')}
          </span>
          <span className="text-3xl font-serif font-light text-[var(--ink)] block">
            ${stats.revenue}
          </span>
          <span className="text-[8px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {t('instructorCompletedEarnings')}
          </span>
        </div>
      </div>
    </div>
  );
};
