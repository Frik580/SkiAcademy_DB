import type { StudentCourseProgressSummaryInput } from './courseProgressViewModel';

export function StudentCourseProgressSummary({
  enrollmentId,
  progressLabel,
  daysLabel,
  progressPercent,
  attendedLabel,
  presentDays,
  attendanceLabel,
  attendanceValue,
  lifecycleLabel,
  lifecycleStatus,
}: StudentCourseProgressSummaryInput) {
  const boundedPercent = Math.max(0, Math.min(100, progressPercent));
  const lifecycleClass =
    lifecycleStatus === 'no_show'
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-emerald-600 dark:text-emerald-400';

  return (
    <div className="space-y-3" data-enrollment-id={enrollmentId}>
      {lifecycleLabel && (
        <p className={`text-[10px] font-medium tracking-widest uppercase ${lifecycleClass}`}>
          {lifecycleLabel}
        </p>
      )}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)]">
            {progressLabel}
          </p>
          <p className="text-xs tabular-nums text-[var(--ink)]">{daysLabel}</p>
        </div>
        <div className="w-full h-1.5 bg-black/10 dark:bg-white/5 border border-[var(--border)] overflow-hidden">
          <div
            className="h-full bg-sky-500 transition-all duration-500"
            style={{ width: `${boundedPercent}%` }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-dim)]">
        <p>
          {attendedLabel}: <span className="tabular-nums text-[var(--ink)]">{presentDays}</span>
        </p>
        <p>
          {attendanceLabel}:{' '}
          <span className="tabular-nums text-[var(--ink)]">{attendanceValue}</span>
        </p>
      </div>
    </div>
  );
}
