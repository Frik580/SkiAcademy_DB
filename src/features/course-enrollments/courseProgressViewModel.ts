import type { CourseEnrollmentLifecycleStatus } from '@ski-academy/shared-domain';
import type {
  CourseEnrollmentCabinetItem,
  CourseProgressPresentation,
  CourseProgressSelectionInput,
} from './courseEnrollmentContracts';
import { isCourseEnrollmentMembershipStatus } from './courseEnrollmentViewModel';

export interface StudentCourseProgressCopy {
  readonly progressLabel: string;
  readonly attendedLabel: string;
  readonly attendanceLabel: string;
  readonly noDataLabel: string;
  readonly completedLabel: string;
  readonly noShowLabel: string;
  readonly daysOf: (elapsed: number, scheduled: number) => string;
}

type StudentCourseProgressCopyKey =
  | 'scCourseProgress'
  | 'scCourseAttended'
  | 'scCourseAttendance'
  | 'scCourseAttendanceNoData'
  | 'scCourseCompleted'
  | 'scCourseNoShow';

export interface StudentCourseProgressSummaryInput {
  readonly enrollmentId: string;
  readonly participantId: string;
  readonly courseId: string;
  readonly progressLabel: string;
  readonly daysLabel: string;
  readonly progressPercent: number;
  readonly attendedLabel: string;
  readonly presentDays: number;
  readonly attendanceLabel: string;
  readonly attendanceValue: string;
  readonly attendanceRatePercent: number | null;
  readonly lifecycleLabel?: string;
  readonly lifecycleStatus: CourseEnrollmentLifecycleStatus;
}

export function selectCourseProgressesForParticipant(
  input: CourseProgressSelectionInput
): readonly CourseProgressPresentation[] {
  if (!input.selectedParticipantId) return [];
  return input.presentations.filter(
    (presentation) => presentation.participantId === input.selectedParticipantId
  );
}

export function toCourseProgressPresentation(enrollment: CourseEnrollmentCabinetItem):
  | (NonNullable<CourseEnrollmentCabinetItem['courseProgress']> & {
      readonly enrollmentId: string;
      readonly participantId: string;
      readonly courseId: string;
      readonly lifecycleStatus: CourseEnrollmentCabinetItem['lifecycleStatus'];
    })
  | undefined {
  if (!enrollment.courseProgress) return undefined;
  return {
    enrollmentId: enrollment.enrollmentId,
    participantId: enrollment.participantId,
    courseId: enrollment.courseId,
    ...enrollment.courseProgress,
    lifecycleStatus: enrollment.lifecycleStatus,
  };
}

export function selectEnrollmentForCourseParticipant(input: {
  readonly enrollments: readonly CourseEnrollmentCabinetItem[];
  readonly courseId: string;
  readonly selectedParticipantId: string | undefined;
  readonly enrollmentId?: string;
}): CourseEnrollmentCabinetItem | undefined {
  if (!input.selectedParticipantId) return undefined;

  if (input.enrollmentId) {
    const exact = input.enrollments.find(
      (enrollment) => enrollment.enrollmentId === input.enrollmentId
    );
    if (
      exact &&
      exact.courseId === input.courseId &&
      exact.participantId === input.selectedParticipantId &&
      isCourseEnrollmentMembershipStatus(exact.lifecycleStatus)
    ) {
      return exact;
    }
    return undefined;
  }

  return input.enrollments.find(
    (enrollment) =>
      enrollment.courseId === input.courseId &&
      enrollment.participantId === input.selectedParticipantId &&
      isCourseEnrollmentMembershipStatus(enrollment.lifecycleStatus)
  );
}

export function filterEnrollmentsForParticipant(
  enrollments: readonly CourseEnrollmentCabinetItem[],
  selectedParticipantId: string | undefined
): readonly CourseEnrollmentCabinetItem[] {
  if (!selectedParticipantId) return [];
  return enrollments.filter((enrollment) => enrollment.participantId === selectedParticipantId);
}

export function getEnrolledCourseIdsForParticipant(
  enrollments: readonly CourseEnrollmentCabinetItem[],
  selectedParticipantId: string | undefined
): ReadonlySet<string> {
  return new Set(
    filterEnrollmentsForParticipant(enrollments, selectedParticipantId)
      .filter((enrollment) => isCourseEnrollmentMembershipStatus(enrollment.lifecycleStatus))
      .map((enrollment) => enrollment.courseId)
  );
}

export function presentStudentCourseProgress(
  enrollment: CourseEnrollmentCabinetItem,
  copy: StudentCourseProgressCopy
): StudentCourseProgressSummaryInput | undefined {
  const presentation = toCourseProgressPresentation(enrollment);
  if (!presentation || presentation.participantId !== enrollment.participantId) {
    return undefined;
  }

  const lifecycleLabel =
    presentation.lifecycleStatus === 'completed'
      ? copy.completedLabel
      : presentation.lifecycleStatus === 'no_show'
        ? copy.noShowLabel
        : undefined;

  return {
    enrollmentId: presentation.enrollmentId,
    participantId: presentation.participantId,
    courseId: presentation.courseId,
    progressLabel: copy.progressLabel,
    daysLabel: copy.daysOf(presentation.elapsedDays, presentation.scheduledDays),
    progressPercent: presentation.progressPercent,
    attendedLabel: copy.attendedLabel,
    presentDays: presentation.presentDays,
    attendanceLabel: copy.attendanceLabel,
    attendanceValue:
      presentation.attendanceRatePercent === null
        ? copy.noDataLabel
        : `${Math.round(presentation.attendanceRatePercent)}%`,
    attendanceRatePercent: presentation.attendanceRatePercent,
    lifecycleLabel,
    lifecycleStatus: presentation.lifecycleStatus,
  };
}

export function studentCourseProgressCopyFromLanguage(
  language: 'ru' | 'en',
  t: (key: StudentCourseProgressCopyKey) => string
): StudentCourseProgressCopy {
  return {
    progressLabel: t('scCourseProgress'),
    attendedLabel: t('scCourseAttended'),
    attendanceLabel: t('scCourseAttendance'),
    noDataLabel: t('scCourseAttendanceNoData'),
    completedLabel: t('scCourseCompleted'),
    noShowLabel: t('scCourseNoShow'),
    daysOf: (elapsed, scheduled) =>
      language === 'ru' ? `${elapsed} из ${scheduled}` : `${elapsed} of ${scheduled}`,
  };
}
