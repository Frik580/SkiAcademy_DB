import {
  attendanceIdFromCourseDayIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  courseDayAttendanceMatchesCurrentOccurrence,
  evaluateCourseAttendanceAuthorizedActions,
  evaluateParticipantManagementAccess,
  resolveCourseAttendanceFactualState,
  timestampFromDate,
  type AccountId,
  type CourseAttendanceEnrollmentProjection,
  type CourseDay,
  type CourseEnrollment,
  type InstructorId,
  type QueryCourseAttendanceReadModelsInput,
  type QueryCourseAttendanceReadModelsResult,
} from '@ski-academy/shared-domain';
import type {
  Firestore,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { parseAttendance } from '../bookings/attendanceStore';
import { parseParticipant } from '../participantAccess/participantAccessStore';
import { buildParticipantAccessTopology } from '../participantAccess/participantAccessAuthorization';
import { parseCourse, parseCourseDays } from '../courses/courseStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import {
  loadCourseEnrollmentReadAuthorizationContext,
  loadInstructorRosterEnrollments,
  assertInstructorCourseRosterReadAccess,
} from './courseEnrollmentReadModels';
import {
  createReadModelRequestContext,
  type ReadModelRequestContext,
} from './readModelRequestContext';

const FIRESTORE_IN_QUERY_MAX_VALUES = 30;

async function loadAttendancesForEnrollment(
  readContext: ReadModelRequestContext,
  enrollment: CourseEnrollment,
  courseDays: readonly CourseDay[],
  attendanceDocumentsById?: ReadonlyMap<string, QueryDocumentSnapshot>
) {
  const attendancesByCourseDayId = new Map<CourseDay['courseDayId'], ReturnType<typeof parseAttendance>>();
  const documentsById =
    attendanceDocumentsById ??
    new Map(
      (await readContext.enrollmentAttendances(enrollment.enrollmentId)).docs.map(
        (document) => [document.id, document]
      )
    );
  for (const courseDay of courseDays) {
    const attendanceId = attendanceIdFromCourseDayIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'course_enrollment',
      enrollmentId: enrollment.enrollmentId,
      courseDayId: courseDay.courseDayId,
    });
    const attendanceSnap = documentsById.get(attendanceId);
    const attendance = parseAttendance(
      attendanceSnap?.data() as Record<string, unknown> | undefined
    );
    if (attendance) {
      attendancesByCourseDayId.set(courseDay.courseDayId, attendance);
    }
  }
  return attendancesByCourseDayId;
}

