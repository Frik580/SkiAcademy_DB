import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AdminIssueId,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CourseEnrollmentId,
} from '@ski-academy/shared-domain';

export function buildReconcileCourseEnrollmentAuditPlan(input: {
  readonly envelope: CommandEnvelope<'reconcile_course_enrollment'>;
  readonly enrollmentId: CourseEnrollmentId;
  readonly enrollmentRevision?: number;
  readonly issues: readonly {
    readonly issueId: AdminIssueId;
    readonly revision: number;
    readonly effect: 'resolved' | 'opened' | 'reused';
    readonly kind: string;
  }[];
  readonly lifecycleSummary?: string;
  readonly reconciliationSummary?: string;
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
    ...(input.reconciliationSummary && !input.lifecycleSummary && input.issues.length === 0
      ? [
          {
            kind: 'audit_correction_recorded' as const,
            subjectRef: enrollmentRef,
            summary: input.reconciliationSummary,
          },
        ]
      : []),
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
