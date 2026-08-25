import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CourseDayId,
  type CourseId,
} from '@ski-academy/shared-domain';

export function buildCreateCourseDayAuditPlan(input: {
  readonly envelope: CommandEnvelope<'create_course_day'>;
  readonly courseId: CourseId;
  readonly courseDayId: CourseDayId;
  readonly courseRevision: number;
  readonly courseDayRevision: number;
}): AuditOutboxStagingPlan {
  const courseRef = canonicalReference('course', input.courseId);
  const courseDayRef = canonicalReference('course_day', input.courseDayId);

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_override',
        explanation: 'CourseDay schedule created',
      },
      primarySubject: {
        kind: 'course',
        id: input.courseId,
        subjectKey: `course:${input.courseId}`,
      },
      affectedSubjects: [courseRef, courseDayRef],
      effects: [
        {
          kind: 'resource_claim_changed',
          subjectRef: courseDayRef,
          summary: 'CourseDay instructor claim acquired',
        },
        {
          kind: 'outbox_obligation_created',
          subjectRef: courseRef,
          summary: 'CourseDay schedule notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: courseRef,
          revision: AggregateRevisionSchema.parse(input.courseRevision),
        },
        {
          subject: courseDayRef,
          revision: AggregateRevisionSchema.parse(input.courseDayRevision),
        },
      ],
    },
    outboxObligations: [],
  };
}

export function buildReassignCourseDayInstructorAuditPlan(input: {
  readonly envelope: CommandEnvelope<'reassign_course_day_instructor'>;
  readonly courseId: CourseId;
  readonly courseDayId: CourseDayId;
  readonly courseDayRevision: number;
}): AuditOutboxStagingPlan {
  const courseRef = canonicalReference('course', input.courseId);
  const courseDayRef = canonicalReference('course_day', input.courseDayId);

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_override',
        explanation: input.envelope.intent.reasonExplanation,
      },
      primarySubject: {
        kind: 'course_day',
        id: input.courseDayId,
        subjectKey: `course_day:${input.courseDayId}`,
      },
      affectedSubjects: [courseRef, courseDayRef],
      effects: [
        {
          kind: 'resource_claim_changed',
          subjectRef: courseDayRef,
          summary: 'CourseDay instructor claim swapped',
        },
        {
          kind: 'outbox_obligation_created',
          subjectRef: courseRef,
          summary: 'CourseDay instructor change notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: courseDayRef,
          revision: AggregateRevisionSchema.parse(input.courseDayRevision),
        },
      ],
    },
    outboxObligations: [],
  };
}
