import { useCallback, useState } from 'react';
import type { LessonBookingCabinetItem } from '../lesson-bookings/lessonBookingContracts';
import { presentCanonicalCommandErrorWithContext } from './presentCollaborationError';
import {
  selectCollaborationProposals,
  useBookingCollaborationStore,
} from './bookingCollaborationStore';
import { useBookingCollaborationCommands } from './useBookingCollaborationCommands';
import type { BookingProposalCabinetItem } from './bookingCollaborationContracts';

export function useCustomerBookingCollaboration(input: {
  readonly accountId?: string;
  readonly onNotify: (
    type: 'error' | 'success' | 'info' | 'warning',
    title: string,
    message: string
  ) => void;
  readonly t: (key: string) => string;
}) {
  const proposals = useBookingCollaborationStore(selectCollaborationProposals);
  const commands = useBookingCollaborationCommands({ accountId: input.accountId });
  const [rescheduleTarget, setRescheduleTarget] = useState<LessonBookingCabinetItem | null>(null);
  const [submittingId, setSubmittingId] = useState<string | undefined>();

  const handleCommandError = useCallback(
    async (error: unknown) => {
      const presented = presentCanonicalCommandErrorWithContext(error, { t: input.t });
      if (presented.shouldRefresh) {
        await commands.refetchCustomerCollaborationReads?.();
        input.onNotify('warning', input.t('requestFailed'), presented.message);
        return;
      }
      input.onNotify('error', input.t('requestFailed'), presented.message);
    },
    [commands, input]
  );

  const exercisedCapabilityForBooking = useCallback((booking: LessonBookingCabinetItem) => {
    return booking.partyKind === 'family_group' ? 'parent_guardian' : 'account_owner';
  }, []);

  const handleWithdrawCancellation = useCallback(
    async (booking: LessonBookingCabinetItem) => {
      setSubmittingId(booking.bookingId);
      try {
        await commands.withdrawCancellation({
          bookingId: booking.bookingId,
          expectedRevision: booking.revision,
          exercisedCapability: exercisedCapabilityForBooking(booking),
        });
        input.onNotify(
          'success',
          input.t('collabWithdrawCancellation'),
          input.t('scheduleUpdatedDesc')
        );
      } catch (error) {
        await handleCommandError(error);
      } finally {
        setSubmittingId(undefined);
      }
    },
    [commands, exercisedCapabilityForBooking, handleCommandError, input]
  );

  const handleRescheduleSubmit = useCallback(
    async (payload: { localDate: string; localTime: string; durationMinutes: number }) => {
      if (!rescheduleTarget) return;
      setSubmittingId(rescheduleTarget.bookingId);
      try {
        await commands.rescheduleBooking({
          bookingId: rescheduleTarget.bookingId,
          expectedRevision: rescheduleTarget.revision,
          localDate: payload.localDate,
          localTime: payload.localTime,
          durationMinutes: payload.durationMinutes,
          exercisedCapability: exercisedCapabilityForBooking(rescheduleTarget),
        });
        input.onNotify('success', input.t('lessonRescheduled'), input.t('lessonRescheduledDesc'));
        setRescheduleTarget(null);
      } catch (error) {
        await handleCommandError(error);
      } finally {
        setSubmittingId(undefined);
      }
    },
    [commands, exercisedCapabilityForBooking, handleCommandError, input, rescheduleTarget]
  );

  const handleAcceptProposal = useCallback(
    async (proposal: BookingProposalCabinetItem) => {
      setSubmittingId(proposal.proposalId);
      try {
        await commands.acceptProposal({
          proposalId: proposal.proposalId,
          expectedRevision: proposal.revision,
          exercisedCapability: 'account_owner',
        });
        input.onNotify('success', input.t('collabAcceptProposal'), input.t('scheduleUpdatedDesc'));
      } catch (error) {
        await handleCommandError(error);
      } finally {
        setSubmittingId(undefined);
      }
    },
    [commands, handleCommandError, input]
  );

  const handleDeclineProposal = useCallback(
    async (proposal: BookingProposalCabinetItem) => {
      setSubmittingId(proposal.proposalId);
      try {
        await commands.declineProposal({
          proposalId: proposal.proposalId,
          expectedRevision: proposal.revision,
          exercisedCapability: 'account_owner',
        });
        input.onNotify('success', input.t('collabDeclineProposal'), input.t('scheduleUpdatedDesc'));
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
    rescheduleTarget,
    setRescheduleTarget,
    submittingId,
    handleWithdrawCancellation,
    handleRescheduleSubmit,
    handleAcceptProposal,
    handleDeclineProposal,
  };
}
