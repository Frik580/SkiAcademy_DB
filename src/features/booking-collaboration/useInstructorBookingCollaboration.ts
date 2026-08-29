import { useCallback, useState } from 'react';
import { presentCanonicalCommandErrorWithContext } from './presentCollaborationError';
import {
  selectCollaborationChangeRequests,
  selectCollaborationProposals,
  useBookingCollaborationStore,
} from './bookingCollaborationStore';
import { useBookingCollaborationCommands } from './useBookingCollaborationCommands';
import type {
  BookingChangeRequestCabinetItem,
  BookingProposalCabinetItem,
} from './bookingCollaborationContracts';

export function useInstructorBookingCollaboration(input: {
  readonly accountId?: string;
  readonly instructorId?: string;
  readonly onNotify: (
    type: 'error' | 'success' | 'info' | 'warning',
    title: string,
    message: string
  ) => void;
  readonly t: (key: string) => string;
}) {
  const proposals = useBookingCollaborationStore(selectCollaborationProposals);
  const changeRequests = useBookingCollaborationStore(selectCollaborationChangeRequests);
  const commands = useBookingCollaborationCommands({
    accountId: input.accountId,
    instructorId: input.instructorId,
  });
  const [createProposalParticipant, setCreateProposalParticipant] = useState<{
    participantId: string;
    label: string;
  } | null>(null);
  const [submittingId, setSubmittingId] = useState<string | undefined>();

  const handleCommandError = useCallback(
    async (error: unknown) => {
      const presented = presentCanonicalCommandErrorWithContext(error, { t: input.t });
      if (presented.shouldRefresh) {
        await commands.refetchInstructorCollaborationReads?.();
        input.onNotify('warning', input.t('requestFailed'), presented.message);
        return;
      }
      input.onNotify('error', input.t('requestFailed'), presented.message);
    },
    [commands, input]
  );

  const handleWithdrawProposal = useCallback(
    async (proposal: BookingProposalCabinetItem) => {
      setSubmittingId(proposal.proposalId);
      try {
        await commands.withdrawProposal({
          proposalId: proposal.proposalId,
          expectedRevision: proposal.revision,
        });
        input.onNotify(
          'success',
          input.t('collabWithdrawProposal'),
          input.t('scheduleUpdatedDesc')
        );
      } catch (error) {
        await handleCommandError(error);
      } finally {
        setSubmittingId(undefined);
      }
    },
    [commands, handleCommandError, input]
  );

  const handleCreateProposal = useCallback(
    async (payload: { localDate: string; localTime: string; durationMinutes: number }) => {
      if (!createProposalParticipant) return;
      setSubmittingId(createProposalParticipant.participantId);
      try {
        await commands.createProposal({
          participantId: createProposalParticipant.participantId,
          ...payload,
        });
        input.onNotify('success', input.t('collabCreateProposal'), input.t('scheduleUpdatedDesc'));
        setCreateProposalParticipant(null);
      } catch (error) {
        await handleCommandError(error);
      } finally {
        setSubmittingId(undefined);
      }
    },
    [commands, createProposalParticipant, handleCommandError, input]
  );

  const handleCreateChangeRequest = useCallback(
    async (bookingId: string, reason: string) => {
      setSubmittingId(bookingId);
      try {
        await commands.createChangeRequest({ bookingId, reason });
        input.onNotify(
          'success',
          input.t('collabCreateChangeRequest'),
          input.t('scheduleUpdatedDesc')
        );
      } catch (error) {
        await handleCommandError(error);
      } finally {
        setSubmittingId(undefined);
      }
    },
    [commands, handleCommandError, input]
  );

  const handleWithdrawChangeRequest = useCallback(
    async (request: BookingChangeRequestCabinetItem) => {
      setSubmittingId(request.requestId);
      try {
        await commands.withdrawChangeRequest({
          requestId: request.requestId,
          expectedRevision: request.revision,
        });
        input.onNotify(
          'success',
          input.t('collabWithdrawChangeRequest'),
          input.t('scheduleUpdatedDesc')
        );
      } catch (error) {
        await handleCommandError(error);
      } finally {
        setSubmittingId(undefined);
      }
    },
    [commands, handleCommandError, input]
  );

  return {
    proposals,
    changeRequests,
    createProposalParticipant,
    setCreateProposalParticipant,
    submittingId,
    handleWithdrawProposal,
    handleCreateProposal,
    handleCreateChangeRequest,
    handleWithdrawChangeRequest,
    refetchParticipantAccessRead: commands.refetchParticipantAccessRead,
    blockParticipant: commands.blockParticipant,
    unblockParticipant: commands.unblockParticipant,
    createRelationship: commands.createRelationship,
    revokeRelationship: commands.revokeRelationship,
  };
}
