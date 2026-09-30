import type { ReactNode } from 'react';

/** Shared with Admin lesson/training records: field chrome, record cards, status chips. */
export const adminFormControls =
  '[&_input:not([type=checkbox])]:mt-1 [&_input:not([type=checkbox])]:w-full [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:border-[var(--border)] [&_input:not([type=checkbox])]:bg-[var(--bg)] [&_input:not([type=checkbox])]:p-2 [&_input:not([type=checkbox])]:text-xs [&_input:not([type=checkbox])]:text-[var(--ink)] [&_select]:mt-1 [&_select]:w-full [&_select]:border [&_select]:border-[var(--border)] [&_select]:bg-[var(--bg)] [&_select]:p-2 [&_select]:text-xs [&_select]:text-[var(--ink)] [&_textarea]:mt-1 [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-[var(--border)] [&_textarea]:bg-[var(--bg)] [&_textarea]:p-2 [&_textarea]:text-xs [&_textarea]:text-[var(--ink)]';

export const adminRecordCardClass =
  'rounded-[var(--radius-md)] border border-[var(--border)] border-l-[3px] bg-[var(--card-bg)] p-3.5 transition-colors hover:border-[color-mix(in_srgb,var(--accent)_28%,transparent)] hover:bg-[var(--accent-muted)]';

const STATUS_TONE = {
  active:
    'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/30 dark:text-emerald-200',
  archived:
    'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:border-slate-500/30 dark:text-slate-300',
  attention:
    'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:border-amber-400/30 dark:text-amber-200',
  neutral:
    'border-[var(--border)] bg-[var(--profile-bg)] text-[var(--ink-dim)]',
  info: 'border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-muted)] text-[var(--accent)]',
} as const;

export function AdminCourseStatusChip({
  tone,
  children,
}: {
  readonly tone: keyof typeof STATUS_TONE;
  readonly children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${STATUS_TONE[tone]}`}
    >
      {children}
    </span>
  );
}
