import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readSource(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('T32.9A.2.2 Planner / Lesson Admin UX boundary', () => {
  const panel = readSource('src/features/admin/lesson-bookings/AdminLessonBookingPanel.tsx');
  const commands = readSource(
    'src/features/admin/lesson-bookings/useAdminLessonBookingCommands.ts'
  );
  const plannerCommands = readSource('src/features/admin/operations/adminPlannerCommands.ts');
  const plannerBoard = readSource('src/features/admin/operations/AdminPlannerBoard.tsx');
  const adminPanel = readSource('src/features/admin/components/AdminPanel.tsx');
  const moveForm = readSource(
    'src/features/admin/components/schedule/slot-modal/ActiveSlotMoveForm.tsx'
  );
  const createForm = readSource(
    'src/features/admin/components/schedule/slot-modal/ActiveSlotCreateForm.tsx'
  );
  const slotModal = readSource(
    'src/features/admin/components/schedule/ScheduleSlotActionModal.tsx'
  );

  it('keeps canonical scheduling commands while removing Lesson Admin scheduling UI', () => {
    expect(commands).toContain("'create_confirmed_booking'");
    expect(commands).toContain("'reschedule_booking'");
    expect(commands).toContain("'change_booking_instructor'");
    expect(commands).toContain("'change_booking_duration'");

    expect(panel).not.toContain('adminLessonCreateTitle');
    expect(panel).not.toContain('submitCreate');
    expect(panel).not.toContain('adminLessonReschedule');
    expect(panel).not.toContain('adminLessonReassign');
    expect(panel).not.toContain('adminLessonChangeDuration');
    expect(panel).toContain('openInPlanner');
    expect(panel).toContain('ADMIN_PLANNER_DATE_QUERY_KEY');
    expect(panel).toContain('record_booking_attendance');
    expect(panel).toContain('resolve_booking_cancellation');
    expect(panel).toContain('resolve_attendance_outcome');
  });

  it('gives Planner managed Participant create, duration change, and lesson-detail navigation', () => {
    expect(createForm).toContain('AdminManagedParticipantPicker');
    expect(createForm).toContain('autoSelectUniqueSelf');
    expect(createForm).toContain('onReadyChange');
    expect(createForm).toContain('bookingIdentityReady');
    expect(plannerCommands).toContain('resolvePlannerCreateParticipantChoice');
    expect(plannerCommands).toContain("kind: 'change_booking_duration'");
    expect(plannerBoard).toContain('changePlannerOccupancyDuration');
    expect(plannerBoard).toContain('onOpenLessonDetail');
    expect(plannerBoard).toContain('ADMIN_LESSON_BOOKING_QUERY_KEY');
    expect(moveForm).toContain('openLessonDetail');
    expect(moveForm).toContain('canCompleteLesson');
    expect(slotModal).toContain('isPlannerLessonBooking');
  });

  it('force-opens Lesson Admin when a booking deep-link is present', () => {
    expect(adminPanel).toContain('forceOpenToken');
    expect(adminPanel).toContain('ADMIN_LESSON_BOOKING_QUERY_KEY');
    expect(adminPanel).toMatch(
      /forceOpen=\{Boolean\(searchParams\.get\(ADMIN_LESSON_BOOKING_QUERY_KEY\)\)\}/
    );
  });
});
