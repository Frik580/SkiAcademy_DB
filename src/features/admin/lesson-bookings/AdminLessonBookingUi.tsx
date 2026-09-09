import type { PaymentStatus } from '@ski-academy/shared-domain';
import { ChevronRight, Clock3, UserRound } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { LessonAdminPrimaryStatusKind } from './lessonBookingAdminPresentation';
import { lessonAdminPrimaryStatusBadgeTone } from './lessonBookingAdminPresentation';

const STATUS_TONE_CLASS: Record<ReturnType<typeof lessonAdminPrimaryStatusBadgeTone>, string> = {
  pending:
    'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:border-amber-400/30 dark:text-amber-200',
  confirmed:
    'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/30 dark:text-emerald-200',
  pending_cancellation:
    'border-rose-500/25 bg-rose-500/10 text-rose-800 dark:border-rose-400/30 dark:text-rose-200',
  cancelled:
    'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:border-slate-500/30 dark:text-slate-300',
  completed:
    'border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-muted)] text-[var(--accent)]',
  no_show:
    'border-orange-500/25 bg-orange-500/10 text-orange-800 dark:border-orange-400/30 dark:text-orange-200',
  info: 'border-sky-500/25 bg-sky-500/10 text-sky-800 dark:border-sky-400/30 dark:text-sky-200',
};

const PAYMENT_TONE_CLASS: Record<PaymentStatus, string> = {
  unpaid:
    'border-amber-500/25 bg-amber-500/8 text-amber-800 dark:border-amber-400/30 dark:text-amber-200',
  partially_paid:
    'border-amber-500/25 bg-amber-500/8 text-amber-800 dark:border-amber-400/30 dark:text-amber-200',
  paid: 'border-emerald-500/20 bg-emerald-500/8 text-emerald-800 dark:border-emerald-400/30 dark:text-emerald-200',
  refunded:
    'border-slate-500/20 bg-slate-500/8 text-slate-700 dark:border-slate-500/30 dark:text-slate-300',
  partially_refunded:
    'border-orange-500/20 bg-orange-500/8 text-orange-800 dark:border-orange-400/30 dark:text-orange-200',
};

export function AdminLessonStatusChip({
  status,
  label,
}: {
  readonly status: LessonAdminPrimaryStatusKind;
  readonly label: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${STATUS_TONE_CLASS[lessonAdminPrimaryStatusBadgeTone(status)]}`}
    >
      {label}
    </span>
  );
}

export function AdminLessonPaymentIndicator({
  status,
  label,
}: {
  readonly status: PaymentStatus;
  readonly label: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium leading-none ${PAYMENT_TONE_CLASS[status]}`}
    >
      {label}
    </span>
  );
}

export function AdminLessonOriginBadge({
  origin,
  label,
}: {
  readonly origin: 'guest' | 'account' | 'admin' | 'instructor';
  readonly label: string;
}) {
  const originClass =
    origin === 'guest'
      ? 'border-violet-500/20 bg-violet-500/8 text-violet-800 dark:border-violet-400/30 dark:text-violet-200'
      : origin === 'admin'
        ? 'border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[var(--accent-muted)] text-[var(--accent)]'
        : origin === 'instructor'
          ? 'border-sky-500/20 bg-sky-500/8 text-sky-800 dark:border-sky-400/30 dark:text-sky-200'
          : 'border-[var(--border)] bg-[var(--profile-bg)] text-[var(--ink-dim)]';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium leading-none ${originClass}`}
    >
      {label}
    </span>
  );
}

export interface AdminLessonBookingListRowInput {
  readonly bookingId: string;
  readonly participantNames: string;
  readonly date: string;
  readonly time: string;
  readonly instructor: string;
  readonly duration: string;
  readonly primaryStatus: LessonAdminPrimaryStatusKind;
  readonly primaryStatusLabel: string;
  readonly paymentStatus?: PaymentStatus;
  readonly paymentStatusLabel?: string;
  readonly origin: 'guest' | 'account' | 'admin' | 'instructor';
  readonly originLabel: string;
}

export function AdminLessonBookingListRow({
  item,
  selected,
  onSelect,
}: {
  readonly item: AdminLessonBookingListRowInput;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const attentionClass =
    item.primaryStatus === 'awaiting_payment'
      ? 'border-l-amber-500 bg-amber-500/[0.055]'
      : item.primaryStatus === 'pending_cancellation'
        ? 'border-l-rose-500 bg-rose-500/[0.055]'
        : 'border-l-transparent bg-[var(--card-bg)]';

  return (
    <button
      type="button"
      data-admin-lesson-booking-id={item.bookingId}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={`group w-full rounded-[var(--radius-md)] border border-[var(--border)] border-l-[3px] p-3.5 text-left transition-colors hover:border-[color-mix(in_srgb,var(--accent)_28%,transparent)] hover:bg-[var(--accent-muted)] ${attentionClass} ${
        selected ? 'ring-1 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">
            {item.participantNames}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--ink-dim)]">
            <span>{item.date}</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[var(--ink)]">{item.time}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--profile-bg)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink)]">
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              {item.duration}
            </span>
          </div>
          <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--ink-dim)]">
            <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.instructor}</span>
          </p>
        </div>
        <ChevronRight
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-dim)] transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <AdminLessonStatusChip status={item.primaryStatus} label={item.primaryStatusLabel} />
        {item.paymentStatus && item.paymentStatusLabel && (
          <AdminLessonPaymentIndicator
            status={item.paymentStatus}
            label={item.paymentStatusLabel}
          />
        )}
        <AdminLessonOriginBadge origin={item.origin} label={item.originLabel} />
      </div>
    </button>
  );
}

export interface AdminLessonDetailSection {
  readonly id:
    'overview' | 'payment' | 'attendance' | 'cancellation' | 'guest' | 'issues' | 'technical';
  readonly label: string;
  readonly attention?: boolean;
}

export function AdminLessonDetailTabs({
  sections,
  activeSection,
  onChange,
  ariaLabel,
  attentionLabel,
}: {
  readonly sections: readonly AdminLessonDetailSection[];
  readonly activeSection: AdminLessonDetailSection['id'];
  readonly onChange: (section: AdminLessonDetailSection['id']) => void;
  readonly ariaLabel: string;
  readonly attentionLabel: string;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % sections.length;
    if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + sections.length) % sections.length;
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = sections.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextSection = sections[nextIndex];
    if (!nextSection) return;
    onChange(nextSection.id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .item(nextIndex)
      .focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-1 overflow-x-auto border-b border-[var(--border)] px-4"
    >
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          role="tab"
          id={`admin-lesson-tab-${section.id}`}
          aria-selected={activeSection === section.id}
          aria-controls={`admin-lesson-panel-${section.id}`}
          tabIndex={activeSection === section.id ? 0 : -1}
          onClick={() => onChange(section.id)}
          onKeyDown={(event) => handleKeyDown(event, sections.indexOf(section))}
          className={`relative shrink-0 rounded-none border-b-2 px-2.5 py-3 text-xs font-medium transition-colors ${
            activeSection === section.id
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]'
          }`}
        >
          {section.label}
          {section.attention && (
            <span
              className="absolute right-0.5 top-2 h-1.5 w-1.5 rounded-full bg-rose-500"
              aria-label={attentionLabel}
            />
          )}
        </button>
      ))}
    </div>
  );
}
