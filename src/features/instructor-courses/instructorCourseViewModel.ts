import type {
  CourseAttendanceEnrollmentProjection,
  CourseDayScheduleItem,
  InstructorCourseAssignmentReadModel,
  InstructorCourseEnrollmentRosterItem,
} from '@ski-academy/shared-domain';
import type {
  InstructorAssignedCourseRef,
  InstructorCourseDayAttendanceItem,
  InstructorCourseParticipantRosterItem,
  InstructorCourseViewModel,
} from './instructorCourseContracts';

function indexAttendanceByEnrollmentId(
  attendanceItems: readonly CourseAttendanceEnrollmentProjection[]
): ReadonlyMap<string, CourseAttendanceEnrollmentProjection> {
  const indexed = new Map<string, CourseAttendanceEnrollmentProjection>();
  for (const item of attendanceItems) {
    indexed.set(item.enrollmentId, item);
  }
  return indexed;
}

function buildMissingDayAttendance(
  courseDay: CourseDayScheduleItem
): InstructorCourseDayAttendanceItem {
  return {
    courseDayId: courseDay.courseDayId,
    dayOrder: courseDay.dayOrder,
    timeZone: courseDay.timeZone,
    courseDayRevision: courseDay.revision,
    factualState: 'missing',
    authorizedActions: { canRecordAttendance: false },
  };
}

function mergeParticipantDays(
  courseDays: readonly CourseDayScheduleItem[],
  attendanceItem: CourseAttendanceEnrollmentProjection | undefined
): InstructorCourseDayAttendanceItem[] {
  const attendanceByDayId = new Map(
    (attendanceItem?.days ?? []).map((day) => [day.courseDayId, day] as const)
  );

  return courseDays.map((courseDay) => {
    const attendanceDay = attendanceByDayId.get(courseDay.courseDayId);
    if (!attendanceDay) {
      return buildMissingDayAttendance(courseDay);
    }

    return {
      courseDayId: courseDay.courseDayId,
      dayOrder: courseDay.dayOrder,
      timeZone: courseDay.timeZone,
      courseDayRevision: attendanceDay.courseDayRevision,
      factualState: attendanceDay.factualState,
      authorizedActions: attendanceDay.authorizedActions,
      ...(attendanceDay.attendanceId !== undefined
        ? { attendanceId: attendanceDay.attendanceId }
        : {}),
      ...(attendanceDay.attendanceRevision !== undefined
        ? { attendanceRevision: attendanceDay.attendanceRevision }
        : {}),
    };
  });
}

export function mapRosterItemToParticipant(
  rosterItem: InstructorCourseEnrollmentRosterItem,
  attendanceItem: CourseAttendanceEnrollmentProjection | undefined,
  courseDays: readonly CourseDayScheduleItem[]
): InstructorCourseParticipantRosterItem {
  return {
    enrollmentId: rosterItem.enrollmentId,
    enrollmentRevision: rosterItem.revision,
    participantId: rosterItem.participant.participantId,
    displayName: rosterItem.participant.displayName,
    lifecycleStatus: rosterItem.lifecycle.status,
    authorizedActions: rosterItem.authorizedActions,
    days: mergeParticipantDays(courseDays, attendanceItem),
  };
}

export function buildInstructorCourseViewModel(input: {
  readonly rosterItems: readonly InstructorCourseEnrollmentRosterItem[];
  readonly attendanceItems: readonly CourseAttendanceEnrollmentProjection[];
}): InstructorCourseViewModel | undefined {
  if (input.rosterItems.length === 0) {
    return undefined;
  }

  const [firstRosterItem] = input.rosterItems;
  const courseDays = firstRosterItem.courseSchedule.courseDays;
  const attendanceByEnrollmentId = indexAttendanceByEnrollmentId(input.attendanceItems);

  const participants = input.rosterItems.map((rosterItem) =>
    mapRosterItemToParticipant(
      rosterItem,
      attendanceByEnrollmentId.get(rosterItem.enrollmentId),
      courseDays
    )
  );

  return {
    courseId: firstRosterItem.courseId,
    title: firstRosterItem.courseDisplay.title,
    courseScheduleRevision: firstRosterItem.courseSchedule.courseScheduleRevision,
    courseDays,
    participants,
  };
}

export function mapInstructorCourseAssignmentReadModelsToAssignedCourses(
  items: readonly InstructorCourseAssignmentReadModel[]
): InstructorAssignedCourseRef[] {
  return items
    .map((item) => ({
      courseId: item.courseId,
      title: item.title,
    }))
    .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }));
}

export function mergeInstructorCourseViewModels(
  existing: ReadonlyMap<string, InstructorCourseViewModel>,
  incoming: ReadonlyMap<string, InstructorCourseViewModel>
): Map<string, InstructorCourseViewModel> {
  const merged = new Map(existing);
  for (const [courseId, viewModel] of incoming) {
    merged.set(courseId, viewModel);
  }
  return merged;
}