export async function queryCourseAttendanceReadModels(
  firestore: Firestore,
  input: QueryCourseAttendanceReadModelsInput,
  options: {
    readonly accountId?: AccountId;
    readonly instructorId?: InstructorId;
    readonly now?: Date;
    readonly readContext?: ReadModelRequestContext;
  } = {}
): Promise<QueryCourseAttendanceReadModelsResult> {
  const readContext = options.readContext ?? createReadModelRequestContext(firestore);
  const now = timestampFromDate(options.now ?? new Date());

  if (input.scope === 'account_enrollment') {
    const accountId = options.accountId;
    const enrollmentId = input.enrollmentId!;
    if (!accountId) {
      return { scope: input.scope, items: [] };
    }

    const enrollmentSnap = await readContext.enrollment(enrollmentId);
    const enrollment = parseCourseEnrollment(
      enrollmentSnap.data() as Record<string, unknown> | undefined
    );
    if (!enrollment) {
      return { scope: input.scope, items: [] };
    }

    const authContext = await loadCourseEnrollmentReadAuthorizationContext(
      firestore,
      accountId,
      readContext
    );
    const management = authContext.participantManagement.find(
      (record) => record.participantId === enrollment.participantId
    );
    const participant = authContext.participants.find(
      (record) => record.participantId === enrollment.participantId
    );
    if (!authContext.account || !management || !participant) {
      return { scope: input.scope, items: [] };
    }
    const topology = buildParticipantAccessTopology({
      account: authContext.account,
      participant,
      management,
    });
    const access = evaluateParticipantManagementAccess(topology, {
      accountId,
      participantId: enrollment.participantId,
    });
    if (!access.allowed) {
      return { scope: input.scope, items: [] };
    }

    const courseDays = parseCourseDays(
      (
        await readContext.courseDays(enrollment.courseId)
      ).docs.map((doc) => ({ data: doc.data() as Record<string, unknown> }))
    );
    const attendancesByCourseDayId = await loadAttendancesForEnrollment(
      readContext,
      enrollment,
      courseDays
    );

    const item: CourseAttendanceEnrollmentProjection = {
      enrollmentId: enrollment.enrollmentId,
      enrollmentRevision: enrollment.revision,
      courseId: enrollment.courseId,
      participantId: enrollment.participantId,
      participantDisplayName: participant.displayName,
      days: courseDays.map((courseDay) => {
        const attendance = attendancesByCourseDayId.get(courseDay.courseDayId);
        const matches = attendance
          ? courseDayAttendanceMatchesCurrentOccurrence(attendance, courseDay)
          : false;
        const factualState = resolveCourseAttendanceFactualState({
          attendanceStatus: attendance?.attendanceStatus,
          matchesCurrentOccurrence: matches,
        });
        return {
          courseDayId: courseDay.courseDayId,
          factualState,
          courseDayRevision: courseDay.revision,
          authorizedActions: { canRecordAttendance: false },
          ...(factualState !== 'missing' && attendance
            ? {
                attendanceId: attendance.attendanceId,
                attendanceRevision: attendance.revision,
                attendanceStatus: attendance.attendanceStatus,
              }
            : {}),
        };
      }),
      ...(enrollment.attendanceSummary ? { attendanceSummary: enrollment.attendanceSummary } : {}),
    };
    return { scope: input.scope, items: [item] };
  }

  const instructorId = options.instructorId;
  const courseId = input.courseId!;
  if (!instructorId) {
    return { scope: input.scope, items: [] };
  }

  const courseSnap = await readContext.course(courseId);
  const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
  if (!course) {
    return { scope: input.scope, items: [] };
  }

  const courseDays = parseCourseDays(
    (await readContext.courseDays(courseId)).docs.map((doc) => ({
      data: doc.data() as Record<string, unknown>,
    }))
  );
  assertInstructorCourseRosterReadAccess({ instructorId, course, courseDays });
  const enrollments = await loadInstructorRosterEnrollments(firestore, courseId);
  const attendanceSnapshots = await Promise.all(
    Array.from(
      { length: Math.ceil(enrollments.length / FIRESTORE_IN_QUERY_MAX_VALUES) },
      (_, index) =>
        readContext.attendancesForEnrollments(
          enrollments
            .slice(
              index * FIRESTORE_IN_QUERY_MAX_VALUES,
              (index + 1) * FIRESTORE_IN_QUERY_MAX_VALUES
            )
            .map((enrollment) => enrollment.enrollmentId)
        )
    )
  );
  const attendanceDocumentsById = new Map(
    attendanceSnapshots.flatMap((snapshot) =>
      snapshot.docs.map((document) => [document.id, document] as const)
    )
  );
  const items: CourseAttendanceEnrollmentProjection[] = [];

  for (const enrollment of enrollments) {
    const participantSnap = await readContext.participant(enrollment.participantId);
    const participant = parseParticipant(participantSnap.data() as Record<string, unknown> | undefined);
    if (!participant) {
      continue;
    }

    const attendancesByCourseDayId = await loadAttendancesForEnrollment(
      readContext,
      enrollment,
      courseDays,
      attendanceDocumentsById
    );

    items.push({
      enrollmentId: enrollment.enrollmentId,
      enrollmentRevision: enrollment.revision,
      courseId: enrollment.courseId,
      participantId: enrollment.participantId,
      participantDisplayName: participant.displayName,
      days: courseDays.map((courseDay) => {
        const attendance = attendancesByCourseDayId.get(courseDay.courseDayId);
        const matches = attendance
          ? courseDayAttendanceMatchesCurrentOccurrence(attendance, courseDay)
          : false;
        const factualState = resolveCourseAttendanceFactualState({
          attendanceStatus: attendance?.attendanceStatus,
          matchesCurrentOccurrence: matches,
        });
        const authorizedActions = evaluateCourseAttendanceAuthorizedActions({
          actor: {
            kind: 'instructor',
            accountId: options.accountId!,
            instructorId,
          },
          enrollment,
          courseDay,
          existingAttendance: attendance,
          now,
        });
        return {
          courseDayId: courseDay.courseDayId,
          factualState,
          courseDayRevision: courseDay.revision,
          authorizedActions,
          ...(factualState !== 'missing' && attendance
            ? {
                attendanceId: attendance.attendanceId,
                attendanceRevision: attendance.revision,
                attendanceStatus: attendance.attendanceStatus,
              }
            : {}),
        };
      }),
    });
  }

  return { scope: input.scope, items };
}
