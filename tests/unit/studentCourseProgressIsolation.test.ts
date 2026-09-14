import { beforeEach, describe, expect, it } from 'vitest';
import type { CourseEnrollmentReadModel } from '@ski-academy/shared-domain';
import type { CourseEnrollmentCabinetItem } from '../../src/features/course-enrollments/courseEnrollmentContracts';
import {
  expandEnrollmentsToCourseDaySessions,
  isEnrolledInCourse,
  mapCourseEnrollmentReadModelToCabinetItem,
} from '../../src/features/course-enrollments/courseEnrollmentViewModel';
import { buildMixedCabinetSessionItems } from '../../src/features/course-enrollments/cabinetSessionItems';
import { filterCabinetCourseDaysForParticipant } from '../../src/features/course-enrollments/cabinetSessionItems';
import {
  filterEnrollmentsForParticipant,
  getEnrolledCourseIdsForParticipant,
  presentStudentCourseProgress,
  selectEnrollmentForCourseParticipant,
  toCourseProgressPresentation,
} from '../../src/features/course-enrollments/courseProgressViewModel';
import { useCourseEnrollmentStore } from '../../src/features/course-enrollments/courseEnrollmentStore';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';

const SELF = 'participant_self';
const CHILD_A = 'participant_child_a';
const CHILD_B = 'participant_child_b';
const COURSE_X = 'course_x';
const COURSE_Y = 'course_y';

const COPY = {
  progressLabel: 'Прогресс курса',
  attendedLabel: 'Посещено',
  attendanceLabel: 'Посещаемость',
  noDataLabel: 'Нет данных',
  completedLabel: 'Курс завершён',
  noShowLabel: 'Неявка',
  daysOf: (elapsed: number, scheduled: number) => `${elapsed} из ${scheduled}`,
};

function progress(input: {
  scheduledDays: number;
  elapsedDays: number;
  presentDays?: number;
  recordedDays?: number;
  attendanceRatePercent?: number | null;
}): CourseEnrollmentCabinetItem['courseProgress'] {
  const recordedDays = input.recordedDays ?? 0;
  const presentDays = input.presentDays ?? 0;
  return {
    scheduledDays: input.scheduledDays,
    elapsedDays: input.elapsedDays,
    recordedDays,
    presentDays,
    absentDays: recordedDays - presentDays,
    missingDays: input.scheduledDays - recordedDays,
    progressPercent: input.scheduledDays === 0 ? 0 : (input.elapsedDays / input.scheduledDays) * 100,
    attendanceCoveragePercent:
      input.scheduledDays === 0 ? 0 : (recordedDays / input.scheduledDays) * 100,
    attendanceRatePercent:
      input.attendanceRatePercent === undefined
        ? recordedDays === 0
          ? null
          : (presentDays / recordedDays) * 100
        : input.attendanceRatePercent,
  };
}

function enrollment(input: {
  enrollmentId: string;
  participantId: string;
  courseId: string;
  lifecycleStatus?: CourseEnrollmentCabinetItem['lifecycleStatus'];
  courseProgress?: CourseEnrollmentCabinetItem['courseProgress'];
}): CourseEnrollmentCabinetItem {
  const courseProgress =
    input.courseProgress ?? progress({ scheduledDays: 5, elapsedDays: 0, recordedDays: 0 });
  return {
    enrollmentId: input.enrollmentId,
    revision: 1,
    courseId: input.courseId,
    participantId: input.participantId,
    participantName: input.participantId,
    lifecycleStatus: input.lifecycleStatus ?? 'confirmed',
    courseTitle: input.courseId,
    courseSchedule: {
      courseId: input.courseId,
      courseScheduleRevision: 1,
      courseDayCount: 1,
      startAt: { seconds: 1_800_000_000, nanoseconds: 0 },
      finalCourseDayEndsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
      courseDays: [
        {
          courseDayId: `${input.enrollmentId}_day_1`,
          dayOrder: 1,
          interval: {
            startsAt: { seconds: 1_800_000_000, nanoseconds: 0 },
            endsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
          },
          timeZone: 'Asia/Almaty',
          revision: 1,
        },
      ],
    },
    scheduleStartDate: '2027-01-15',
    scheduleEndDate: '2027-01-15',
    bookingOrigin: 'account',
    authorizedActions: { canWithdraw: true, canRequestCancellation: false },
    courseProgress,
    updatedAtSeconds: 1_800_000_000,
  };
}

