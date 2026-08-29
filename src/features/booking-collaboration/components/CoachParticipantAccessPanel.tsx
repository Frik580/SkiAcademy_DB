import React, { useEffect, useState } from 'react';
import { ParticipantAccessControls } from './ParticipantAccessControls';
import {
  selectParticipantAccessByPair,
  useBookingCollaborationStore,
} from '../bookingCollaborationStore';
import { participantInstructorAccessKey } from '../deriveCollaborationIdempotencyKeys';
import { useBookingCollaborationCommands } from '../useBookingCollaborationCommands';
import { useManagedParticipants } from '../../lesson-bookings/useManagedParticipants';

export interface CoachParticipantAccessPanelProps {
  readonly accountId: string;
  readonly instructorId: string;
  readonly participantId?: string;
}

export const CoachParticipantAccessPanel: React.FC<CoachParticipantAccessPanelProps> = ({
  accountId,
  instructorId,
  participantId,
}) => {
  const { participants } = useManagedParticipants(Boolean(accountId));
  const resolvedParticipantId = participantId ?? participants[0]?.participantId;
  const accessKey =
    resolvedParticipantId !== undefined
      ? participantInstructorAccessKey(resolvedParticipantId, instructorId)
      : '';
  const access = useBookingCollaborationStore((state) =>
    accessKey ? selectParticipantAccessByPair(state, accessKey) : undefined
  );
  const commands = useBookingCollaborationCommands({ accountId });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!resolvedParticipantId) return;
    void commands.refetchParticipantAccessRead(
      'account_manager',
      resolvedParticipantId,
      instructorId
    );
  }, [commands, instructorId, resolvedParticipantId]);

  if (!resolvedParticipantId) return null;

  return (
    <ParticipantAccessControls
      access={access}
      scope="account_manager"
      loading={loading}
      onCreateRelationship={
        access?.authorizedActions.canCreateRelationship
          ? async () => {
              setLoading(true);
              try {
                await commands.createRelationship({
                  participantId: resolvedParticipantId,
                  targetInstructorId: instructorId,
                  exercisedCapability:
                    participants.find((item) => item.participantId === resolvedParticipantId)
                      ?.authority === 'parent_guardian'
                      ? 'parent_guardian'
                      : 'account_owner',
                });
              } finally {
                setLoading(false);
              }
            }
          : undefined
      }
      onRevokeRelationship={
        access?.authorizedActions.canRevokeRelationship &&
        access.instructorRelationshipId &&
        access.relationshipRevision !== undefined
          ? async () => {
              setLoading(true);
              try {
                await commands.revokeRelationship({
                  instructorRelationshipId: access.instructorRelationshipId!,
                  relationshipRevision: access.relationshipRevision!,
                  participantId: resolvedParticipantId,
                  targetInstructorId: instructorId,
                  exercisedCapability:
                    participants.find((item) => item.participantId === resolvedParticipantId)
                      ?.authority === 'parent_guardian'
                      ? 'parent_guardian'
                      : 'account_owner',
                });
              } finally {
                setLoading(false);
              }
            }
          : undefined
      }
      onBlock={
        access?.authorizedActions.canBlock
          ? async (reason) => {
              setLoading(true);
              try {
                await commands.blockParticipant({
                  participantId: resolvedParticipantId,
                  targetInstructorId: instructorId,
                  reason,
                  scope: 'account_manager',
                  exercisedCapability:
                    participants.find((item) => item.participantId === resolvedParticipantId)
                      ?.authority === 'parent_guardian'
                      ? 'parent_guardian'
                      : 'account_owner',
                });
              } finally {
                setLoading(false);
              }
            }
          : undefined
      }
      onUnblock={
        access?.authorizedActions.canUnblock &&
        access.managerBlockId &&
        access.managerBlockRevision !== undefined
          ? async () => {
              setLoading(true);
              try {
                await commands.unblockParticipant({
                  participantBlockId: access.managerBlockId!,
                  blockRevision: access.managerBlockRevision!,
                  participantId: resolvedParticipantId,
                  targetInstructorId: instructorId,
                  scope: 'account_manager',
                  exercisedCapability:
                    participants.find((item) => item.participantId === resolvedParticipantId)
                      ?.authority === 'parent_guardian'
                      ? 'parent_guardian'
                      : 'account_owner',
                });
              } finally {
                setLoading(false);
              }
            }
          : undefined
      }
    />
  );
};
