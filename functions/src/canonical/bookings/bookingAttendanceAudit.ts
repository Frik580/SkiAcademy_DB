import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AdminIssueId,
  type AttendanceId,
  type AuditOutboxStagingPlan,
  type BookingId,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import type { BookingAttendanceActorMode } from './bookingAttendanceAuthorization';

export function buildRecordBookingAttendanceAuditPlan(input: {
  readonly envelope: CommandEnvelope<'record_booking_attendance'>;
  readonly bookingId: BookingId;
  readonly attendanceId: AttendanceId;
  readonly attendanceRevision: number;
  readonly bookingRevision?: number;
  readonly issues?: readonly {
    readonly issueId: AdminIssueId;
    readonly revision: number;
    readonly effect: 'opened' | 'reused' | 'resolved';
    readonly kind: 'attendance_payment_conflict' | 'missing_attendance';
  }[];
  readonly lifecycleSummary?: string;
  readonly actorMode: BookingAttendanceActorMode;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  const attendanceRef = canonicalReference('attendance', input.attendanceId);
  const reasonCode =
    input.actorMode === 'instructor'
      ? ('instructor_attendance' as const)
      : ('attendance_correction' as const);
  const explanation =
    reasonCode === 'attendance_correction' ? input.envelope.intent.reasonExplanation : undefined;

  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    {
      kind: 'attendance_recorded',
      subjectRef: attendanceRef,
      summary: `Attendance marked ${input.envelope.intent.attendanceStatus}`,
    },
    ...(input.lifecycleSummary
      ? [
          {
            kind: 'booking_lifecycle_changed' as const,
            subjectRef: bookingRef,
            summary: input.lifecycleSummary,
          },
        ]
      : []),
    ...(input.issues ?? []).map((issue) => ({
      kind:
        issue.effect === 'resolved'
          ? ('admin_issue_resolved' as const)
          : ('admin_issue_opened' as const),
      subjectRef: canonicalReference('admin_issue', issue.issueId),
      summary:
        issue.effect === 'resolved'
          ? `${issue.kind} issue resolved`
          : issue.effect === 'opened'
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
        kind: 'booking' as const,
        id: input.bookingId,
        subjectKey: `booking:${input.bookingId}`,
      },
      affectedSubjects: [bookingRef, attendanceRef],
      effects,
      monetaryEventIds: [],
      adminIssueIds: (input.issues ?? []).map((issue) => issue.issueId),
      resultingRevisions: [
        {
          subject: attendanceRef,
          revision: AggregateRevisionSchema.parse(input.attendanceRevision),
        },
        ...(input.bookingRevision === undefined
          ? []
          : [
              {
                subject: bookingRef,
                revision: AggregateRevisionSchema.parse(input.bookingRevision),
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

export function buildResolveAttendanceOutcomeAuditPlan(input: {
  readonly envelope: CommandEnvelope<'resolve_attendance_outcome'>;
  readonly bookingId: BookingId;
  readonly bookingRevision?: number;
  readonly issues: readonly {
    readonly issueId: AdminIssueId;
    readonly revision: number;
    readonly effect: 'opened' | 'reused';
    readonly kind: 'missing_attendance';
  }[];
  readonly lifecycleSummary?: string;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    ...(input.lifecycleSummary
      ? [
          {
            kind: 'booking_lifecycle_changed' as const,
            subjectRef: bookingRef,
            summary: input.lifecycleSummary,
          },
        ]
      : []),
    ...input.issues.map((issue) => ({
      kind: 'admin_issue_opened' as const,
      subjectRef: canonicalReference('admin_issue', issue.issueId),
      summary:
        issue.effect === 'opened' ? `${issue.kind} issue opened` : `${issue.kind} issue reused`,
    })),
  ];

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'scheduled_system_action' as const,
      },
      primarySubject: {
        kind: 'booking' as const,
        id: input.bookingId,
        subjectKey: `booking:${input.bookingId}`,
      },
      affectedSubjects: [bookingRef],
      effects,
      monetaryEventIds: [],
      adminIssueIds: input.issues.map((issue) => issue.issueId),
      resultingRevisions: [
        ...(input.bookingRevision === undefined
          ? []
          : [
              {
                subject: bookingRef,
                revision: AggregateRevisionSchema.parse(input.bookingRevision),
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
