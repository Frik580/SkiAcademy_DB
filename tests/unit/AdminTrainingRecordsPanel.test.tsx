import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  AdminCourseEnrollmentDetailReadModel,
  AdminCourseEnrollmentRosterItem,
  LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lessonReadMock = vi.fn();
const courseReadMock = vi.fn();
const lessonAttemptMock = vi.fn();
const courseAttemptMock = vi.fn();
const courseListMock = vi.fn();

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));

vi.mock('../../src/features/admin/lesson-bookings/useAdminLessonBookingReadModels', () => ({
  useAdminLessonBookingReadModels: (...args: unknown[]) => lessonReadMock(...args),
}));

vi.mock('../../src/features/admin/lesson-bookings/useAdminLessonBookingCommands', () => ({
  useAdminLessonBookingCommands: () => ({
    runAttempt: (...args: unknown[]) => lessonAttemptMock(...args),
  }),
}));

vi.mock('../../src/features/admin/course-enrollments/useAdminCourseEnrollmentReadModels', () => ({
  useAdminCourseEnrollmentReadModels: (...args: unknown[]) => courseReadMock(...args),
}));

vi.mock('../../src/features/admin/course-enrollments/useAdminCourseEnrollmentCommands', () => ({
  useAdminCourseEnrollmentCommands: () => ({
    runAttempt: (...args: unknown[]) => courseAttemptMock(...args),
  }),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminCourseReadModels: (...args: unknown[]) => courseListMock(...args),
}));

