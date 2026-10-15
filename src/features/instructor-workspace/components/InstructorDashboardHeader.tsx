import React from 'react';
import { User, Star } from 'lucide-react';
import { translateInstructorName } from '../../../app/providers/LanguageContext';
import { useInstructorWorkspace } from './useInstructorWorkspace';

interface InstructorDashboardHeaderProps {
  workspace: ReturnType<typeof useInstructorWorkspace>;
}

export const InstructorDashboardHeader: React.FC<InstructorDashboardHeaderProps> = ({
  workspace,
}) => {
  const { t, language, linkedInstructor, stats, revenue, userProfile } = workspace;
  const revenueValue =
    revenue.status === 'loaded'
      ? `${revenue.retainedAmount.toLocaleString('ru-RU')}\u00a0₸`
      : revenue.status === 'loading'
        ? t('instructorRevenueLoading')
        : revenue.status === 'error'
          ? t('instructorRevenueError')
          : t('instructorRevenueUnavailable');

  return (
    <div className="space-y-8">
      {/* Active Profile Header */}
      <div className="border border-slate-200/70 dark:border-slate-800/70 p-6 bg-[var(--card-bg)] rounded-xs shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex min-w-0 max-w-full items-center gap-4">
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
          <div className="min-w-0 break-words">
            <div className="flex items-center gap-2">
              <span className="type-caption uppercase bg-accent-muted dark:bg-accent-muted border border-accent-soft px-2 py-0.5 text-accent dark:text-accent rounded-xs font-medium">
                {t('instructorActiveAccount')}
              </span>
            </div>
            <h3 className="type-card-title text-[var(--ink)] mt-1.5">
              {linkedInstructor
                ? translateInstructorName(linkedInstructor.name, language)
                : userProfile.displayName}
            </h3>
            <p className="type-caption uppercase text-[var(--ink-dim)] mt-2">
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
          <span className="type-caption text-[var(--ink-dim)] uppercase block">{t('rating')}</span>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`min-w-0 break-words text-[var(--ink)] ${
                linkedInstructor?.rating !== null &&
                linkedInstructor?.rating !== undefined &&
                linkedInstructor.reviewsCount > 0
                  ? 'type-metric lg:type-metric-lg'
                  : 'type-compact'
              }`}
            >
              {linkedInstructor?.rating !== null &&
              linkedInstructor?.rating !== undefined &&
              linkedInstructor.reviewsCount > 0
                ? linkedInstructor.rating.toFixed(1)
                : t('instructorNoReviews')}
            </span>
            {linkedInstructor?.rating !== null &&
              linkedInstructor?.rating !== undefined &&
              linkedInstructor.reviewsCount > 0 && (
                <Star className="w-4 h-4 text-amber-400 fill-amber-400 self-center" />
              )}
          </div>
          <span className="type-caption text-[var(--ink-dim)] uppercase block">
            {linkedInstructor?.reviewsCount || 0} {t('instructorReviewsCount')}
          </span>
        </div>

        <div className="border border-slate-200/70 dark:border-slate-800/70 p-4 bg-[var(--card-bg)] rounded-xs shadow-xs space-y-1">
          <span className="type-caption text-[var(--ink-dim)] uppercase block">
            {t('instructorTotalLessons')}
          </span>
          <span className="type-metric lg:type-metric-lg break-words text-[var(--ink)] block">
            {stats.total}
          </span>
          <span className="type-caption text-emerald-600 dark:text-emerald-400 uppercase block">
            {stats.completed} {t('completed')}
          </span>
          <span className="type-caption text-[var(--ink-dim)] uppercase block">
            {stats.noShow} {t('noShowShort')}
          </span>
        </div>

        <div className="border border-slate-200/70 dark:border-slate-800/70 p-4 bg-[var(--card-bg)] rounded-xs shadow-xs space-y-1">
          <span className="type-caption text-[var(--ink-dim)] uppercase block">
            {t('instructorPendingActions')}
          </span>
          <span className="type-metric lg:type-metric-lg break-words text-[var(--ink)] block">
            {stats.pending}
          </span>
          <span className="type-caption text-accent dark:text-accent uppercase block">
            {stats.confirmed} {t('confirmed')}
          </span>
        </div>

        <div className="border border-slate-200/70 dark:border-slate-800/70 p-4 bg-[var(--card-bg)] rounded-xs shadow-xs space-y-1">
          <span className="type-caption text-[var(--ink-dim)] uppercase block">
            {t('instructorCompletedLessonRevenue')}
          </span>
          <span
            role="status"
            aria-live="polite"
            aria-busy={revenue.status === 'loading'}
            className={`break-words text-[var(--ink)] block ${revenue.status === 'loaded' ? 'type-metric max-[359px]:text-lg lg:type-metric-lg' : 'type-compact'}`}
          >
            {revenueValue}
          </span>
          <span className="type-caption text-[var(--ink-dim)] uppercase block">
            {t('instructorRevenueSchoolGross')}
          </span>
        </div>
      </div>
    </div>
  );
};