const lesson: LessonBookingCabinetItem = {
  id: 'booking_lesson_shared',
  bookingId: 'booking_lesson_shared',
  revision: 1,
  status: 'confirmed',
  date: '2027-01-10',
  time: '08:00',
  durationHours: 2,
  instructorId: 'instructor_fixture_01',
  instructorName: 'Coach',
  instructorAvatar: '',
  participantNames: ['Anyone'],
  partyKind: 'individual',
  payment: { kind: 'visible' },
  bookingOrigin: 'account',
  isLessonBooking: true,
};

describe('T32.9A.9C.C student course progress / participant isolation', () => {
  const selfX = enrollment({
    enrollmentId: 'enrollment_self_x',
    participantId: SELF,
    courseId: COURSE_X,
    courseProgress: progress({ scheduledDays: 5, elapsedDays: 2, recordedDays: 2, presentDays: 2 }),
  });
  const childAY = enrollment({
    enrollmentId: 'enrollment_a_y',
    participantId: CHILD_A,
    courseId: COURSE_Y,
    courseProgress: progress({ scheduledDays: 5, elapsedDays: 0 }),
  });
  const childAX = enrollment({
    enrollmentId: 'enrollment_a_x',
    participantId: CHILD_A,
    courseId: COURSE_X,
    courseProgress: progress({ scheduledDays: 5, elapsedDays: 2, recordedDays: 2, presentDays: 1 }),
  });
  const childBX = enrollment({
    enrollmentId: 'enrollment_b_x',
    participantId: CHILD_B,
    courseId: COURSE_X,
    courseProgress: progress({ scheduledDays: 5, elapsedDays: 5, recordedDays: 5, presentDays: 5 }),
  });
  const all = [selfX, childAY, childAX, childBX];

  it('self X / child A Y / child B none — Home, My Courses, Calendar, Detail', () => {
    const family = [selfX, childAY];
    expect([...getEnrolledCourseIdsForParticipant(family, SELF)]).toEqual([COURSE_X]);
    expect([...getEnrolledCourseIdsForParticipant(family, CHILD_A)]).toEqual([COURSE_Y]);
    expect([...getEnrolledCourseIdsForParticipant(family, CHILD_B)]).toEqual([]);

    const mixed = buildMixedCabinetSessionItems({
      lessonBookings: [lesson],
      courseEnrollments: family,
    });
    expect(
      filterCabinetCourseDaysForParticipant(mixed, SELF).filter((item) => item.kind === 'course_day')
    ).toHaveLength(1);
    expect(
      filterCabinetCourseDaysForParticipant(mixed, CHILD_A)
        .filter((item) => item.kind === 'course_day')
        .map((item) => (item.kind === 'course_day' ? item.courseId : ''))
    ).toEqual([COURSE_Y]);
    expect(
      filterCabinetCourseDaysForParticipant(mixed, CHILD_B).filter(
        (item) => item.kind === 'course_day'
      )
    ).toHaveLength(0);
    expect(
      filterCabinetCourseDaysForParticipant(mixed, CHILD_B).some((item) => item.kind === 'lesson')
    ).toBe(true);

    expect(
      selectEnrollmentForCourseParticipant({
        enrollments: family,
        courseId: COURSE_X,
        selectedParticipantId: CHILD_B,
      })
    ).toBeUndefined();
  });

  it('A and B both enrolled in X keep distinct enrollment identity and progress', () => {
    const siblings = [childAX, childBX];
    const a = selectEnrollmentForCourseParticipant({
      enrollments: siblings,
      courseId: COURSE_X,
      selectedParticipantId: CHILD_A,
    });
    const b = selectEnrollmentForCourseParticipant({
      enrollments: siblings,
      courseId: COURSE_X,
      selectedParticipantId: CHILD_B,
    });
    expect(a?.enrollmentId).toBe('enrollment_a_x');
    expect(b?.enrollmentId).toBe('enrollment_b_x');
    expect(presentStudentCourseProgress(a!, COPY)?.daysLabel).toBe('2 из 5');
    expect(presentStudentCourseProgress(b!, COPY)?.daysLabel).toBe('5 из 5');
    expect(
      selectEnrollmentForCourseParticipant({
        enrollments: siblings,
        courseId: COURSE_X,
        selectedParticipantId: CHILD_B,
        enrollmentId: 'enrollment_a_x',
      })
    ).toBeUndefined();
  });

  it('switching A→B does not leak sibling course data', () => {
    expect(filterEnrollmentsForParticipant(all, CHILD_A).map((item) => item.enrollmentId)).toEqual([
      'enrollment_a_y',
      'enrollment_a_x',
    ]);
    expect(filterEnrollmentsForParticipant(all, CHILD_B).map((item) => item.enrollmentId)).toEqual([
      'enrollment_b_x',
    ]);
    expect(isEnrolledInCourse(all, COURSE_Y, CHILD_B)).toBe(false);
    expect(isEnrolledInCourse(all, COURSE_X, CHILD_B)).toBe(true);
  });

  it('maps canonical courseProgress onto cabinet items and sessions carry participantId', () => {
    const readModel: CourseEnrollmentReadModel = {
      enrollmentId: 'enrollment_map_01',
      revision: 1,
      courseId: COURSE_X,
      participant: { participantId: CHILD_A, displayName: 'A' },
      lifecycle: { status: 'confirmed' },
      courseDisplay: { courseId: COURSE_X, title: 'Camp' },
      courseSchedule: childAX.courseSchedule,
      bookingOrigin: 'account',
      authorizedActions: { canWithdraw: true, canRequestCancellation: false },
      courseProgress: progress({ scheduledDays: 5, elapsedDays: 2 })!,
      updatedAt: { seconds: 1, nanoseconds: 0 },
    };
    const item = mapCourseEnrollmentReadModelToCabinetItem(readModel);
    expect(item.courseProgress?.elapsedDays).toBe(2);
    expect(toCourseProgressPresentation(item)?.participantId).toBe(CHILD_A);
    expect(expandEnrollmentsToCourseDaySessions([item])[0]?.participantId).toBe(CHILD_A);
  });
});

