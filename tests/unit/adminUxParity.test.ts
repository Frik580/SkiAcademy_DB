import { describe, expect, it } from 'vitest';
import {
  filterAdminBookingMonitorRows,
  monitorHasCourseAndLessonRows,
} from '../../src/features/admin/operations/adminBookingMonitorFilters';
import { mergeAdminBookingMonitorRows } from '../../src/features/admin/operations/adminBookingMonitorMapping';
import { computeAdminOperationalOverview } from '../../src/features/admin/operations/adminFinancialOverview';
import { bookingsBlockingInstructorDeactivation } from '../../src/features/admin/people/adminPeopleOccupancy';
import {
  adminFinancialOverviewWindow,
  financialOverviewTotalsFromMonetaryEffects,
  settledRevenueKztFromMonetaryEffects,
} from '@ski-academy/shared-domain';
import { matchesSchoolMovementFilters } from '../../src/features/admin/finance/CanonicalSchoolMovementPanel';
import { guestFinanceRowsFromReadModels } from '../../src/features/admin/finance/adminGuestFinanceRows';
import {
  mapPlannerCourses,
  mapPlannerOccupancyToBookings,
} from '../../src/features/admin/operations/adminPlannerMapping';
import { mergeAdminClientDirectory } from '../../src/features/admin/people/adminPeopleMapping';
import {
  enrolledNamesByCourseId,
  mapAdminCourseToTableCourse,
} from '../../src/features/admin/components/courses/adminCourseTableMapping';
import type {
  AdminCourseEnrollmentRosterItem,
  AdminPlannerOccupancyItem,
  LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import type { Booking, UserProfile } from '../../src/types';
import { readRepoFile } from '../helpers/readRepoFile';

const user: UserProfile = {
  uid: 'account_client_1',
  email: 'c@example.com',
  displayName: 'Client One',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
};

function lesson(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking_1',
    userId: 'account_client_1',
    instructorId: 'ins_1',
    instructorName: 'Anna',
    instructorAvatar: '',
    date: '2026-09-01',
    time: '10:00',
    durationHours: 2,
    totalPrice: 25000,
    status: 'confirmed',
    difficulty: 'beginner',
    ...overrides,
  };
}

