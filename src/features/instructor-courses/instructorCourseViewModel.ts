import type {
  CourseAttendanceEnrollmentProjection,
  CourseDayScheduleItem,
  InstructorCourseAssignmentReadModel,
  InstructorCourseEnrollmentRosterItem,
} from '@ski-academy/shared-domain';
import type {
  InstructorAssignedCourseRef,
  InstructorCourseDayAttendanceSummary,
  InstructorCourseDayViewModel,
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

export function isActiveInstructorCourseRosterParticipant(
  participant: Pick<InstructorCourseParticipantRosterItem, 'lifecycleStatus'>
): boolean {
  return (
    participant.lifecycleStatus === 'confirmed' ||
    participant.lifecycleStatus === 'pending_cancellation'
  );
}

export function selectActiveInstructorCourseRosterParticipants(
  viewModel: InstructorCourseViewModel
): InstructorCourseParticipantRosterItem[] {
  return viewModel.participants.filter(isActiveInstructorCourseRosterParticipant);
}

function compareCourseDays(left: CourseDayScheduleItem, right: CourseDayScheduleItem): number {
  if (left.dayOrder !== right.dayOrder) {
    return left.dayOrder - right.dayOrder;
  }
  if (left.interval.startsAt.seconds !== right.interval.startsAt.seconds) {
    return left.interval.startsAt.seconds - right.interval.startsAt.seconds;
  }
  return left.interval.startsAt.nanoseconds - right.interval.startsAt.nanoseconds;
}

function incrementAttendanceSummary(
  summary: InstructorCourseDayAttendanceSummary,
  factualState: InstructorCourseDayAttendanceItem['factualState']
): InstructorCourseDayAttendanceSummary {
  return { ...summary, [factualState]: summary[factualState] + 1 };
}

export function buildInstructorCourseDayViewModels(input: {
  readonly assignment: Pick<InstructorAssignedCourseRef, 'assignedCourseDayIds'>;
  readonly course: InstructorCourseViewModel;
}): InstructorCourseDayViewModel[] {
  const assignedIds = new Set(input.assignment.assignedCourseDayIds);
  const participants = selectActiveInstructorCourseRosterParticipants(input.course);

  return [...input.course.courseDays]
    .sort(compareCourseDays)
    .filter((courseDay) => assignedIds.has(courseDay.courseDayId))
    .map((courseDay) => {
      let attendanceSummary: InstructorCourseDayAttendanceSummary = {
        missing: 0,
        present: 0,
        absent: 0,
      };
      const dayParticipants = participants.map((participant) => {
        const attendance =
          participant.days.find((day) => day.courseDayId === courseDay.courseDayId) ??
          buildMissingDayAttendance(courseDay);
        attendanceSummary = incrementAttendanceSummary(attendanceSummary, attendance.factualState);
        return {
          enrollmentId: participant.enrollmentId,
          enrollmentRevision: participant.enrollmentRevision,
          displayName: participant.displayName,
          lifecycleStatus: participant.lifecycleStatus,
          factualState: attendance.factualState,
          ...(attendance.attendanceRevision !== undefined
            ? { attendanceRevision: attendance.attendanceRevision }
            : {}),
          canRecordAttendance: attendance.authorizedActions.canRecordAttendance,
        };
      });

      return {
        courseDayId: courseDay.courseDayId,
        dayOrder: courseDay.dayOrder,
        title: input.course.title,
        interval: courseDay.interval,
        timeZone: courseDay.timeZone,
        assignmentState: 'assigned' as const,
        rosterCount: dayParticipants.length,
        attendanceSummary,
        canRecordAttendance: dayParticipants.some((participant) => participant.canRecordAttendance),
        participants: dayParticipants,
      };
    });
}

export function buildInstructorCourseViewModel(input: {
  readonly rosterItems: readonly InstructorCourseEnrollmentRosterItem[];
  readonly attendanceItems: readonly CourseAttendanceEnrollmentProjection[];
  readonly fallback?: Pick<InstructorAssignedCourseRef, 'courseId' | 'title' | 'courseSchedule'>;
}): InstructorCourseViewModel | undefined {
  if (input.rosterItems.length === 0) {
    if (!input.fallback) {
      return undefined;
    }

    return {
      courseId: input.fallback.courseId,
      title: input.fallback.title,
      courseScheduleRevision: input.fallback.courseSchedule.courseScheduleRevision,
      courseDays: input.fallback.courseSchedule.courseDays,
      participants: [],
    };
  }

  const [firstRosterItem] = input.rosterItems;
  const courseDays = firstRosterItem.courseSchedule.courseDays;
  const attendanceByEnrollmentId = indexAttendanceByEnrollmentId(input.attendanceItems);

  const participants = input.rosterItems
    .map((rosterItem) =>
      mapRosterItemToParticipant(
        rosterItem,
        attendanceByEnrollmentId.get(rosterItem.enrollmentId),
        courseDays
      )
    )
    .filter(isActiveInstructorCourseRosterParticipant);

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
      assignedCourseDayIds: [...item.assignedCourseDayIds],
      courseSchedule: item.courseSchedule,
    }))
    .sort((left, right) =>
      left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
    );
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
