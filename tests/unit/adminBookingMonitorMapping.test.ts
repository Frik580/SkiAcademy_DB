import { describe, expect, it } from 'vitest';
import type {
  AdminCourseEnrollmentRosterItem,
  LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import {
  lessonBookingToMonitorRow,
  mergeAdminBookingMonitorRows,
  unionAdminMonitorCourseEnrollments,
} from '../../src/features/admin/operations/adminBookingMonitorMapping';
import { resolveAdminMonitorLessonStatusFromRow } from '../../src/features/admin/lesson-bookings/lessonBookingAdminPresentation';
import { readRepoFile } from '../helpers/readRepoFile';

function enrollment(input: {
  enrollmentId: string;
  displayName: string;
  courseId?: string;
  participantId?: string;
  lifecycleStatus?: AdminCourseEnrollmentRosterItem['lifecycleStatus'];
}): AdminCourseEnrollmentRosterItem {
  return {
    enrollmentId: input.enrollmentId,
    revision: 1,
    course: {
      courseId: input.courseId ?? 'course_carve_clean',
      title: 'CARVE — Clean Carving',
      lifecycle: 'published',
      revision: 1,
    },
    participant: {
      participantId: input.participantId ?? `participant_${input.enrollmentId}`,
      displayName: input.displayName,
    },
    lifecycleStatus: input.lifecycleStatus ?? 'pending',
    guestState: 'pending_unlinked',
    payment: {
      paymentId: `payment_${input.enrollmentId}`,
      status: 'unpaid',
      revision: 1,
      price: 100_000,
      paid: 0,
      refunded: 0,
      retained: 0,
      settled: 0,
      writtenOff: 0,
      outstanding: 100_000,
    },
    relatedIssues: [],
    authorizedActions: {
      canRecordPayment: false,
      canResolveCancellation: false,
      canTransfer: false,
      canReconcile: false,
      canResolveAttendanceOutcome: false,
      canCancelUnpaidGuest: true,
      canApproveGuest: false,
      canLinkGuest: true,
      canWithdraw: false,
    },
    updatedAt: { seconds: 1_700_000_000, nanoseconds: 0 },
  } as AdminCourseEnrollmentRosterItem;
}

function lessonReadModel(
  lifecycleStatus: LessonBookingReadModel['lifecycle']['status']
): LessonBookingReadModel {
  return {
    bookingId: 'booking_monitor_1',
    instructor: { instructorId: 'ins_1', displayName: 'Anna' },
    occurrence: {
      startsAt: { seconds: 1_700_000_000, nanoseconds: 0 },
      endsAt: { seconds: 1_700_003_600, nanoseconds: 0 },
      timeZone: 'Asia/Almaty',
      durationMinutes: 60,
    },
    lifecycle: { status: lifecycleStatus },
    bookingOrigin: 'account',
    updatedAt: { seconds: 1_700_000_000, nanoseconds: 0 },
    participants: [{ participantId: 'part_1', displayName: 'Client' }],
  } as unknown as LessonBookingReadModel;
}

describe('adminBookingMonitorMapping', () => {
  it('preserves canonical no_show lifecycle instead of mapping to cancelled', () => {
    const row = lessonBookingToMonitorRow(lessonReadModel('no_show'));
    expect(row.status).toBe('no_show');
    expect(row.canonicalLifecycleStatus).toBe('no_show');
  });

  it('maps completed lifecycle for history-capable monitor rows', () => {
    const row = lessonBookingToMonitorRow(lessonReadModel('completed'));
    expect(row.status).toBe('completed');
    expect(row.canonicalLifecycleStatus).toBe('completed');
  });

  it('unions roster over pending_guest by canonical enrollmentId only', () => {
    const A = enrollment({ enrollmentId: 'enrollment_A', displayName: 'Tyra' });
    const B = enrollment({ enrollmentId: 'enrollment_B', displayName: 'Petrosin' });
    const C = enrollment({ enrollmentId: 'enrollment_C', displayName: 'Guest C' });

    expect(unionAdminMonitorCourseEnrollments([A], [A]).map((item) => item.enrollmentId)).toEqual([
      'enrollment_A',
    ]);
    expect(
      unionAdminMonitorCourseEnrollments([A, B], [B, C]).map((item) => item.enrollmentId)
    ).toEqual(['enrollment_A', 'enrollment_B', 'enrollment_C']);
  });

  it('keeps the roster item when pending_guest repeats the same enrollmentId', () => {
    const rosterA = enrollment({
      enrollmentId: 'enrollment_A',
      displayName: 'Roster Tyra',
      lifecycleStatus: 'confirmed',
    });
    const pendingA = enrollment({
      enrollmentId: 'enrollment_A',
      displayName: 'Pending Tyra',
      lifecycleStatus: 'pending',
    });
    const unioned = unionAdminMonitorCourseEnrollments([rosterA], [pendingA]);
    expect(unioned).toHaveLength(1);
    expect(unioned[0]).toBe(rosterA);
    expect(unioned[0]?.participant.displayName).toBe('Roster Tyra');
    expect(unioned[0]?.lifecycleStatus).toBe('confirmed');
  });

  it('keeps different enrollmentIds even when guest and course match', () => {
    const first = enrollment({
      enrollmentId: 'enrollment_tyra_1',
      displayName: 'Tyra',
      courseId: 'course_carve_clean',
      participantId: 'participant_shared',
    });
    const second = enrollment({
      enrollmentId: 'enrollment_tyra_2',
      displayName: 'Tyra',
      courseId: 'course_carve_clean',
      participantId: 'participant_shared',
    });
    expect(
      unionAdminMonitorCourseEnrollments([first], [second]).map((item) => item.enrollmentId)
    ).toEqual(['enrollment_tyra_1', 'enrollment_tyra_2']);
  });

  it('does not change lesson rows when unioning course enrollments', () => {
    const A = enrollment({ enrollmentId: 'enrollment_A', displayName: 'Tyra' });
    const pendingA = enrollment({
      enrollmentId: 'enrollment_A',
      displayName: 'Pending Tyra',
    });
    const C = enrollment({ enrollmentId: 'enrollment_C', displayName: 'Guest C' });
    const confirmed = lessonReadModel('confirmed');
    const completed = lessonReadModel('completed');
    const merged = mergeAdminBookingMonitorRows(
      [confirmed, completed],
      unionAdminMonitorCourseEnrollments([A], [pendingA, C])
    );
    expect(merged.map((row) => row.id)).toEqual([
      'booking_monitor_1',
      'booking_monitor_1',
      'enrollment_A',
      'enrollment_C',
    ]);
    expect(merged[0]?.canonicalLifecycleStatus).toBe('confirmed');
    expect(merged[1]?.canonicalLifecycleStatus).toBe('completed');
  });

  it('emits unique Active Bookings course enrollmentIds after roster/pending union', () => {
    const A = enrollment({ enrollmentId: 'enrollment_A', displayName: 'Tyra' });
    const B = enrollment({ enrollmentId: 'enrollment_B', displayName: 'Petrosin' });
    const C = enrollment({ enrollmentId: 'enrollment_C', displayName: 'Guest C' });
    const merged = mergeAdminBookingMonitorRows(
      [lessonReadModel('confirmed')],
      unionAdminMonitorCourseEnrollments([A, B], [A, B, C])
    );
    const courseEnrollmentIds = merged.filter((row) => row.courseId).map((row) => row.id);
    expect(courseEnrollmentIds).toEqual(['enrollment_A', 'enrollment_B', 'enrollment_C']);
    expect(new Set(courseEnrollmentIds).size).toBe(courseEnrollmentIds.length);
  });

  it('builds active monitor rows from hot lessons only', () => {
    const merged = mergeAdminBookingMonitorRows(
      [lessonReadModel('confirmed'), lessonReadModel('completed')],
      []
    );
    expect(merged.map((row) => row.canonicalLifecycleStatus)).toEqual(['confirmed', 'completed']);
  });

  it('resolves in-progress presentation for confirmed lessons currently underway', () => {
    const row = lessonBookingToMonitorRow(lessonReadModel('confirmed'));
    const now = row.occurrenceStartsAtSeconds! + 30;
    const presentation = resolveAdminMonitorLessonStatusFromRow(row, now);
    expect(presentation?.kind).toBe('in_progress');
    expect(presentation?.labelKey).toBe('adminLessonStatusInProgress');
  });

  it('maps no_show monitor label key to canonical admin status mapper', () => {
    const row = lessonBookingToMonitorRow(lessonReadModel('no_show'));
    const presentation = resolveAdminMonitorLessonStatusFromRow(row, 1_700_010_000);
    expect(presentation?.labelKey).toBe('adminLessonStatusNoShow');
  });

  it('scrolls lesson booking section and detail into view on deep-link', () => {
    const panel = readRepoFile('src/features/admin/lesson-bookings/AdminLessonBookingPanel.tsx');
    expect(panel).toContain('revealLessonBookingCard');
    expect(panel).toContain('data-admin-lesson-booking-id');
    expect(panel).toContain('detailPanelRef');
    const section = readRepoFile(
      'src/features/admin/components/settings/AdminCollapsibleSection.tsx'
    );
    expect(section).toContain('id={id}');
    expect(section).toContain('scrollAdminElementIntoView');
    const navigation = readRepoFile('src/features/admin/adminNavigation.ts');
    expect(navigation).toContain('ADMIN_LESSON_BOOKINGS_SECTION_ID');
    expect(navigation).toContain('scrollAdminLessonBookingsSectionIntoView');
  });

  it('wires lifecycle mutation refresh through shared projections context', () => {
    const panel = readRepoFile('src/features/admin/lesson-bookings/AdminLessonBookingPanel.tsx');
    expect(panel).toContain('refreshAllProjections');
    const context = readRepoFile('src/features/admin/operations/AdminMonitorReadModelsContext.tsx');
    expect(context).toContain('registerPlannerRefresh');
    expect(context).toContain('refreshAllProjections');
    const monitor = readRepoFile('src/features/admin/operations/useAdminMonitorReadModels.ts');
    expect(monitor).not.toContain('lessonsHistory.list.items');
    expect(monitor).toContain('unionAdminMonitorCourseEnrollments');
    expect(monitor).toContain('mergeAdminBookingMonitorRows');
  });
});
