import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../helpers/readRepoFile';

describe('T32.4 canonical Admin lesson booking boundary', () => {
  it('removes legacy lesson writers from the active Admin route', () => {
    const route = readRepoFile('src/app/routes/AdminRouteContainer.tsx');
    const panel = readRepoFile('src/features/admin/components/AdminPanel.tsx');
    const actions = readRepoFile('src/features/admin/useAdminActions.ts');
    const activeBoundary = route + panel + actions;

    expect(panel).toContain('AdminLessonBookingPanel');
    for (const legacy of [
      'BookingsLog',
      'ScheduleCalendar',
      'ScheduleSlotActionModal',
      'handleAddBooking',
      'handleConfirmBooking',
      'handleCancelBooking',
      'handleCompleteBooking',
      'handleLinkGuestBooking',
      'handleRescheduleBooking',
      'handleReassignInstructor',
    ]) {
      expect(activeBoundary).not.toContain(legacy);
    }
    expect(actions).toContain('updateInstructorService(instructor, [])');
  });

  it('uses only canonical read and command clients in the new feature', () => {
    const panel = readRepoFile('src/features/admin/lesson-bookings/AdminLessonBookingPanel.tsx');
    const reads = readRepoFile(
      'src/features/admin/lesson-bookings/useAdminLessonBookingReadModels.ts'
    );
    const commands = readRepoFile(
      'src/features/admin/lesson-bookings/useAdminLessonBookingCommands.ts'
    );

    expect(reads).toContain('queryLessonBookingReadModels');
    expect(commands).toContain('executeAuthenticatedCanonicalCommand');
    expect(commands).toContain("kind: 'resolve_attendance_outcome'");
    expect(panel + reads + commands).not.toContain('completeBooking');
    expect(panel + reads + commands).not.toContain('linkGuestBookingService');
    expect(panel + reads + commands).not.toContain('getDocs(');
    expect(panel + reads + commands).not.toContain('onSnapshot(');
  });
});
