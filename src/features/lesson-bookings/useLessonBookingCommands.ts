import { useCallback } from 'react';
import {
  executeAuthenticatedCanonicalCommand,
  executeGuestCanonicalCommand,
  type ClientCallableCapability,
} from '../../lib/canonical/canonicalCommandClient';
import { mapCanonicalCommandResultError } from '../../lib/canonical/mapCanonicalCommandError';
import {
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  AggregateRevisionSchema,
  lessonContentFields,
  parseCommandResultPayload,
  type GuestBookingActionCredential,
} from '@ski-academy/shared-domain';
import type {
  AuthenticatedLessonBookingInput,
  GuestLessonBookingInput,
} from './lessonBookingContracts';
import { mapLessonBookingCalendarInput } from './mapCalendarInput';
import { persistGuestBookingCredential } from './guestCredentialStorage';
import { useLessonBookingStore } from './lessonBookingStore';
import { mergeLessonBookingRecords } from './lessonBookingViewModel';
import { queryLessonBookingReadModels } from '../../lib/canonical/canonicalReadModelClient';

async function refetchAccountHotBookings(_accountId: string): Promise<void> {
  const result = await queryLessonBookingReadModels({ scope: 'account_hot' });
  const merged = mergeLessonBookingRecords(useLessonBookingStore.getState().items, result.items);
  useLessonBookingStore.getState().mergeItems(merged);
}

export function useLessonBookingCommands(accountId: string | undefined) {
  const createAuthenticatedBooking = useCallback(
    async (input: AuthenticatedLessonBookingInput): Promise<void> => {
      if (!accountId) {
        throw new Error('Authentication is required.');
      }
      const calendarInput = mapLessonBookingCalendarInput({
        localDate: input.localDate,
        localTime: input.localTime,
        durationHours: input.durationMinutes / 60,
      });
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'create_confirmed_booking',
        intent: {
          bookingId: BookingIdSchema.parse(input.identity.bookingId),
          instructorId: InstructorIdSchema.parse(input.instructorId),
          participantIds: input.participantIds.map((id) => ParticipantIdSchema.parse(id)),
          ...lessonContentFields({
            difficulty: input.difficulty,
            notes: input.notes,
          }),
        },
        idempotencyKey: input.identity.idempotencyKey,
        calendarInput,
        timezone: input.timezone,
        exercisedCapability: input.exercisedCapability,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchAccountHotBookings(accountId);
    },
    [accountId]
  );

  const createGuestBooking = useCallback(
    async (input: GuestLessonBookingInput): Promise<GuestBookingActionCredential> => {
      const calendarInput = mapLessonBookingCalendarInput({
        localDate: input.localDate,
        localTime: input.localTime,
        durationHours: input.durationMinutes / 60,
      });
      const result = await executeGuestCanonicalCommand({
        kind: 'create_guest_booking_request',
        intent: {
          bookingId: BookingIdSchema.parse(input.identity.bookingId),
          instructorId: InstructorIdSchema.parse(input.instructorId),
          participantIds: [ParticipantIdSchema.parse(input.participantId)],
          ...lessonContentFields({
            difficulty: input.difficulty,
            notes: input.notes,
          }),
        },
        idempotencyKey: input.identity.idempotencyKey,
        calendarInput,
        timezone: input.timezone,
        guestParticipantDisplayName: input.guestDisplayName,
        guestParticipantSkillLevel: input.guestSkillLevel,
        guestParticipantDiscipline: input.guestDiscipline,
        guestParticipantAgeYears: input.guestAgeYears,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      if (result.status !== 'success') {
        throw new Error('Guest booking did not succeed.');
      }
      const payload = parseCommandResultPayload('create_guest_booking_request', result.payload);
      if (!payload.success || !payload.data.guestActionCredential) {
        throw new Error('Guest credential was not returned.');
      }
      persistGuestBookingCredential(payload.data.guestActionCredential);
      return payload.data.guestActionCredential;
    },
    []
  );

  const requestCancellation = useCallback(
    async (input: {
      readonly bookingId: string;
      readonly expectedRevision: number;
      readonly idempotencyKey: string;
      readonly exercisedCapability: ClientCallableCapability;
      readonly guestCredential?: GuestBookingActionCredential;
    }): Promise<void> => {
      if (input.guestCredential) {
        const result = await executeGuestCanonicalCommand({
          kind: 'request_booking_cancellation',
          intent: { bookingId: BookingIdSchema.parse(input.bookingId) },
          idempotencyKey: input.idempotencyKey,
          expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
          guestActionNonce: input.guestCredential.nonce,
          guestActionSignature: input.guestCredential.signature,
        });
        const error = mapCanonicalCommandResultError(result);
        if (error) throw error;
        return;
      }
      if (!accountId) {
        throw new Error('Authentication is required.');
      }
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'request_booking_cancellation',
        intent: { bookingId: BookingIdSchema.parse(input.bookingId) },
        idempotencyKey: input.idempotencyKey,
        expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
        exercisedCapability: input.exercisedCapability,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchAccountHotBookings(accountId);
    },
    [accountId]
  );

  return {
    createAuthenticatedBooking,
    createGuestBooking,
    requestCancellation,
    refetchAccountHotBookings: accountId ? () => refetchAccountHotBookings(accountId) : undefined,
  };
}

export function deriveExercisedCapabilityFromParticipants(
  authorities: readonly ('self' | 'parent_guardian')[]
): ClientCallableCapability {
  if (authorities.some((authority) => authority === 'parent_guardian')) {
    return 'parent_guardian';
  }
  return 'account_owner';
}
