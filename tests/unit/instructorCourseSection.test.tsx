import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { InstructorCourseSection } from '../../src/features/instructor-workspace/components/InstructorCourseSection';
import { useInstructorCourseStore } from '../../src/features/instructor-courses/instructorCourseStore';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';

const queryEnrollmentMock = vi.fn();
const queryAttendanceMock = vi.fn();
const queryAssignmentMock = vi.fn();
const executeAuthenticatedMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) => executeAuthenticatedMock(...args),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseEnrollmentReadModels: (...args: unknown[]) => queryEnrollmentMock(...args),
  queryCourseAttendanceReadModels: (...args: unknown[]) => queryAttendanceMock(...args),
  queryInstructorCourseAssignmentReadModels: (...args: unknown[]) => queryAssignmentMock(...args),
}));

const rosterCourseId = CourseIdSchema.parse('course_instructor_ui_01');
const dayOnlyCourseId = CourseIdSchema.parse('course_instructor_ui_02');
const rosterCourseDayId = CourseDayIdSchema.parse('course_day_instructor_ui_01');
const dayOnlyCourseDayId = CourseDayIdSchema.parse('course_day_instructor_ui_02');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_instructor_ui_01');
const participantId = ParticipantIdSchema.parse('participant_instructor_ui_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));

function buildAssignmentItem(input: {
  courseId: typeof rosterCourseId;
  title: string;
  assignedCourseDayIds: readonly (typeof rosterCourseDayId)[];
  courseDayId: typeof rosterCourseDayId;
}) {
  return {
    courseId: input.courseId,
    revision: 1,
    title: input.title,
    assignedCourseDayIds: [...input.assignedCourseDayIds],
    courseSchedule: {
      courseId: input.courseId,
      courseScheduleRevision: 1,
      courseDayCount: 2,
      startAt: dayStart,
      finalCourseDayEndsAt: dayEnd,
      courseDays: [
        {
          courseDayId: input.courseDayId,
          dayOrder: input.assignedCourseDayIds[0] === input.courseDayId ? 1 : 2,
          interval: { startsAt: dayStart, endsAt: dayEnd },
          timeZone: 'Asia/Almaty',
          revision: 1,
        },
        {
          courseDayId:
            input.courseDayId === rosterCourseDayId ? dayOnlyCourseDayId : rosterCourseDayId,
          dayOrder: input.assignedCourseDayIds[0] === input.courseDayId ? 2 : 1,
          interval: { startsAt: dayStart, endsAt: dayEnd },
          timeZone: 'Asia/Almaty',
          revision: 1,
        },
      ],
    },
    updatedAt: decidedAt,
  };
}

function renderSection() {
  return render(
    <LanguageProvider>
      <InstructorCourseSection
        accountId="account_instructor_ui_01"
        instructorId="instructor_instructor_ui_01"
        t={(key) => key}
      />
    </LanguageProvider>
  );
}

describe('InstructorCourseSection', () => {
  beforeEach(() => {
    useInstructorCourseStore.getState().reset();
    queryEnrollmentMock.mockReset();
    queryAttendanceMock.mockReset();
    queryAssignmentMock.mockReset();
    executeAuthenticatedMock.mockReset();
    executeAuthenticatedMock.mockResolvedValue({ status: 'success', payload: {} });
    queryAttendanceMock.mockResolvedValue({
      scope: 'instructor_roster',
      items: [],
    });
  });

  it('shows canonical assigned course for roster instructor', async () => {
    queryAssignmentMock.mockResolvedValue({
      scope: 'instructor_assigned',
      items: [
        buildAssignmentItem({
          courseId: rosterCourseId,
          title: 'BASE — First Turns',
          assignedCourseDayIds: [rosterCourseDayId, dayOnlyCourseDayId],
          courseDayId: rosterCourseDayId,
        }),
      ],
    });
    queryEnrollmentMock.mockResolvedValue({
      scope: 'instructor_roster',
      items: [
        {
          enrollmentId,
          revision: 1,
          courseId: rosterCourseId,
          participant: {
            participantId,
            displayName: 'Canonical Student',
          },
          lifecycle: { status: 'confirmed' },
          courseDisplay: { courseId: rosterCourseId, title: 'BASE — First Turns' },
          courseSchedule: buildAssignmentItem({
            courseId: rosterCourseId,
            title: 'BASE — First Turns',
            assignedCourseDayIds: [rosterCourseDayId, dayOnlyCourseDayId],
            courseDayId: rosterCourseDayId,
          }).courseSchedule,
          authorizedActions: { canRecordAttendance: true },
          updatedAt: decidedAt,
        },
      ],
      hasMore: false,
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getAllByText('BASE — First Turns').length).toBeGreaterThan(0);
      expect(screen.getByText('Canonical Student')).toBeInTheDocument();
    });
    expect(screen.getAllByText('instructorCourseDay 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('instructorCourseDay 2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('instructorAttendanceMissing').length).toBeGreaterThan(0);
    expect(screen.getByText('instructorAttendanceUnavailableReason')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Canonical Student: instructorAttendancePresent',
      })
    ).toBeDisabled();
    expect(screen.queryByText(participantId)).not.toBeInTheDocument();
  });

  it('shows course discovered for CourseDay-only instructor with assigned day summary', async () => {
    queryAssignmentMock.mockResolvedValue({
      scope: 'instructor_assigned',
      items: [
        buildAssignmentItem({
          courseId: dayOnlyCourseId,
          title: 'Day-Only Course',
          assignedCourseDayIds: [dayOnlyCourseDayId],
          courseDayId: dayOnlyCourseDayId,
        }),
      ],
    });
    queryEnrollmentMock.mockResolvedValue({
      scope: 'instructor_roster',
      items: [],
      hasMore: false,
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getAllByText('Day-Only Course').length).toBeGreaterThan(0);
      expect(screen.getByText('instructorCourseRosterEmpty')).toBeInTheDocument();
    });
    expect(screen.getByText(/instructorCourseAssignedDays/)).toBeInTheDocument();
    expect(screen.getAllByText('instructorCourseDay 1').length).toBeGreaterThan(0);
    expect(screen.queryByText('instructorCourseDay 2')).not.toBeInTheDocument();
  });

  it('changes selected CourseDay without showing a stale attendance projection', async () => {
    queryAssignmentMock.mockResolvedValue({
      scope: 'instructor_assigned',
      items: [
        buildAssignmentItem({
          courseId: rosterCourseId,
          title: 'Attendance Course',
          assignedCourseDayIds: [rosterCourseDayId, dayOnlyCourseDayId],
          courseDayId: rosterCourseDayId,
        }),
      ],
    });
    queryEnrollmentMock.mockResolvedValue({
      scope: 'instructor_roster',
      items: [
        {
          enrollmentId,
          revision: 1,
          courseId: rosterCourseId,
          participant: { participantId, displayName: 'Canonical Student' },
          lifecycle: { status: 'confirmed' },
          courseDisplay: { courseId: rosterCourseId, title: 'Attendance Course' },
          courseSchedule: buildAssignmentItem({
            courseId: rosterCourseId,
            title: 'Attendance Course',
            assignedCourseDayIds: [rosterCourseDayId, dayOnlyCourseDayId],
            courseDayId: rosterCourseDayId,
          }).courseSchedule,
          authorizedActions: { canRecordAttendance: true },
          updatedAt: decidedAt,
        },
      ],
      hasMore: false,
    });
    queryAttendanceMock.mockResolvedValue({
      scope: 'instructor_roster',
      items: [
        {
          enrollmentId,
          enrollmentRevision: 1,
          courseId: rosterCourseId,
          participantId,
          participantDisplayName: 'Canonical Student',
          days: [
            {
              courseDayId: rosterCourseDayId,
              factualState: 'present',
              attendanceId: 'attendance_instructor_ui_01',
              attendanceRevision: 1,
              attendanceStatus: 'present',
              courseDayRevision: 1,
              authorizedActions: { canRecordAttendance: true },
            },
            {
              courseDayId: dayOnlyCourseDayId,
              factualState: 'absent',
              attendanceId: 'attendance_instructor_ui_02',
              attendanceRevision: 1,
              attendanceStatus: 'absent',
              courseDayRevision: 1,
              authorizedActions: { canRecordAttendance: false },
            },
          ],
        },
      ],
    });

    renderSection();

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'Canonical Student: instructorAttendancePresent',
        })
      ).toHaveAttribute('aria-pressed', 'true');
    });
    expect(screen.getByText('instructorAttendanceWindowOpen')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /instructorCourseDay 2/ }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'Canonical Student: instructorAttendanceAbsent',
        })
      ).toHaveAttribute('aria-pressed', 'true');
    });
    expect(
      screen.getByRole('button', {
        name: 'Canonical Student: instructorAttendancePresent',
      })
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('instructorAttendanceEditingUnavailable')).toBeInTheDocument();
  });

  it('records canonical attendance with fresh revisions and renders only refetched server state', async () => {
    queryAssignmentMock.mockResolvedValue({
      scope: 'instructor_assigned',
      items: [
        buildAssignmentItem({
          courseId: rosterCourseId,
          title: 'Mutation Course',
          assignedCourseDayIds: [rosterCourseDayId],
          courseDayId: rosterCourseDayId,
        }),
      ],
    });
    queryEnrollmentMock.mockResolvedValue({
      scope: 'instructor_roster',
      items: [
        {
          enrollmentId,
          revision: 7,
          courseId: rosterCourseId,
          participant: { participantId, displayName: 'Canonical Student' },
          lifecycle: { status: 'confirmed' },
          courseDisplay: { courseId: rosterCourseId, title: 'Mutation Course' },
          courseSchedule: buildAssignmentItem({
            courseId: rosterCourseId,
            title: 'Mutation Course',
            assignedCourseDayIds: [rosterCourseDayId],
            courseDayId: rosterCourseDayId,
          }).courseSchedule,
          authorizedActions: { canRecordAttendance: true },
          updatedAt: decidedAt,
        },
      ],
      hasMore: false,
    });

    let serverStatus: 'missing' | 'present' | 'absent' = 'missing';
    let attendanceRevision: number | undefined;
    queryAttendanceMock.mockImplementation(() =>
      Promise.resolve({
        scope: 'instructor_roster',
        items: [
          {
            enrollmentId,
            enrollmentRevision: 7,
            courseId: rosterCourseId,
            participantId,
            participantDisplayName: 'Canonical Student',
            days: [
              {
                courseDayId: rosterCourseDayId,
                factualState: serverStatus,
                courseDayRevision: 1,
                authorizedActions: { canRecordAttendance: true },
                ...(serverStatus !== 'missing' && attendanceRevision !== undefined
                  ? {
                      attendanceId: 'attendance_instructor_ui_mutation',
                      attendanceRevision,
                      attendanceStatus: serverStatus,
                    }
                  : {}),
              },
            ],
          },
        ],
      })
    );
    executeAuthenticatedMock.mockImplementation(
      async (
        _accountId: string,
        command: { intent: { attendanceStatus: 'present' | 'absent' } }
      ) => {
        serverStatus = command.intent.attendanceStatus;
        attendanceRevision = (attendanceRevision ?? 0) + 1;
        return { status: 'success', payload: {} };
      }
    );

    renderSection();

    await waitFor(() => {
      expect(queryAttendanceMock).toHaveBeenCalled();
      expect(
        screen.getByRole('button', {
          name: 'Canonical Student: instructorAttendancePresent',
        })
      ).toBeInTheDocument();
    });
    const presentButton = screen.getByRole('button', {
      name: 'Canonical Student: instructorAttendancePresent',
    });
    expect(presentButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(presentButton);

    await waitFor(() => {
      expect(executeAuthenticatedMock).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole('button', {
          name: 'Canonical Student: instructorAttendancePresent',
        })
      ).toHaveAttribute('aria-pressed', 'true');
    });
    expect(executeAuthenticatedMock.mock.calls[0]?.[1]).toMatchObject({
      kind: 'record_course_day_attendance',
      exercisedCapability: 'instructor',
      intent: {
        courseEnrollmentId: enrollmentId,
        courseDayId: rosterCourseDayId,
        attendanceStatus: 'present',
        expectedEnrollmentRevision: 7,
      },
    });
    expect(executeAuthenticatedMock.mock.calls[0]?.[1].intent).not.toHaveProperty(
      'expectedAttendanceRevision'
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Canonical Student: instructorAttendanceAbsent',
      })
    );
    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'Canonical Student: instructorAttendanceAbsent',
        })
      ).toHaveAttribute('aria-pressed', 'true');
    });
    expect(executeAuthenticatedMock.mock.calls[1]?.[1]).toMatchObject({
      intent: {
        attendanceStatus: 'absent',
        expectedAttendanceRevision: 1,
        expectedEnrollmentRevision: 7,
      },
    });
    expect(queryAttendanceMock.mock.calls.length).toBeGreaterThanOrEqual(3);

    executeAuthenticatedMock.mockRejectedValueOnce(
      new CanonicalCommandClientError('stale_version', {
        correlationId: 'correlation_ui_stale_refresh_failed',
        currentRevision: 3,
        retryable: true,
      })
    );
    queryEnrollmentMock.mockRejectedValueOnce(new Error('read unavailable'));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Canonical Student: instructorAttendancePresent',
      })
    );

    await waitFor(() => {
      expect(screen.getByText('instructorAttendanceStaleRefreshFailed')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', {
        name: 'Canonical Student: instructorAttendancePresent',
      })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Canonical Student: instructorAttendanceAbsent',
      })
    ).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => {
      expect(screen.queryByText('instructorAttendanceStaleRefreshFailed')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: 'Canonical Student: instructorAttendancePresent',
        })
      ).toBeEnabled();
    });
    expect(executeAuthenticatedMock).toHaveBeenCalledTimes(3);
  });

  it('keeps an in-flight mutation scoped to its original CourseDay selection', async () => {
    queryAssignmentMock.mockResolvedValue({
      scope: 'instructor_assigned',
      items: [
        buildAssignmentItem({
          courseId: rosterCourseId,
          title: 'Pending Course',
          assignedCourseDayIds: [rosterCourseDayId, dayOnlyCourseDayId],
          courseDayId: rosterCourseDayId,
        }),
      ],
    });
    queryEnrollmentMock.mockResolvedValue({
      scope: 'instructor_roster',
      items: [
        {
          enrollmentId,
          revision: 3,
          courseId: rosterCourseId,
          participant: { participantId, displayName: 'Canonical Student' },
          lifecycle: { status: 'confirmed' },
          courseDisplay: { courseId: rosterCourseId, title: 'Pending Course' },
          courseSchedule: buildAssignmentItem({
            courseId: rosterCourseId,
            title: 'Pending Course',
            assignedCourseDayIds: [rosterCourseDayId, dayOnlyCourseDayId],
            courseDayId: rosterCourseDayId,
          }).courseSchedule,
          authorizedActions: { canRecordAttendance: true },
          updatedAt: decidedAt,
        },
      ],
      hasMore: false,
    });
    queryAttendanceMock.mockResolvedValue({
      scope: 'instructor_roster',
      items: [
        {
          enrollmentId,
          enrollmentRevision: 3,
          courseId: rosterCourseId,
          participantId,
          participantDisplayName: 'Canonical Student',
          days: [rosterCourseDayId, dayOnlyCourseDayId].map((courseDayId) => ({
            courseDayId,
            factualState: 'missing',
            courseDayRevision: 1,
            authorizedActions: { canRecordAttendance: true },
          })),
        },
      ],
    });
    let resolveMutation: ((value: { status: 'success'; payload: object }) => void) | undefined;
    executeAuthenticatedMock.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve;
      })
    );

    renderSection();
    await waitFor(() => {
      expect(queryAttendanceMock).toHaveBeenCalled();
      expect(
        screen.getByRole('button', {
          name: 'Canonical Student: instructorAttendancePresent',
        })
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Canonical Student: instructorAttendancePresent',
      })
    );
    await waitFor(() => {
      expect(executeAuthenticatedMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText('instructorAttendanceSaving')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /instructorCourseDay 2/ }));

    expect(screen.queryByText('instructorAttendanceSaving')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Canonical Student: instructorAttendancePresent',
      })
    ).toBeEnabled();

    resolveMutation?.({ status: 'success', payload: {} });
    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'Canonical Student: instructorAttendancePresent',
        })
      ).toBeEnabled();
    });
    expect(screen.getByRole('button', { name: /instructorCourseDay 2/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('shows empty state when instructor has no assigned courses', async () => {
    queryAssignmentMock.mockResolvedValue({
      scope: 'instructor_assigned',
      items: [],
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('instructorAssignedCoursesEmpty')).toBeInTheDocument();
    });
  });

  it('does not fall back to legacy data when canonical read fails', async () => {
    queryAssignmentMock.mockRejectedValue({
      code: 'functions/internal',
      message: 'read failed',
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('instructorCourseReadFailed')).toBeInTheDocument();
    });
    expect(screen.queryByText('BASE — First Turns')).not.toBeInTheDocument();
  });

  it('shows permission-denied state without legacy fallback', async () => {
    queryAssignmentMock.mockRejectedValue({
      code: 'functions/permission-denied',
      message: 'denied',
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('instructorCourseReadPermissionDenied')).toBeInTheDocument();
    });
  });

  it('retries canonical read after failure', async () => {
    let assignmentCalls = 0;
    queryAssignmentMock.mockImplementation(() => {
      assignmentCalls += 1;
      if (assignmentCalls === 1) {
        return Promise.reject({
          code: 'functions/internal',
          message: 'read failed',
        });
      }
      return Promise.resolve({
        scope: 'instructor_assigned',
        items: [
          buildAssignmentItem({
            courseId: rosterCourseId,
            title: 'Retry Course',
            assignedCourseDayIds: [rosterCourseDayId],
            courseDayId: rosterCourseDayId,
          }),
        ],
      });
    });
    queryEnrollmentMock.mockResolvedValue({
      scope: 'instructor_roster',
      items: [],
      hasMore: false,
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('instructorCourseReadFailed')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Retry Course').length).toBeGreaterThan(0);
    });
  });
});
