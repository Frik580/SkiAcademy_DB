import { useState } from 'react';
import { StudentSkillEvaluationModal } from '../../../src/features/profile/components/StudentSkillEvaluationModal';
import { useLessonStartClock } from '../../../src/features/booking-collaboration/useLessonStartClock';
import { InstructorBlockAction } from '../../../src/features/booking-collaboration/components/InstructorBlockAction';
import { DEFAULT_SKILL_CONFIG } from '../../../src/domain/achievements';

export function PrelessonFixture() {
  const [bookings] = useState(() => [{ startsAtEpochMs: Date.now() + 60_000 }]);
  const now = useLessonStartClock(bookings);
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [saves, setSaves] = useState(0);
  const readOnly = now < bookings[0].startsAtEpochMs;
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--ink)] p-4">
      <output data-testid="saves">{saves}</output>
      <output data-testid="block">{String(blocked)}</output>
      <InstructorBlockAction
        access={{
          participantId: 'participant_prelesson',
          instructorId: 'instructor_prelesson',
          participantDisplayName: 'Student',
          instructorDisplayName: 'Instructor',
          managerBlockStatus: blocked ? 'active' : undefined,
          authorizedActions: {
            canBlock: !blocked,
            canUnblock: blocked,
            canCreateRelationship: false,
            canRevokeRelationship: false,
          },
        }}
        onBlock={blocked ? undefined : async () => setBlocked(true)}
        onUnblock={blocked ? async () => setBlocked(false) : undefined}
      />
      <button onClick={() => setOpen(true)}>Open progress</button>
      <StudentSkillEvaluationModal
        isOpen={open}
        onClose={() => setOpen(false)}
        participantId="participant_prelesson"
        studentName="Student"
        studentLevel={1}
        existingScores={{ [DEFAULT_SKILL_CONFIG.items[0].id]: 1 }}
        existingComments={{ [DEFAULT_SKILL_CONFIG.items[0].id]: 'Coach comment' }}
        readOnly={readOnly}
        onSaveScores={async () => setSaves((value) => value + 1)}
      />
    </main>
  );
}
