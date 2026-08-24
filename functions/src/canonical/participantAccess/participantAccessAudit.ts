import {
  AUDIT_REASON_REGISTRY_VERSION,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandKind,
} from '@ski-academy/shared-domain';

type ParticipantAccessCommandKind = Extract<
  CommandKind,
  | 'create_participant'
  | 'update_participant_profile'
  | 'assign_participant_management'
  | 'revoke_participant_management'
  | 'create_instructor_relationship'
  | 'revoke_instructor_relationship'
  | 'block_participant'
  | 'unblock_participant'
>;

function reasonCodeForKind(kind: ParticipantAccessCommandKind): 'participant_management' | 'participant_access_control' {
  return kind === 'block_participant' || kind === 'unblock_participant'
    ? 'participant_access_control'
    : 'participant_management';
}

function summaryForKind(kind: ParticipantAccessCommandKind): string {
  switch (kind) {
    case 'create_participant':
      return 'Participant profile created';
    case 'update_participant_profile':
      return 'Participant profile updated';
    case 'assign_participant_management':
      return 'Participant management assigned';
    case 'revoke_participant_management':
      return 'Participant management revoked';
    case 'create_instructor_relationship':
      return 'Instructor relationship granted';
    case 'revoke_instructor_relationship':
      return 'Instructor relationship revoked';
    case 'block_participant':
      return 'Participant block created';
    case 'unblock_participant':
      return 'Participant block removed';
  }
}

export function buildParticipantAccessAuditPlan(input: {
  envelope: CommandEnvelope<ParticipantAccessCommandKind>;
  primarySubject: AuditOutboxStagingPlan['activityLog']['primarySubject'];
  affectedSubjects: AuditOutboxStagingPlan['activityLog']['affectedSubjects'];
  resultingRevisions: AuditOutboxStagingPlan['activityLog']['resultingRevisions'];
}): AuditOutboxStagingPlan {
  const kind = input.envelope.kind;
  const effectSubject = input.affectedSubjects[0];
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: reasonCodeForKind(kind),
      },
      primarySubject: input.primarySubject,
      affectedSubjects: input.affectedSubjects,
      effects: [
        {
          kind: 'participant_access_changed',
          ...(effectSubject === undefined ? {} : { subjectRef: effectSubject }),
          summary: summaryForKind(kind),
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: input.resultingRevisions,
    },
    outboxObligations: [],
  };
}
