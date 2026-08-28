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
import type { Firestore } from 'firebase-admin/firestore';
import { parseAttendance } from '../bookings/attendanceStore';
import { parseParticipant } from '../participantAccess/participantAccessStore';
import { buildParticipantAccessTopology } from '../participantAccess/participantAccessAuthorization';
import { parseCourse, parseCourseDays, courseDaysCollectionPath } from '../courses/courseStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import {
  loadCourseEnrollmentReadAuthorizationContext,
  loadInstructorRosterEnrollments,
} from './courseEnrollmentReadModels';

async function loadAttendancesForEnrollment(
  firestore: Firestore,
  enrollment: CourseEnrollment,
  courseDays: readonly CourseDay[]
) {
  const attendancesByCourseDayId = new Map<CourseDay['courseDayId'], ReturnType<typeof parseAttendance>>();
  for (const courseDay of courseDays) {
    const attendanceId = attendanceIdFromCourseDayIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'course_enrollment',
      enrollmentId: enrollment.enrollmentId,
      courseDayId: courseDay.courseDayId,
    });
    const attendanceSnap = await firestore.collection('attendance').doc(attendanceId).get();
    const attendance = parseAttendance(attendanceSnap.data() as Record<string, unknown> | undefined);
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
  } = {}
): Promise<QueryCourseAttendanceReadModelsResult> {
  const now = timestampFromDate(options.now ?? new Date());

  if (input.scope === 'account_enrollment') {
    const accountId = options.accountId;
    const enrollmentId = input.enrollmentId!;
    if (!accountId) {
      return { scope: input.scope, items: [] };
    }

    const enrollmentSnap = await firestore.collection('course_enrollments').doc(enrollmentId).get();
    const enrollment = parseCourseEnrollment(
      enrollmentSnap.data() as Record<string, unknown> | undefined
    );
    if (!enrollment) {
      return { scope: input.scope, items: [] };
    }

    const authContext = await loadCourseEnrollmentReadAuthorizationContext(firestore, accountId);
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
        await firestore.collection(courseDaysCollectionPath(enrollment.courseId)).get()
      ).docs.map((doc) => ({ data: doc.data() as Record<string, unknown> }))
    );
    const attendancesByCourseDayId = await loadAttendancesForEnrollment(
      firestore,
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

  const courseSnap = await firestore.collection('courses').doc(courseId).get();
  const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
  if (!course) {
    return { scope: input.scope, items: [] };
  }

  const courseDays = parseCourseDays(
    (await firestore.collection(courseDaysCollectionPath(courseId)).get()).docs.map((doc) => ({
      data: doc.data() as Record<string, unknown>,
    }))
  );
  const enrollments = await loadInstructorRosterEnrollments(firestore, courseId);
  const items: CourseAttendanceEnrollmentProjection[] = [];

  for (const enrollment of enrollments) {
    const participantSnap = await firestore
      .collection('participants')
      .doc(enrollment.participantId)
      .get();
    const participant = parseParticipant(participantSnap.data() as Record<string, unknown> | undefined);
    if (!participant) {
      continue;
    }

    const attendancesByCourseDayId = await loadAttendancesForEnrollment(
      firestore,
      enrollment,
      courseDays
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
