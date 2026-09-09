import { useBookingCollaborationTranslations } from '../useBookingCollaborationTranslations';

export function StudentOpenChangeRequestNotice() {
  const copy = useBookingCollaborationTranslations();
  return (
    <div
      role="status"
      className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs"
    >
      <p className="font-medium text-[var(--ink)]">{copy.instructorRequestedScheduleChange}</p>
      <p className="mt-1 text-[var(--ink-dim)]">{copy.waitingAdminDecision}</p>
    </div>
  );
}
