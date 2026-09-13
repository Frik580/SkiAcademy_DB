import React, { useEffect, useState } from 'react';
import { ParticipantAccessControls } from './ParticipantAccessControls';
import {
  selectParticipantAccessByPair,
  selectParticipantAccessQuery,
  useBookingCollaborationStore,
} from '../bookingCollaborationStore';
import {
  participantInstructorAccessKey,
  participantInstructorAccessQueryKey,
} from '../deriveCollaborationIdempotencyKeys';
import { useBookingCollaborationCommands } from '../useBookingCollaborationCommands';
import { ensureParticipantAccessRead } from '../useBookingCollaborationReadSync';
import { useManagedParticipants } from '../../lesson-bookings/useManagedParticipants';

export interface CoachParticipantAccessPanelProps {
  readonly accountId: string;
  readonly instructorId: string;
  readonly participantId?: string;
}

const ACCESS_SCOPE = 'account_manager' as const;

export const CoachParticipantAccessPanel: React.FC<CoachParticipantAccessPanelProps> = ({
  accountId,
  instructorId,
  participantId,
}) => {
  const { participants } = useManagedParticipants(accountId);
  const resolvedParticipantId = participantId ?? participants[0]?.participantId;
  const accessKey =
    resolvedParticipantId !== undefined
      ? participantInstructorAccessKey(resolvedParticipantId, instructorId)
      : '';
  const queryKey =
    resolvedParticipantId !== undefined
      ? participantInstructorAccessQueryKey(ACCESS_SCOPE, resolvedParticipantId, instructorId)
      : '';
  const access = useBookingCollaborationStore((state) =>
    accessKey ? selectParticipantAccessByPair(state, accessKey) : undefined
  );
  const queryStatus = useBookingCollaborationStore((state) =>
    queryKey ? selectParticipantAccessQuery(state, queryKey) : undefined
  );
  const commands = useBookingCollaborationCommands({ accountId });
  const [mutationLoading, setMutationLoading] = useState(false);

  // Stable primitive identity only. Do not depend on `commands` (new object each render)
  // or on relationship / authorizedActions object identity — that caused a refetch loop.
  const shouldEnsure =
    Boolean(resolvedParticipantId) &&
    (queryStatus === undefined || queryStatus.status === 'stale');

  useEffect(() => {
    if (!resolvedParticipantId || !shouldEnsure) return;
    void ensureParticipantAccessRead(ACCESS_SCOPE, resolvedParticipantId, instructorId);
  }, [instructorId, resolvedParticipantId, shouldEnsure]);

  if (!resolvedParticipantId) return null;

  const loading = mutationLoading || queryStatus?.status === 'loading';

  return (
    <ParticipantAccessControls
      access={access}
      scope={ACCESS_SCOPE}
      loading={loading}
      onCreateRelationship={
        access?.authorizedActions.canCreateRelationship
          ? async () => {
              setMutationLoading(true);
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
                setMutationLoading(false);
              }
            }
          : undefined
      }
      onRevokeRelationship={
        access?.authorizedActions.canRevokeRelationship &&
        access.instructorRelationshipId &&
        access.relationshipRevision !== undefined
          ? async () => {
              setMutationLoading(true);
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
                setMutationLoading(false);
              }
            }
          : undefined
      }
      onBlock={
        access?.authorizedActions.canBlock
          ? async (reason) => {
              setMutationLoading(true);
              try {
                await commands.blockParticipant({
                  participantId: resolvedParticipantId,
                  targetInstructorId: instructorId,
                  reason,
                  scope: ACCESS_SCOPE,
                  exercisedCapability:
                    participants.find((item) => item.participantId === resolvedParticipantId)
                      ?.authority === 'parent_guardian'
                      ? 'parent_guardian'
                      : 'account_owner',
                });
              } finally {
                setMutationLoading(false);
              }
            }
          : undefined
      }
      onUnblock={
        access?.authorizedActions.canUnblock &&
        access.managerBlockId &&
        access.managerBlockRevision !== undefined
          ? async () => {
              setMutationLoading(true);
              try {
                await commands.unblockParticipant({
                  participantBlockId: access.managerBlockId!,
                  blockRevision: access.managerBlockRevision!,
                  participantId: resolvedParticipantId,
                  targetInstructorId: instructorId,
                  scope: ACCESS_SCOPE,
                  exercisedCapability:
                    participants.find((item) => item.participantId === resolvedParticipantId)
                      ?.authority === 'parent_guardian'
                      ? 'parent_guardian'
                      : 'account_owner',
                });
              } finally {
                setMutationLoading(false);
              }
            }
          : undefined
      }
    />
  );
};
