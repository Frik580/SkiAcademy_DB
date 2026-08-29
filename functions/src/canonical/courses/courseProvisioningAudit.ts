import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CourseId,
} from '@ski-academy/shared-domain';

export function buildProvisionCanonicalCourseAuditPlan(input: {
  readonly envelope: CommandEnvelope<'provision_canonical_course'>;
  readonly courseId: CourseId;
  readonly courseRevision: number;
}): AuditOutboxStagingPlan {
  const courseRef = canonicalReference('course', input.courseId);
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_override',
        explanation: 'Canonical Course aggregate provisioned from reviewed manifest',
      },
      primarySubject: {
        kind: 'course',
        id: input.courseId,
        subjectKey: `course:${input.courseId}`,
      },
      affectedSubjects: [courseRef],
      effects: [
        {
          kind: 'outbox_obligation_created',
          subjectRef: courseRef,
          summary: 'Canonical Course provisioning notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: courseRef,
          revision: AggregateRevisionSchema.parse(input.courseRevision),
        },
      ],
    },
    outboxObligations: [],
  };
}

export function buildApplyCanonicalCourseProvisioningManifestAuditPlan(input: {
  readonly envelope: CommandEnvelope<'apply_canonical_course_provisioning_manifest'>;
  readonly courseId: CourseId;
  readonly courseRevision: number;
  readonly courseDayIds: readonly string[];
}): AuditOutboxStagingPlan {
  const courseRef = canonicalReference('course', input.courseId);
  const dayRefs = input.courseDayIds.map((courseDayId) =>
    canonicalReference('course_day', courseDayId)
  );
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_override',
        explanation: input.envelope.intent.dryRun
          ? 'Canonical Course provisioning manifest dry-run completed'
          : 'Canonical Course provisioning manifest applied',
      },
      primarySubject: {
        kind: 'course',
        id: input.courseId,
        subjectKey: `course:${input.courseId}`,
      },
      affectedSubjects: [courseRef, ...dayRefs],
      effects: [
        {
          kind: 'resource_claim_changed',
          subjectRef: courseRef,
          summary: 'CourseDay instructor claims provisioned',
        },
        {
          kind: 'outbox_obligation_created',
          subjectRef: courseRef,
          summary: 'Canonical Course provisioning manifest notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: courseRef,
          revision: AggregateRevisionSchema.parse(input.courseRevision),
        },
      ],
    },
    outboxObligations: [],
  };
}
