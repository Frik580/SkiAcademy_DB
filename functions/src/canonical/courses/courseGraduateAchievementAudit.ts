import {
  AggregateRevisionSchema,
  canonicalReference,
  type AuditOutboxStagingPlan,
  type ParticipantId,
} from '@ski-academy/shared-domain';

export function courseGraduateAchievementAuditEffects(issuance?: {
  readonly participantId: ParticipantId;
  readonly revision: number;
}): AuditOutboxStagingPlan['activityLog']['effects'] {
  if (!issuance) return [];
  return [
    {
      kind: 'participant_achievements_changed' as const,
      subjectRef: canonicalReference('participant', issuance.participantId),
      summary: 'course_graduate issued from course completion',
    },
  ];
}

export function courseGraduateAchievementResultingRevisions(issuance?: {
  readonly participantId: ParticipantId;
  readonly revision: number;
}): AuditOutboxStagingPlan['activityLog']['resultingRevisions'] {
  if (!issuance) return [];
  return [
    {
      subject: canonicalReference('participant', issuance.participantId),
      revision: AggregateRevisionSchema.parse(issuance.revision),
    },
  ];
}