vi.mock('../../src/features/admin/operations/AdminMonitorReadModelsContext', () => ({
  useSharedAdminMonitorReadModels: () => ({
    refreshAllProjections: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../src/features/admin/identity', () => ({
  AdminManagedParticipantPicker: ({
    selected,
    onChange,
  }: {
    selected?: { accountId: string; participantId: string; displayName: string };
    onChange: (
      selection:
        | { accountId: string; participantId: string; displayName: string }
        | undefined
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          accountId: 'account_create_01',
          participantId: 'participant_create_01',
          displayName: 'Managed Client',
        })
      }
    >
      {selected ? `selected:${selected.displayName}` : 'pick managed'}
    </button>
  ),
}));

import { AdminTrainingRecordsPanel } from '../../src/features/admin/training-records/AdminTrainingRecordsPanel';

const timestamp = { seconds: 1_788_000_000, nanoseconds: 0 };

function lessonItem(): LessonBookingReadModel {
  return {
    bookingId: 'booking_training_01',
    revision: 2,
    partyKind: 'individual',
    participantIds: ['participant_lesson_01'],
    participants: [{ participantId: 'participant_lesson_01', displayName: 'Lesson Skier' }],
    instructor: { instructorId: 'instructor_01', displayName: 'Coach One' },
    occurrence: {
      startsAt: timestamp,
      endsAt: { seconds: timestamp.seconds + 3600, nanoseconds: 0 },
      durationMinutes: 60,
      timeZone: 'Asia/Almaty',
    },
    lifecycle: { status: 'confirmed' },
    bookingOrigin: 'account',
    updatedAt: timestamp,
    admin: {
      participants: [{ participantId: 'participant_lesson_01', displayName: 'Lesson Skier' }],
      payment: {
        paymentId: 'payment_lesson_01',
        status: 'paid',
        revision: 1,
        currency: 'KZT',
        price: 20_000,
        originalPrice: 20_000,
        paid: 20_000,
        outstanding: 0,
        refunded: 0,
        retained: 20_000,
        settled: 20_000,
        writtenOff: 0,
      },
      relatedIssues: [],
      attendance: [],
      authorizedActions: {
        canConfirmGuest: false,
        canRecordGuestPayment: false,
        canDirectCancel: true,
        canReschedule: true,
        canChangeInstructor: false,
        canChangeDuration: false,
        canRecordAttendance: false,
        canResolveCancellation: false,
        canResolveAttendanceOutcome: false,
        canLinkGuestToAccount: false,
      },
    },
  } as LessonBookingReadModel;
}

function courseItem(
  overrides: Partial<AdminCourseEnrollmentRosterItem> = {}
): AdminCourseEnrollmentRosterItem {
  return {
    enrollmentId: 'course_enrollment_training_01',
    revision: 3,
    course: {
      courseId: 'course_training_01',
      title: 'Avalanche Group',
      lifecycle: 'active',
      revision: 1,
    },
    participant: { participantId: 'participant_course_01', displayName: 'Course Skier' },
    lifecycleStatus: 'confirmed',
    guestState: 'not_guest',
    payment: {
      paymentId: 'payment_course_01',
      status: 'unpaid',
      revision: 2,
      price: 40_000,
      paid: 0,
      refunded: 0,
      retained: 0,
      settled: 0,
      writtenOff: 0,
      outstanding: 40_000,
    },
    relatedIssues: [],
    authorizedActions: {
      canRecordPayment: true,
      canResolveCancellation: false,
      canTransfer: false,
      canReconcile: false,
      canResolveAttendanceOutcome: false,
      canCancelUnpaidGuest: false,
      canApproveGuest: false,
      canLinkGuest: false,
      canWithdraw: false,
    },
    updatedAt: { seconds: timestamp.seconds + 10, nanoseconds: 0 },
    ...overrides,
  };
}

function courseDetail(
  item = courseItem()
): AdminCourseEnrollmentDetailReadModel {
  return {
    ...item,
    originalCourseId: item.course.courseId,
    paymentId: item.payment!.paymentId,
    capacity: { totalSeats: 8, availableSeats: 3, seatHeldByEnrollment: true },
    transfer: { eligible: false, blockedReason: 'lifecycle', targetOptions: [] },
    reconciliation: { eligible: false, evidenceIssueIds: [] },
    attendanceDays: [],
    auditContext: {
      bookingOrigin: 'account',
      createdAt: timestamp,
      updatedAt: item.updatedAt,
    },
  };
}

function stubReads(input?: {
  readonly lesson?: LessonBookingReadModel;
  readonly course?: AdminCourseEnrollmentRosterItem;
  readonly courseDetail?: AdminCourseEnrollmentDetailReadModel;
}) {
  const lesson = input?.lesson ?? lessonItem();
  const course = input?.course ?? courseItem();
  lessonReadMock.mockReturnValue({
    list: { items: [lesson], loading: false, loadingMore: false, hasMore: false },
    detail: { item: lesson, loading: false },
    retryList: vi.fn(),
    retryDetail: vi.fn(),
    loadMore: vi.fn(),
    refreshBooking: vi.fn().mockResolvedValue({ status: 'success' }),
  });
  courseReadMock.mockReturnValue({
    list: { items: [course], loading: false, loadingMore: false, hasMore: false },
    detail: { item: input?.courseDetail ?? courseDetail(course), loading: false },
    retryList: vi.fn(),
    retryDetail: vi.fn(),
    loadMore: vi.fn(),
    refreshList: vi.fn(),
    refreshEnrollment: vi.fn(),
  });
}

function renderPanel(path = '/admin?tab=operations') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminTrainingRecordsPanel adminAccountId="admin_account_01" instructors={[]} />
    </MemoryRouter>
  );
}

