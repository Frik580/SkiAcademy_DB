import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AdminIssueId,
  type AttendanceId,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CourseEnrollmentId,
} from '@ski-academy/shared-domain';
import type { CourseEnrollmentAttendanceActorMode } from './courseEnrollmentAttendanceAuthorization';

export function buildRecordCourseDayAttendanceAuditPlan(input: {
  readonly envelope: CommandEnvelope<'record_course_day_attendance'>;
  readonly enrollmentId: CourseEnrollmentId;
  readonly attendanceId: AttendanceId;
  readonly attendanceRevision: number;
  readonly enrollmentRevision?: number;
  readonly issues?: readonly {
    readonly issueId: AdminIssueId;
    readonly revision: number;
    readonly effect: 'opened' | 'reused';
    readonly kind: 'missing_attendance';
  }[];
  readonly lifecycleSummary?: string;
  readonly actorMode: CourseEnrollmentAttendanceActorMode;
}): AuditOutboxStagingPlan {
  const enrollmentRef = canonicalReference('course_enrollment', input.enrollmentId);
  const attendanceRef = canonicalReference('attendance', input.attendanceId);
  const reasonCode =
    input.actorMode === 'administrator'
      ? ('attendance_correction' as const)
      : ('instructor_attendance' as const);
  const explanation =
    reasonCode === 'attendance_correction'
      ? input.envelope.intent.reasonExplanation
      : undefined;

  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    {
      kind: 'attendance_recorded',
      subjectRef: attendanceRef,
      summary: `Attendance marked ${input.envelope.intent.attendanceStatus}`,
    },
    ...(input.lifecycleSummary
      ? [
          {
            kind: 'course_enrollment_lifecycle_changed' as const,
            subjectRef: enrollmentRef,
            summary: input.lifecycleSummary,
          },
        ]
      : []),
    ...(input.issues ?? []).map((issue) => ({
      kind: 'admin_issue_opened' as const,
      subjectRef: canonicalReference('admin_issue', issue.issueId),
      summary:
        issue.effect === 'opened'
          ? `${issue.kind} issue opened`
          : `${issue.kind} issue reused`,
    })),
  ];

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode,
        ...(explanation === undefined ? {} : { explanation }),
      },
      primarySubject: {
        kind: 'course_enrollment' as const,
        id: input.enrollmentId,
        subjectKey: `course_enrollment:${input.enrollmentId}`,
      },
      affectedSubjects: [enrollmentRef, attendanceRef],
      effects,
      monetaryEventIds: [],
      adminIssueIds: (input.issues ?? []).map((issue) => issue.issueId),
      resultingRevisions: [
        {
          subject: attendanceRef,
          revision: AggregateRevisionSchema.parse(input.attendanceRevision),
        },
        ...(input.enrollmentRevision === undefined
          ? []
          : [
              {
                subject: enrollmentRef,
                revision: AggregateRevisionSchema.parse(input.enrollmentRevision),
              },
            ]),
        ...(input.issues ?? []).map((issue) => ({
          subject: canonicalReference('admin_issue', issue.issueId),
          revision: AggregateRevisionSchema.parse(issue.revision),
        })),
      ],
    },
    outboxObligations: [],
  };
}

export function buildResolveCourseEnrollmentAttendanceOutcomeAuditPlan(input: {
  readonly envelope: CommandEnvelope<'resolve_attendance_outcome'>;
  readonly enrollmentId: CourseEnrollmentId;
  readonly enrollmentRevision?: number;
  readonly issues: readonly {
    readonly issueId: AdminIssueId;
    readonly revision: number;
    readonly effect: 'opened' | 'reused';
    readonly kind: 'missing_attendance';
  }[];
  readonly lifecycleSummary?: string;
}): AuditOutboxStagingPlan {
  const enrollmentRef = canonicalReference('course_enrollment', input.enrollmentId);

  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    ...(input.lifecycleSummary
      ? [
          {
            kind: 'course_enrollment_lifecycle_changed' as const,
            subjectRef: enrollmentRef,
            summary: input.lifecycleSummary,
          },
        ]
      : []),
    ...input.issues.map((issue) => ({
      kind: 'admin_issue_opened' as const,
      subjectRef: canonicalReference('admin_issue', issue.issueId),
      summary:
        issue.effect === 'opened'
          ? `${issue.kind} issue opened`
          : `${issue.kind} issue reused`,
    })),
  ];

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'scheduled_system_action' as const,
      },
      primarySubject: {
        kind: 'course_enrollment' as const,
        id: input.enrollmentId,
        subjectKey: `course_enrollment:${input.enrollmentId}`,
      },
      affectedSubjects: [enrollmentRef],
      effects,
      monetaryEventIds: [],
      adminIssueIds: input.issues.map((issue) => issue.issueId),
      resultingRevisions: [
        ...(input.enrollmentRevision === undefined
          ? []
          : [
              {
                subject: enrollmentRef,
                revision: AggregateRevisionSchema.parse(input.enrollmentRevision),
              },
            ]),
        ...input.issues.map((issue) => ({
          subject: canonicalReference('admin_issue', issue.issueId),
          revision: AggregateRevisionSchema.parse(issue.revision),
        })),
      ],
    },
    outboxObligations: [],
  };
}
