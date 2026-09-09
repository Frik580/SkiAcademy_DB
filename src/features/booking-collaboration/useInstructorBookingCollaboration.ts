import { useCallback, useEffect, useState } from 'react';
import { queryLessonPricingSettingsReadModel } from '../../lib/canonical/canonicalReadModelClient';
import { presentCanonicalCommandErrorWithContext } from './presentCollaborationError';
import {
  selectCollaborationChangeRequests,
  selectCollaborationProposals,
  useBookingCollaborationStore,
} from './bookingCollaborationStore';
import { useBookingCollaborationCommands } from './useBookingCollaborationCommands';
import { instructorLessonAttendanceSubmissionId } from './deriveCollaborationIdempotencyKeys';
import type {
  BookingChangeRequestCabinetItem,
  BookingProposalCabinetItem,
  InstructorProposalPartyCandidate,
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
  const [createProposalParty, setCreateProposalParty] = useState<{
    readonly participants: readonly InstructorProposalPartyCandidate[];
    readonly selectedParticipantIds: readonly string[];
    readonly hourlyRateKzt?: number;
  } | null>(null);
  const [maxParticipantsPerLesson, setMaxParticipantsPerLesson] = useState<number | undefined>();
  const [surchargePerHourKzt, setSurchargePerHourKzt] = useState<number | undefined>();
  const [submittingId, setSubmittingId] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void queryLessonPricingSettingsReadModel({ scope: 'lesson_pricing_settings' })
      .then((result) => {
        if (cancelled || !result.item.configured) return;
        setMaxParticipantsPerLesson(result.item.maxParticipantsPerLesson);
        setSurchargePerHourKzt(result.item.additionalParticipantSurchargePerHourKzt);
      })
      .catch(() => {
        if (!cancelled) {
          setMaxParticipantsPerLesson(undefined);
          setSurchargePerHourKzt(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    async (payload: {
      participantIds: readonly string[];
      localDate: string;
      localTime: string;
      durationMinutes: number;
    }) => {
      if (!createProposalParty) return;
      setSubmittingId(payload.participantIds.join(','));
      try {
        await commands.createProposal({
          participantIds: payload.participantIds,
          localDate: payload.localDate,
          localTime: payload.localTime,
          durationMinutes: payload.durationMinutes,
        });
        input.onNotify('success', input.t('collabCreateProposal'), input.t('scheduleUpdatedDesc'));
        setCreateProposalParty(null);
      } catch (error) {
        await handleCommandError(error);
      } finally {
        setSubmittingId(undefined);
      }
    },
    [commands, createProposalParty, handleCommandError, input]
  );

  const handleCreateChangeRequest = useCallback(
    async (changeRequest: {
      readonly bookingId: string;
      readonly reason: string;
      readonly expectedRevision: number;
    }) => {
      setSubmittingId(changeRequest.bookingId);
      try {
        await commands.createChangeRequest(changeRequest);
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

  const handleRecordLessonAttendance = useCallback(
    async (attempt: {
      readonly bookingId: string;
      readonly participantId: string;
      readonly attendanceStatus: 'present' | 'absent';
      readonly expectedAttendanceRevision?: number;
    }) => {
      setSubmittingId(
        instructorLessonAttendanceSubmissionId(attempt.bookingId, attempt.participantId)
      );
      try {
        await commands.recordLessonAttendance(attempt);
        input.onNotify(
          'success',
          attempt.expectedAttendanceRevision === undefined
            ? input.t('instructorAttendanceRecorded')
            : input.t('instructorAttendanceUpdated'),
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
    createProposalParty,
    setCreateProposalParty,
    maxParticipantsPerLesson,
    surchargePerHourKzt,
    submittingId,
    handleWithdrawProposal,
    handleCreateProposal,
    handleCreateChangeRequest,
    handleRecordLessonAttendance,
    handleWithdrawChangeRequest,
    refetchParticipantAccessRead: commands.refetchParticipantAccessRead,
    blockParticipant: commands.blockParticipant,
    unblockParticipant: commands.unblockParticipant,
    createRelationship: commands.createRelationship,
    revokeRelationship: commands.revokeRelationship,
  };
}
