import type {
  CourseAttendanceFactualState,
  CourseAttendanceReadModelAuthorizedActions,
  CourseDayScheduleItem,
  CourseEnrollmentLifecycleStatus,
  InstructorCourseEnrollmentRosterAuthorizedActions,
} from '@ski-academy/shared-domain';

export interface InstructorAssignedCourseRef {
  readonly courseId: string;
  readonly title: string;
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

export interface RecordCourseDayAttendanceInput {
  readonly courseId: string;
  readonly enrollmentId: string;
  readonly courseDayId: string;
  readonly attendanceStatus: 'present' | 'absent';
  readonly expectedAttendanceRevision?: number;
  readonly expectedEnrollmentRevision?: number;
  readonly idempotencyKey: string;
}