describe('T32.9A.9C.C course progress presentation', () => {
  it('renders 0/5, 2/5 and 5/5 as curriculum progress, not attendance coverage', () => {
    const zero = enrollment({
      enrollmentId: 'e0',
      participantId: CHILD_A,
      courseId: COURSE_X,
      courseProgress: progress({ scheduledDays: 5, elapsedDays: 0 }),
    });
    const two = enrollment({
      enrollmentId: 'e2',
      participantId: CHILD_A,
      courseId: COURSE_X,
      courseProgress: progress({ scheduledDays: 5, elapsedDays: 2 }),
    });
    const five = enrollment({
      enrollmentId: 'e5',
      participantId: CHILD_A,
      courseId: COURSE_X,
      courseProgress: progress({ scheduledDays: 5, elapsedDays: 5 }),
    });
    expect(presentStudentCourseProgress(zero, COPY)).toMatchObject({
      progressLabel: 'Прогресс курса',
      daysLabel: '0 из 5',
      progressPercent: 0,
      presentDays: 0,
    });
    expect(presentStudentCourseProgress(two, COPY)?.daysLabel).toBe('2 из 5');
    expect(presentStudentCourseProgress(five, COPY)?.daysLabel).toBe('5 из 5');
    expect(presentStudentCourseProgress(five, COPY)?.progressPercent).toBe(100);
  });

  it('shows Нет данных when attendanceRatePercent is null', () => {
    const item = enrollment({
      enrollmentId: 'e_null',
      participantId: CHILD_A,
      courseId: COURSE_X,
      courseProgress: progress({
        scheduledDays: 5,
        elapsedDays: 2,
        recordedDays: 0,
        attendanceRatePercent: null,
      }),
    });
    const view = presentStudentCourseProgress(item, COPY);
    expect(view?.attendanceRatePercent).toBeNull();
    expect(view?.attendanceValue).toBe('Нет данных');
    expect(view?.attendedLabel).toBe('Посещено');
    expect(view?.attendanceLabel).toBe('Посещаемость');
  });

  it('confirmed + 100% progress is not completed', () => {
    const item = enrollment({
      enrollmentId: 'e_full',
      participantId: CHILD_A,
      courseId: COURSE_X,
      lifecycleStatus: 'confirmed',
      courseProgress: progress({ scheduledDays: 5, elapsedDays: 5 }),
    });
    const view = presentStudentCourseProgress(item, COPY);
    expect(view?.progressPercent).toBe(100);
    expect(view?.lifecycleStatus).toBe('confirmed');
    expect(view?.lifecycleLabel).toBeUndefined();
  });

  it('completed and no_show are distinct terminal outcomes', () => {
    const completed = enrollment({
      enrollmentId: 'e_done',
      participantId: CHILD_A,
      courseId: COURSE_X,
      lifecycleStatus: 'completed',
      courseProgress: progress({ scheduledDays: 5, elapsedDays: 5, recordedDays: 5, presentDays: 5 }),
    });
    const noShow = enrollment({
      enrollmentId: 'e_ns',
      participantId: CHILD_B,
      courseId: COURSE_X,
      lifecycleStatus: 'no_show',
      courseProgress: progress({ scheduledDays: 5, elapsedDays: 5, recordedDays: 5, presentDays: 0 }),
    });
    expect(presentStudentCourseProgress(completed, COPY)?.lifecycleLabel).toBe('Курс завершён');
    expect(presentStudentCourseProgress(noShow, COPY)?.lifecycleLabel).toBe('Неявка');
    expect(getEnrolledCourseIdsForParticipant([completed, noShow], CHILD_A).has(COURSE_X)).toBe(
      true
    );
    expect(getEnrolledCourseIdsForParticipant([completed, noShow], CHILD_B).has(COURSE_X)).toBe(
      true
    );
  });
});

