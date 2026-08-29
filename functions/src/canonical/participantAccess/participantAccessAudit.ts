import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AuditOutboxStagingPlan,
  type BookingProposalId,
  type CommandEnvelope,
  type CommandKind,
} from '@ski-academy/shared-domain';

type ParticipantAccessCommandKind = Extract<
  CommandKind,
  | 'provision_self_participant'
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
    case 'provision_self_participant':
      return 'Canonical self Participant provisioned';
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
  cancelledOpenProposalIds?: readonly BookingProposalId[];
  cancelledOpenProposalRevisions?: Readonly<Record<BookingProposalId, number>>;
  cancelledProposalNotificationAccountId?: import('@ski-academy/shared-domain').AccountId;
}): AuditOutboxStagingPlan {
  const kind = input.envelope.kind;
  const effectSubject = input.affectedSubjects[0];
  const cancelledProposals = input.cancelledOpenProposalIds ?? [];
  const proposalEffects = cancelledProposals.map((proposalId) => ({
    kind: 'outbox_obligation_created' as const,
    subjectRef: canonicalReference('booking_proposal', proposalId),
    summary: 'Open booking proposal cancelled due to participant block',
  }));
  const proposalRevisions = cancelledProposals.map((proposalId) => ({
    subject: canonicalReference('booking_proposal', proposalId),
    revision: AggregateRevisionSchema.parse(
      input.cancelledOpenProposalRevisions?.[proposalId] ?? 1
    ),
  }));
  const outboxObligations =
    input.cancelledProposalNotificationAccountId === undefined
      ? []
      : cancelledProposals.map((proposalId, index) => ({
          deliveryEffectOrdinal: index,
          recipient: {
            kind: 'account' as const,
            id: input.cancelledProposalNotificationAccountId!,
          },
          channel: 'in_app' as const,
          templateId: 'booking_proposal_cancelled',
          templateVersion: 'v1',
          renderInputs: { bookingProposalId: proposalId },
          deliverySemantics: 'transactional' as const,
        }));

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: reasonCodeForKind(kind),
      },
      primarySubject: input.primarySubject,
      affectedSubjects: [
        ...input.affectedSubjects,
        ...cancelledProposals.map((proposalId) =>
          canonicalReference('booking_proposal', proposalId)
        ),
      ],
      effects: [
        {
          kind: 'participant_access_changed',
          ...(effectSubject === undefined ? {} : { subjectRef: effectSubject }),
          summary: summaryForKind(kind),
        },
        ...proposalEffects,
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [...input.resultingRevisions, ...proposalRevisions],
    },
    outboxObligations,
  };
}
