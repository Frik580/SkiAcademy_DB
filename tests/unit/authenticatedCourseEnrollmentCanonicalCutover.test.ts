import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../helpers/readRepoFile';

describe('authenticated course enrollment canonical cutover', () => {
  it('keeps the production frontend on the canonical authenticated command', () => {
    const commands = readRepoFile('src/features/course-enrollments/useCourseEnrollmentCommands.ts');
    const actions = readRepoFile('src/features/courses/useCourseActions.ts');
    const service = readRepoFile('src/features/courses/courseService.ts');

    expect(commands).toContain("kind: 'create_course_enrollments'");
    expect(actions).toContain('createAuthenticatedEnrollment');
    expect(actions).not.toContain('enrollInCourseService');
    expect(actions).not.toContain('enrollInCourseViaCallable');
    expect(service).not.toContain('enrollInCourseViaCallable');
    expect(service).not.toContain('enrollInCourseService');
  });

  it('does not export or retain the legacy callable implementation and wrapper', () => {
    const functionsIndex = readRepoFile('functions/src/index.ts');

    expect(functionsIndex).not.toContain('enrollInCourseHandler');
    expect(functionsIndex).not.toMatch(/export const enrollInCourse\b/);
    expect(existsSync(resolve(process.cwd(), 'functions/src/courses/enrollInCourse.ts'))).toBe(
      false
    );
    expect(
      existsSync(resolve(process.cwd(), 'src/features/courses/enrollInCourseCallable.ts'))
    ).toBe(false);
  });

  it('does not load synthetic course bookings as Student Course authority', () => {
    const dataSync = readRepoFile('src/store/useDataSyncScope.ts');
    const storeSync = readRepoFile('src/store/useStoreSync.ts');
    const home = readRepoFile('src/app/routes/HomeRouteContainer.tsx');
    const panels = readRepoFile(
      'src/features/student-cabinet/components/student/StudentCabinetPanels.tsx'
    );

    expect(dataSync).toContain('shouldLoadLegacyCourseBookings: false');
    expect(storeSync).toContain('useCourseEnrollmentReadSync');
    expect(storeSync).not.toContain('getStudentCourseBookingsQuery');
    expect(readRepoFile('src/features/bookings/bookingRealtimeService.ts')).not.toContain(
      'getStudentCourseBookingsQuery'
    );
    expect(home).toContain('useCourseEnrollmentStore');
    expect(home).not.toContain('getEnrolledCourses');
    expect(panels).toContain('getEnrolledCourseIdsForParticipant');
    expect(panels).not.toContain('getEnrolledCourses');
  });

  it('issues course_graduate only from the three canonical completion writers', () => {
    const attendance = readRepoFile(
      'functions/src/canonical/courses/courseEnrollmentAttendanceCommands.ts'
    );
    const reconciliation = readRepoFile(
      'functions/src/canonical/courses/courseEnrollmentReconciliationCommands.ts'
    );
    const issuance = readRepoFile(
      'functions/src/canonical/achievements/courseGraduateAchievementIssuance.ts'
    );
    const functionsIndex = readRepoFile('functions/src/index.ts');

    expect(attendance).toContain("'record_course_day_attendance'");
    expect(attendance).toContain("'resolve_attendance_outcome'");
    expect(attendance).toContain('planCourseGraduateAchievementIssuance');
    expect(reconciliation).toContain("'reconcile_course_enrollment'");
    expect(reconciliation).toContain('planCourseGraduateAchievementIssuance');
    expect(issuance).toContain('courseGraduateAchievementIssuanceState');
    expect(functionsIndex).toContain('scheduledResolveCourseEnrollmentOutcomes');
    expect(functionsIndex).toContain('sweepCourseEnrollmentOutcomes');
  });
});