describe('T32.9A.9C.C enrollment store late-response isolation', () => {
  beforeEach(() => {
    useCourseEnrollmentStore.getState().reset();
  });

  it('clears A immediately on A→B and ignores a late A payload', () => {
    const store = useCourseEnrollmentStore.getState();
    const generationA = store.beginScopedLoad(CHILD_A);
    store.applyScopedItems({
      participantId: CHILD_A,
      generation: generationA,
      incoming: new Map([['enrollment_a_x', enrollment({
        enrollmentId: 'enrollment_a_x',
        participantId: CHILD_A,
        courseId: COURSE_X,
      })]]),
      mode: 'replace',
    });
    expect(useCourseEnrollmentStore.getState().itemsList).toHaveLength(1);

    const generationB = useCourseEnrollmentStore.getState().beginScopedLoad(CHILD_B);
    expect(useCourseEnrollmentStore.getState().itemsList).toHaveLength(0);
    expect(useCourseEnrollmentStore.getState().scopedParticipantId).toBe(CHILD_B);

    const acceptedLateA = useCourseEnrollmentStore.getState().applyScopedItems({
      participantId: CHILD_A,
      generation: generationA,
      incoming: new Map([['enrollment_a_x', enrollment({
        enrollmentId: 'enrollment_a_x',
        participantId: CHILD_A,
        courseId: COURSE_X,
      })]]),
      mode: 'replace',
    });
    expect(acceptedLateA).toBe(false);
    expect(useCourseEnrollmentStore.getState().itemsList).toHaveLength(0);

    const acceptedB = useCourseEnrollmentStore.getState().applyScopedItems({
      participantId: CHILD_B,
      generation: generationB,
      incoming: new Map([['enrollment_b_x', enrollment({
        enrollmentId: 'enrollment_b_x',
        participantId: CHILD_B,
        courseId: COURSE_X,
      })]]),
      mode: 'replace',
    });
    expect(acceptedB).toBe(true);
    expect(useCourseEnrollmentStore.getState().itemsList.map((item) => item.participantId)).toEqual(
      [CHILD_B]
    );
  });

  it('mergeItems drops sibling rows while a participant scope is active', () => {
    const store = useCourseEnrollmentStore.getState();
    const generation = store.beginScopedLoad(CHILD_B);
    store.applyScopedItems({
      participantId: CHILD_B,
      generation,
      incoming: new Map(),
      mode: 'replace',
    });
    store.mergeItems(
      new Map([
        [
          'enrollment_a_x',
          enrollment({
            enrollmentId: 'enrollment_a_x',
            participantId: CHILD_A,
            courseId: COURSE_X,
          }),
        ],
        [
          'enrollment_b_x',
          enrollment({
            enrollmentId: 'enrollment_b_x',
            participantId: CHILD_B,
            courseId: COURSE_X,
          }),
        ],
      ])
    );
    expect(useCourseEnrollmentStore.getState().itemsList.map((item) => item.participantId)).toEqual(
      [CHILD_B]
    );
  });
});
