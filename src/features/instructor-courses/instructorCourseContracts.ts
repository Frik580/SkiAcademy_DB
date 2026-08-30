import type {
  CourseAttendanceFactualState,
  CourseAttendanceReadModelAuthorizedActions,
  CourseDayScheduleItem,
  CourseEnrollmentLifecycleStatus,
  CourseScheduleProjectionReadModel,
  InstructorCourseEnrollmentRosterAuthorizedActions,
} from '@ski-academy/shared-domain';

export type InstructorCourseReadErrorCode = 'permission-denied' | 'read-failed';

export interface InstructorAssignedCourseRef {
  readonly courseId: string;
  readonly title: string;
  readonly assignedCourseDayIds: readonly string[];
  readonly courseSchedule: CourseScheduleProjectionReadModel;
}

export interface InstructorCourseDayAttendanceItem {
  readonly courseDayId: string;
  readonly dayOrder: number;
  readonly timeZone: string;
  readonly courseDayRevision: number;
  readonly factualState: CourseAttendanceFactualState;
  readonly attendanceId?: string;
  readonly attendanceRevision?: number;
  readonly authorizedActions: CourseAttendanceReadModelAuthorizedActions;
}

export interface InstructorCourseParticipantRosterItem {
  readonly enrollmentId: string;
  readonly enrollmentRevision: number;
  readonly participantId: string;
  readonly displayName: string;
  readonly lifecycleStatus: CourseEnrollmentLifecycleStatus;
  readonly authorizedActions: InstructorCourseEnrollmentRosterAuthorizedActions;
  readonly days: readonly InstructorCourseDayAttendanceItem[];
}

export interface InstructorCourseViewModel {
  readonly courseId: string;
  readonly title: string;
  readonly courseScheduleRevision: number;
  readonly courseDays: readonly CourseDayScheduleItem[];
  readonly participants: readonly InstructorCourseParticipantRosterItem[];
}

export interface InstructorCourseDayParticipantViewModel {
  readonly enrollmentId: string;
  readonly enrollmentRevision: number;
  readonly displayName: string;
  readonly lifecycleStatus: CourseEnrollmentLifecycleStatus;
  readonly factualState: CourseAttendanceFactualState;
  readonly attendanceRevision?: number;
  readonly canRecordAttendance: boolean;
}

export interface InstructorCourseDayAttendanceSummary {
  readonly missing: number;
  readonly present: number;
  readonly absent: number;
}

export interface InstructorCourseDayViewModel {
  readonly courseDayId: string;
  readonly dayOrder: number;
  readonly title: string;
  readonly interval: CourseDayScheduleItem['interval'];
  readonly timeZone: string;
  readonly assignmentState: 'assigned';
  readonly rosterCount: number;
  readonly attendanceSummary: InstructorCourseDayAttendanceSummary;
  readonly canRecordAttendance: boolean;
  readonly participants: readonly InstructorCourseDayParticipantViewModel[];
}

export interface RecordCourseDayAttendanceInput {
  readonly courseId: string;
  readonly enrollmentId: string;
  readonly courseDayId: string;
  readonly attendanceStatus: 'present' | 'absent';
  readonly expectedAttendanceRevision?: number;
  readonly expectedEnrollmentRevision?: number;
  readonly idempotencyKey: string;
}
