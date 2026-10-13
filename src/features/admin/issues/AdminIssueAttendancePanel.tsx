import { ActionButton } from '../../../ui/ActionButton';
import type { AdminIssueAttendanceInput } from './adminIssueAttendance';
import { useAdminIssueTranslations } from './useAdminIssueTranslations';

export function AdminIssueAttendancePanel({
  input,
  pending,
  onSubmit,
}: {
  readonly input: AdminIssueAttendanceInput;
  readonly pending: boolean;
  readonly onSubmit: () => void;
}) {
  const { t } = useAdminIssueTranslations();
  return (
    <section
      className="space-y-3 border-t border-[var(--border)] pt-4"
      aria-label={t('adminLessonAttendanceTitle')}
    >
      <h4 className="type-card-title uppercase">{t('adminLessonAttendanceTitle')}</h4>
      <p className="type-caption text-[var(--ink-dim)]">{input.lessonTime}</p>
      <ul className="space-y-2 type-compact">
        {input.participants.map((participant) => (
          <li key={participant.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <span className="min-w-0 break-words">{participant.displayName}</span>
            <span className="text-[var(--ink-dim)]">
              {t(
                participant.status === 'present'
                  ? 'adminLessonAttendancePresent'
                  : participant.status === 'absent'
                    ? 'adminLessonAttendanceAbsent'
                    : 'adminLessonAttendanceMissing'
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="type-caption">
        {t('adminIssueMissingAttendanceCount')}: {input.missingCount}
      </p>
      {input.unavailableReason && (
        <p className="type-caption text-[var(--ink-dim)]">{t(input.unavailableReason)}</p>
      )}
      <ActionButton
        variant="primary"
        className="w-full sm:w-auto"
        pending={pending}
        pendingLabel={t('adminIssueAttendanceSaving')}
        disabled={Boolean(input.unavailableReason)}
        onClick={onSubmit}
      >
        {t('adminIssueAttendanceAllPresent')}
      </ActionButton>
    </section>
  );
}
