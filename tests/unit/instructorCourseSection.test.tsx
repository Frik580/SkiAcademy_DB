import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

const queryEnrollmentMock = vi.fn();
const queryAttendanceMock = vi.fn();
const queryAssignmentMock = vi.fn();

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
      expect(screen.getByText('BASE — First Turns')).toBeInTheDocument();
    });
    expect(screen.getByText('Canonical Student')).toBeInTheDocument();
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
      expect(screen.getByText('Day-Only Course')).toBeInTheDocument();
    });
    expect(screen.getByText(/instructorCourseAssignedDays/)).toBeInTheDocument();
    expect(screen.getByText('instructorCourseRosterEmpty')).toBeInTheDocument();
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