describe('T32.9A Admin UX parity behavior', () => {
  it('keeps historical Admin navigation sections mounted', () => {
    const source = readRepoFile('src/features/admin/components/AdminPanel.tsx');
    expect(source).toContain('scheduleBoardTitle');
    expect(source).toContain('bookingsLogTitle');
    expect(source).toContain('guestWalletPanelTitle');
    expect(source).toContain('cashFlowTitle');
    expect(source).toContain('clientsManagerTitle');
    expect(source).toContain('coachesDirectoryTitle');
    expect(source).toContain('adminRoleManagementTitle');
    expect(source).toContain('financialOverview');
    expect(source).toContain('AdminPlannerBoard');
    expect(source).toContain('AdminActiveBookingMonitor');
    expect(source).not.toContain('addBookingDirect');
    expect(source).not.toContain('onAddUser');
  });

  it('filters Active Booking Monitor by status, instructor, guest, type, and search', () => {
    const rows = [
      lesson(),
      lesson({
        id: 'enrollment_1',
        instructorId: 'course_alpine',
        instructorName: 'Alpine Group',
        status: 'pending',
        isGuest: true,
        guestName: 'Guest Ski',
        userId: 'guest_1',
      }),
    ];
    expect(monitorHasCourseAndLessonRows(rows)).toEqual({ lessons: 1, courses: 1 });
    const guests = filterAdminBookingMonitorRows(rows, [user], {
      search: '',
      status: 'all',
      instructorId: 'all',
      clientId: 'guests',
      type: 'all',
      sortBy: 'date_desc',
      language: 'en',
    });
    expect(guests).toHaveLength(1);
    expect(guests[0]?.id).toBe('enrollment_1');
    const lessonsOnly = filterAdminBookingMonitorRows(rows, [user], {
      search: 'Anna',
      status: 'confirmed',
      instructorId: 'ins_1',
      clientId: 'all',
      type: 'lessons',
      sortBy: 'date_asc',
      language: 'en',
    });
    expect(lessonsOnly).toHaveLength(1);
    expect(lessonsOnly[0]?.id).toBe('booking_1');
  });

  it('maps canonical lesson and enrollment read models into one monitor list', () => {
    const lessonRm = {
      bookingId: 'booking_admin_1',
      instructor: { instructorId: 'ins_1', displayName: 'Anna' },
      occurrence: {
        startsAt: { seconds: 1_788_249_600, nanoseconds: 0 },
        endsAt: { seconds: 1_788_253_200, nanoseconds: 0 },
        timeZone: 'Asia/Almaty',
        durationMinutes: 60,
      },
      lifecycle: { status: 'confirmed' },
      bookingOrigin: 'guest',
      updatedAt: { seconds: 1_788_249_600, nanoseconds: 0 },
      admin: {
        participants: [{ participantId: 'part_1', displayName: 'Guest A' }],
        payer: undefined,
        payment: { price: 18000 },
      },
      participants: [{ participantId: 'part_1', displayName: 'Guest A' }],
    } as unknown as LessonBookingReadModel;
    const enrollment = {
      enrollmentId: 'enroll_1',
      course: { courseId: 'course_1', title: 'Kids Camp' },
      participant: { participantId: 'part_2', displayName: 'Child' },
      lifecycleStatus: 'confirmed',
      guestState: 'not_guest',
      payment: { price: 90000 },
      updatedAt: { seconds: 1_788_249_600, nanoseconds: 0 },
    } as unknown as AdminCourseEnrollmentRosterItem;
    const merged = mergeAdminBookingMonitorRows([lessonRm], [enrollment]);
    expect(merged.some((row) => row.instructorId === 'ins_1')).toBe(true);
    expect(merged.some((row) => row.instructorId.startsWith('course_'))).toBe(true);
  });

  it('counts operational Financial Overview metrics without treating booking price as revenue', () => {
    const metrics = computeAdminOperationalOverview({
      bookings: [
        lesson({ totalPrice: 25000 }),
        lesson({ id: '2', status: 'completed', totalPrice: 10000, instructorId: 'course_x' }),
      ],
      instructorsCount: 3,
    });
    expect(metrics).not.toHaveProperty('settledPaymentTotalKzt');
    expect(metrics.activeBookings).toBe(1);
    expect(metrics.completedBookings).toBe(1);
    expect(metrics.instructorsCount).toBe(3);
    expect(metrics.courseEnrollmentCount).toBe(1);
    expect(
      readRepoFile('src/features/admin/components/finance/useAdminFinanceReadModels.ts')
    ).toContain("scope: 'admin_financial_overview'");
    expect(readRepoFile('src/features/admin/operations/adminFinancialOverview.ts')).not.toContain(
      'totalPrice'
    );
  });

  it('computes period revenue from settledAmountDelta, subtracts pure refunds, and ignores write-offs', () => {
    const window = adminFinancialOverviewWindow('2026-01-15', 'month', 'Asia/Almaty');
    const inWindow = { seconds: window.startsAt.seconds + 86_400, nanoseconds: 0 };
    const later = { seconds: window.startsAt.seconds + 172_800, nanoseconds: 0 };
    const outside = { seconds: window.startsAt.seconds - 86_400, nanoseconds: 0 };
    const revenue = settledRevenueKztFromMonetaryEffects(
      [
        { occurredAt: inWindow, paymentEffect: { settledAmountDelta: 80_000 } },
        { occurredAt: later, paymentEffect: { settledAmountDelta: -10_000 } },
        { occurredAt: later, paymentEffect: { settledAmountDelta: 0 } },
        { occurredAt: outside, paymentEffect: { settledAmountDelta: 999_999 } },
      ],
      window
    );
    expect(revenue).toBe(70_000);
    const withRefund = financialOverviewTotalsFromMonetaryEffects(
      [
        { occurredAt: inWindow, paymentEffect: { settledAmountDelta: 80_000 } },
        { occurredAt: later, paymentEffect: { refundedAmountDelta: 15_000 } },
        { occurredAt: later, paymentEffect: { writtenOffAmountDelta: 40_000 } },
        {
          occurredAt: later,
          paymentEffect: { settledAmountDelta: -5_000, refundedAmountDelta: 5_000 },
        },
      ],
      window
    );
    expect(withRefund.settledRevenueKzt).toBe(75_000);
    expect(withRefund.refundedKzt).toBe(20_000);
    expect(withRefund.netSettledKzt).toBe(60_000);
  });

  it('filters school monetary movement by search, direction, and source', () => {
    const event = {
      eventId: 'evt_1',
      eventKind: 'wallet_credit',
      sourceKind: 'admin_adjustment',
      direction: 'in',
      paymentId: 'payment_1',
      walletAccountId: 'account_1',
    } as const;
    expect(
      matchesSchoolMovementFilters(event as never, 'payment_1', 'in', 'admin_adjustment')
    ).toBe(true);
    expect(matchesSchoolMovementFilters(event as never, 'nope', 'in', 'admin_adjustment')).toBe(
      false
    );
    expect(matchesSchoolMovementFilters(event as never, '', 'out', 'all')).toBe(false);
  });

  it('maps planner occupancy including lessons, course days, and availability blocks', () => {
    const occupancy = [
      {
        occupancyKind: 'lesson_booking',
        occupancyId: 'booking_1',
        bookingId: 'booking_1',
        instructorId: 'ins_1',
        localDate: '2026-09-01',
        localTime: '10:00',
        durationMinutes: 60,
        displayTitle: 'Lesson',
        isGuest: false,
      },
      {
        occupancyKind: 'course_day',
        occupancyId: 'day_1',
        courseDayId: 'day_1',
        courseId: 'course_1',
        instructorId: 'ins_1',
        localDate: '2026-09-01',
        localTime: '12:00',
        durationMinutes: 120,
        displayTitle: 'Group',
        timeZone: 'Asia/Almaty',
        interval: {
          startsAt: { seconds: 1_788_246_000, nanoseconds: 0 },
          endsAt: { seconds: 1_788_253_200, nanoseconds: 0 },
        },
      },
      {
        occupancyKind: 'availability_block',
        occupancyId: 'block_1',
        blockId: 'block_1',
        blockKind: 'break',
        instructorId: 'ins_1',
        localDate: '2026-09-01',
        localTime: '14:00',
        durationMinutes: 60,
        displayTitle: 'Break',
      },
    ] as unknown as AdminPlannerOccupancyItem[];
    const mapped = mapPlannerOccupancyToBookings(occupancy);
    expect(mapped).toHaveLength(2);
    expect(mapped[0]?.id).toBe('booking_1');
    expect(mapped[1]?.userId).toBe('system_block_break');
    expect(mapPlannerCourses(occupancy)).toEqual([
      expect.objectContaining({
        id: 'day_1',
        instructorIds: ['ins_1'],
        dates: '01.09.2026, 12:00 - 14:00',
      }),
    ]);
    const sharedDay = mapPlannerCourses([
      {
        occupancyKind: 'course_day',
        occupancyId: 'day_shared:ins_1',
        courseDayId: 'day_shared',
        courseId: 'course_1',
        instructorId: 'ins_1',
        localDate: '2026-09-01',
        localTime: '12:00',
        durationMinutes: 120,
        displayTitle: 'Group',
        timeZone: 'Asia/Almaty',
        interval: {
          startsAt: { seconds: 1_788_246_000, nanoseconds: 0 },
          endsAt: { seconds: 1_788_253_200, nanoseconds: 0 },
        },
      },
      {
        occupancyKind: 'course_day',
        occupancyId: 'day_shared:ins_2',
        courseDayId: 'day_shared',
        courseId: 'course_1',
        instructorId: 'ins_2',
        localDate: '2026-09-01',
        localTime: '12:00',
        durationMinutes: 120,
        displayTitle: 'Group',
        timeZone: 'Asia/Almaty',
        interval: {
          startsAt: { seconds: 1_788_246_000, nanoseconds: 0 },
          endsAt: { seconds: 1_788_253_200, nanoseconds: 0 },
        },
      },
    ] as unknown as AdminPlannerOccupancyItem[]);
    expect(sharedDay.map((row) => row.id)).toEqual(['day_shared:ins_1', 'day_shared:ins_2']);
    expect(sharedDay.map((row) => row.instructorIds[0])).toEqual(['ins_1', 'ins_2']);
    expect(
      readRepoFile('functions/src/canonical/readModels/instructorOccupancyReadSupport.ts')
    ).toContain('occurrence.interval.startsAt.seconds');
    expect(
      readRepoFile('functions/src/canonical/readModels/instructorOccupancyReadSupport.ts')
    ).toContain("collectionGroup('days')");
    expect(
      readRepoFile('functions/src/canonical/readModels/instructorOccupancyReadSupport.ts')
    ).not.toContain('PLANNER_BOOKING_SCAN_LIMIT');
  });

  it('wires planner mutations through canonical commands rather than addBookingDirect', () => {
    const commands = readRepoFile('src/features/admin/operations/adminPlannerCommands.ts');
    const board = readRepoFile('src/features/admin/operations/AdminPlannerBoard.tsx');
    expect(commands).toContain("kind: 'create_administrative_availability_block'");
    expect(commands).toContain("kind: 'reschedule_booking'");
    expect(commands).toContain("kind: 'change_booking_instructor'");
    expect(commands).toContain("kind: 'reschedule_course_day'");
    expect(commands).toContain("kind: 'reassign_course_day_instructor'");
    expect(commands).toContain('loadPlannerLessonDetail');
    expect(board).toContain('createPlannerOccupancyFromLegacyBookingShape');
    expect(board).toContain('stale_version');
    expect(board).toContain('throw error');
    expect(board).not.toContain('addBookingDirect');
    expect(readRepoFile('src/app/routes/AdminRouteContainer.tsx')).not.toContain('onAddBooking');
  });

  it('keeps linked guest payments in guest finance and binds account/payment query keys', () => {
    const lessonRm = {
      bookingId: 'booking_guest_1',
      bookingOrigin: 'guest',
      lifecycle: { status: 'confirmed' },
      occurrence: {
        startsAt: { seconds: 1_788_249_600, nanoseconds: 0 },
        timeZone: 'Asia/Almaty',
      },
      participants: [{ participantId: 'part_1', displayName: 'Ivan Guest' }],
      admin: {
        participants: [{ participantId: 'part_1', displayName: 'Ivan Guest' }],
        payer: { accountId: 'account_linked_1' },
        payment: { paymentId: 'payment_guest_1', price: 18000 },
      },
    } as unknown as LessonBookingReadModel;
    const linkedEnrollment = {
      enrollmentId: 'enroll_linked_1',
      guestState: 'linked',
      lifecycleStatus: 'confirmed',
      participant: { displayName: 'Child Guest' },
      payer: { accountId: 'account_linked_2' },
      payment: { paymentId: 'payment_enroll_1', price: 90000 },
      course: { title: 'Kids Camp' },
      updatedAt: { seconds: 1_788_249_600, nanoseconds: 0 },
    } as unknown as AdminCourseEnrollmentRosterItem;
    const rows = guestFinanceRowsFromReadModels([lessonRm], [linkedEnrollment]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.identityState).toBe('linked_guest');
    expect(rows[0]?.payerAccountId).toBe('account_linked_1');
    expect(rows[0]?.paymentId).toBe('payment_guest_1');
    expect(rows[1]?.identityState).toBe('linked_guest');
    const guestPanel = readRepoFile('src/features/admin/finance/CanonicalGuestFinancePanel.tsx');
    expect(guestPanel).toContain('ADMIN_FINANCE_ACCOUNT_QUERY_KEY');
    expect(guestPanel).toContain('ADMIN_FINANCE_PAYMENT_QUERY_KEY');
    expect(readRepoFile('src/features/admin/components/bookings/BookingsLog.tsx')).toContain(
      'openEnrollmentAttendance'
    );
    expect(readRepoFile('src/features/admin/components/users/ClientsManager.tsx')).toContain(
      'accountActivateDeactivate'
    );
    expect(readRepoFile('src/features/admin/components/users/ClientsManager.tsx')).toContain(
      'onAddUser ?'
    );
  });

  it('blocks instructor deactivation on course-day occupancy as well as active lessons', () => {
    const occupancy = [
      lesson({ id: 'booking_1', instructorId: 'ins_1', status: 'confirmed' }),
      lesson({
        id: 'day_1',
        instructorId: 'ins_1',
        userId: 'course_day_course_1',
        status: 'confirmed',
      }),
      lesson({
        id: 'block_1',
        instructorId: 'ins_1',
        userId: 'system_block_break',
        status: 'confirmed',
      }),
    ];
    const blocking = bookingsBlockingInstructorDeactivation(occupancy, 'ins_1');
    expect(blocking.map((row) => row.id)).toEqual(['booking_1', 'day_1']);
  });

  it('preserves profile-store client balances when merging identity accounts', () => {
    const merged = mergeAdminClientDirectory(
      [{ ...user, balanceUSD: 42 }],
      [
        {
          accountId: 'account_client_1',
          displayName: 'Client One',
          email: 'c@example.com',
          lifecycle: 'active',
          role: { role: 'user' },
          managedParticipantCount: 1,
          instructorLink: { isInstructor: false },
          diagnosticCount: 0,
          authorizedActions: [],
        } as never,
      ]
    );
    expect(merged[0]?.balanceUSD).toBe(42);
  });

  it('uses canonical identity commands for people mutations', () => {
    const people = readRepoFile('src/features/admin/people/AdminPeopleSection.tsx');
    expect(people).toContain("kind: 'change_account_role'");
    expect(people).toContain("kind: 'create_instructor_catalog_entry'");
    expect(people).toContain("kind: 'update_instructor_catalog_profile'");
    expect(people).not.toContain('addInstructorService');
    expect(people).not.toContain('updateDoc');
    expect(people).toContain('windowDays: 62');
    expect(readRepoFile('src/features/admin/components/finance/FinancialOverview.tsx')).toContain(
      'exchangeRateDisplayOnly'
    );
    expect(readRepoFile('src/features/admin/components/finance/FinancialOverview.tsx')).toContain(
      "t('totalRevenue')"
    );
    expect(readRepoFile('src/features/admin/components/finance/FinancialOverview.tsx')).toContain(
      'adminFinanceOverviewLoadFailed'
    );
    expect(readRepoFile('src/features/admin/components/finance/FinancialOverview.tsx')).toContain(
      'onOpenPeriodMovement'
    );
    expect(readRepoFile('src/features/admin/operations/AdminFinancialOverviewHost.tsx')).toContain(
      'finance.item?.netSettledKzt'
    );
    expect(
      readRepoFile('src/features/admin/operations/AdminFinancialOverviewHost.tsx')
    ).not.toContain('?? 0');
    expect(readRepoFile('src/features/admin/components/AdminPanel.tsx')).toContain(
      'ADMIN_FINANCE_MOVEMENT_FOCUS_QUERY_KEY'
    );
    expect(
      readRepoFile('src/features/admin/components/courses/CanonicalCoursesManager.tsx')
    ).toContain('CoursesTable');
    expect(
      readRepoFile('src/features/admin/components/courses/CanonicalCoursesManager.tsx')
    ).toContain('enrolledNamesByCourseId');
    expect(
      readRepoFile('functions/src/canonical/readModels/instructorOccupancyReadSupport.ts')
    ).toContain('`${day.courseDayId}:${instructorId}`');
  });

  it('maps canonical course rows and enrollment names into the historical table density', () => {
    const mapped = mapAdminCourseToTableCourse({
      courseId: 'course_1',
      title: 'Kids Camp',
      lifecycle: 'active',
      price: 90_000,
      capacity: { totalSeats: 10, availableSeats: 7, occupiedConfirmedSeats: 3 },
      instructorRosterIds: ['ins_1'],
      instructors: [{ instructorId: 'ins_1', name: 'Anna' }],
      courseDays: [
        {
          interval: {
            startsAt: { seconds: 1_788_249_600, nanoseconds: 0 },
            endsAt: { seconds: 1_788_256_800, nanoseconds: 0 },
          },
          timeZone: 'Asia/Almaty',
        },
      ],
      catalogContent: {
        status: 'present',
        content: {
          duration: '3 days',
          description: 'Camp',
          dates: '1–3 Jan',
          bgImageUrl: 'https://example.com/c.png',
          level: 'beginner',
          isHidden: false,
        },
      },
    } as never);
    expect(mapped.priceKZT).toBe(90_000);
    expect(mapped.availableSeats).toBe(7);
    expect(mapped.duration).toBe('3 days');
    expect(mapped.dates).toBe('1–3 Jan');
    const names = enrolledNamesByCourseId([
      {
        course: { courseId: 'course_1' },
        participant: { displayName: 'Child A' },
        lifecycleStatus: 'confirmed',
      },
      {
        course: { courseId: 'course_1' },
        participant: { displayName: 'Child B' },
        lifecycleStatus: 'cancelled',
      },
    ] as never);
    expect(names.get('course_1')).toEqual(['Child A']);
  });
});
