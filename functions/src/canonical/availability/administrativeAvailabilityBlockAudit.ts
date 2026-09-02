import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type InstructorId,
  type AdministrativeAvailabilityBlockId,
} from '@ski-academy/shared-domain';

function blockAuditPlan(input: {
  readonly explanation: string;
  readonly blockId: AdministrativeAvailabilityBlockId;
  readonly instructorId: InstructorId;
  readonly revision: number;
  readonly summary: string;
}): AuditOutboxStagingPlan {
  const instructorRef = canonicalReference('instructor', input.instructorId);
  const blockRef = canonicalReference('administrative_availability_block', input.blockId);
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_override',
        explanation: input.explanation,
      },
      primarySubject: {
        kind: 'instructor',
        id: input.instructorId,
        subjectKey: `instructor:${input.instructorId}`,
      },
      affectedSubjects: [instructorRef, blockRef],
      effects: [
        {
          kind: 'resource_claim_changed',
          subjectRef: instructorRef,
          summary: input.summary,
        },
        {
          kind: 'outbox_obligation_created',
          subjectRef: instructorRef,
          summary: 'Administrative availability notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: blockRef,
          revision: AggregateRevisionSchema.parse(input.revision),
        },
      ],
    },
    outboxObligations: [],
  };
}

export function buildCreateAdministrativeAvailabilityBlockAuditPlan(input: {
  readonly envelope: CommandEnvelope<'create_administrative_availability_block'>;
  readonly blockId: AdministrativeAvailabilityBlockId;
  readonly instructorId: InstructorId;
  readonly revision: number;
}): AuditOutboxStagingPlan {
  return blockAuditPlan({
    explanation: input.envelope.intent.reasonExplanation,
    blockId: input.blockId,
    instructorId: input.instructorId,
    revision: input.revision,
    summary: 'Administrative availability block acquired',
  });
}

export function buildRescheduleAdministrativeAvailabilityBlockAuditPlan(input: {
  readonly envelope: CommandEnvelope<'reschedule_administrative_availability_block'>;
  readonly blockId: AdministrativeAvailabilityBlockId;
  readonly instructorId: InstructorId;
  readonly revision: number;
}): AuditOutboxStagingPlan {
  return blockAuditPlan({
    explanation: input.envelope.intent.reasonExplanation,
    blockId: input.blockId,
    instructorId: input.instructorId,
    revision: input.revision,
    summary: 'Administrative availability block rescheduled',
  });
}

export function buildReleaseAdministrativeAvailabilityBlockAuditPlan(input: {
  readonly envelope: CommandEnvelope<'release_administrative_availability_block'>;
  readonly blockId: AdministrativeAvailabilityBlockId;
  readonly instructorId: InstructorId;
  readonly revision: number;
}): AuditOutboxStagingPlan {
  return blockAuditPlan({
    explanation: input.envelope.intent.reasonExplanation,
    blockId: input.blockId,
    instructorId: input.instructorId,
    revision: input.revision,
    summary: 'Administrative availability block released',
  });
}