describe('AdminTrainingRecordsPanel', () => {
  beforeEach(() => {
    lessonReadMock.mockReset();
    courseReadMock.mockReset();
    lessonAttemptMock.mockReset();
    courseAttemptMock.mockReset();
    courseListMock.mockReset();
    courseListMock.mockResolvedValue({
      scope: 'admin_course_list',
      items: [
        {
          courseId: 'course_training_01',
          title: 'Avalanche Group',
          revision: 1,
          lifecycle: 'active',
          capacity: { availableSeats: 3 },
        },
      ],
    });
    stubReads();
    lessonAttemptMock.mockResolvedValue({ status: 'success' });
    courseAttemptMock.mockResolvedValue({ status: 'success' });
  });

  it('renders both lessons and course enrollments in All', async () => {
    renderPanel();
    expect(await screen.findByText('Lesson Skier')).toBeVisible();
    expect(screen.getByText('Course Skier')).toBeVisible();
    expect(screen.getAllByText('adminTrainingKindLesson').length).toBeGreaterThan(0);
    expect(screen.getAllByText('adminTrainingKindCourse').length).toBeGreaterThan(0);
  });

  it('filters to lessons only', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'adminTrainingFilterLessons' }));
    expect(await screen.findByText('Lesson Skier')).toBeVisible();
    expect(screen.queryByText('Course Skier')).not.toBeInTheDocument();
  });

  it('filters to courses only', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'adminTrainingFilterCourses' }));
    expect(await screen.findByText('Course Skier')).toBeVisible();
    expect(screen.queryByText('Lesson Skier')).not.toBeInTheDocument();
  });

  it('keeps lesson payment capture reachable from the unified detail', async () => {
    const unpaid = lessonItem();
    unpaid.admin = {
      ...unpaid.admin!,
      payment: { ...unpaid.admin!.payment, status: 'unpaid', outstanding: 20_000, paid: 0 },
      authorizedActions: { ...unpaid.admin!.authorizedActions, canRecordGuestPayment: true },
    };
    stubReads({ lesson: unpaid });
    renderPanel('/admin?tab=operations&booking=booking_training_01');
    fireEvent.click(screen.getByRole('tab', { name: /^adminLessonPaymentTitle/ }));
    expect(screen.getByRole('button', { name: 'adminLessonRecordPayment' })).toBeVisible();
  });

  it('shows course Accept payment when authorized', async () => {
    renderPanel('/admin?tab=operations&enrollment=course_enrollment_training_01');
    fireEvent.click(await screen.findByRole('tab', { name: /Finances/ }));
    expect(screen.getByRole('button', { name: 'Accept payment' })).toBeVisible();
  });

  it('hides course Accept payment when capture is not authorized', async () => {
    const paid = courseItem({
      payment: {
        paymentId: 'payment_course_01',
        status: 'paid',
        revision: 2,
        price: 40_000,
        paid: 40_000,
        refunded: 0,
        retained: 40_000,
        settled: 40_000,
        writtenOff: 0,
        outstanding: 0,
      },
      authorizedActions: {
        ...courseItem().authorizedActions,
        canRecordPayment: false,
      },
    });
    stubReads({ course: paid, courseDetail: courseDetail(paid) });
    renderPanel('/admin?tab=operations&enrollment=course_enrollment_training_01');
    fireEvent.click(await screen.findByRole('tab', { name: /Finances/ }));
    expect(screen.queryByRole('button', { name: 'Accept payment' })).not.toBeInTheDocument();
  });

  it('keeps enroll-on-behalf in course context, not on a random selected enrollment', async () => {
    renderPanel('/admin?tab=operations&trainingKind=course&enrollmentCourse=course_training_01');
    expect(await screen.findByRole('button', { name: 'Create on behalf' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'pick managed' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Phone enrollment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create on behalf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(courseAttemptMock).toHaveBeenCalledTimes(1));
    expect(courseAttemptMock.mock.calls[0]?.[0]).toMatchObject({
      kind: 'create_course_enrollments',
      courseId: 'course_training_01',
      participantId: 'participant_create_01',
    });
  });

  it('switches detail actions when selecting a course after a lesson', async () => {
    renderPanel('/admin?tab=operations&booking=booking_training_01');
    expect(await screen.findByText('adminLessonOverviewTitle')).toBeVisible();
    fireEvent.click(screen.getByText('Course Skier'));
    expect(await screen.findByRole('tab', { name: /Finances/ })).toBeVisible();
    expect(screen.queryByText('adminLessonOverviewTitle')).not.toBeInTheDocument();
  });
});
