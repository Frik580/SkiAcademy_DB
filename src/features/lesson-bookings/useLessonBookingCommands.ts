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
  GuestBookingActionCredentialSchema,
  type GuestBookingActionCredential,
} from '@ski-academy/shared-domain';
import type {
  AuthenticatedLessonBookingInput,
  GuestLessonBookingInput,
} from './lessonBookingContracts';
import { mapLessonBookingCalendarInput } from './mapCalendarInput';
import { persistGuestBookingCredential } from './guestCredentialStorage';
import { useLessonBookingStore } from './lessonBookingStore';
import {
  syncAccountHotLessonBookingsFromServer,
  syncAccountLessonBookingsFromServer,
} from './syncAccountLessonBookings';
import {
  resolveLessonCancellationLifecycleFromStore,
  type CabinetCancellationCommandResult,
} from '../student-cabinet/cabinetCancellationOutcome';
import { resolveCabinetCancellationOutcome } from '../student-cabinet/resolveCabinetCancellationOutcome';
import { shouldSyncAccountLessonHistory } from '../../store/accountLessonBookingSync';

/**
 * Post-command account lesson read refresh.
 *
 * The owning surface decides how much history it needs; the hook must not read
 * router state itself. Default is the cheap account_hot refresh, which is
 * enough for every surface that renders current/upcoming lessons.
 */
export type LessonBookingCommandRefresh = () => Promise<void>;

export type UseLessonBookingCommandsOptions = {
  readonly accountId: string | undefined;
  /**
   * Override for history-owning surfaces (for example `/cabinet/history` and
   * `/cabinet/profile_journey`), which need the full hot + account_history sync.
   */
  readonly refresh?: LessonBookingCommandRefresh;
};

/**
 * Default post-command refresh for non-history surfaces.
 *
 * Reads only account_hot and still returns the newly created / cancelled
 * booking, which is what the cabinet renders.
 */
export async function refreshAccountLessonBookingsHotOnly(): Promise<void> {
  await syncAccountHotLessonBookingsFromServer();
}

/** Post-command refresh for history-owning surfaces: hot + account_history. */
export async function refreshAccountLessonBookingsWithHistory(): Promise<void> {
  await syncAccountLessonBookingsFromServer();
}

/**
 * Resolves the post-command refresh for a surface.
 *
 * Surfaces that render rows outside account_hot — `/cabinet/history` and the
 * `/cabinet/profile_journey` completed-lesson preview — need the full hot +
 * account_history sync (which also keeps admin-approved `pending_cancellation`
 * → `cancelled` visible without a reload). Every other surface stays on the
 * account_hot-only refresh.
 */
export function resolveLessonBookingCommandRefreshStrategy(input: {
  readonly pathname: string;
  readonly accountId: string | undefined;
}): LessonBookingCommandRefresh {
  return shouldSyncAccountLessonHistory(input)
    ? refreshAccountLessonBookingsWithHistory
    : refreshAccountLessonBookingsHotOnly;
}

export function useLessonBookingCommands(
  accountIdOrOptions: string | undefined | UseLessonBookingCommandsOptions
) {
  const options: UseLessonBookingCommandsOptions =
    typeof accountIdOrOptions === 'object' && accountIdOrOptions !== null
      ? accountIdOrOptions
      : { accountId: accountIdOrOptions };
  const { accountId, refresh } = options;

  const refreshAfterCommand = useCallback<LessonBookingCommandRefresh>(
    () => (refresh ? refresh() : refreshAccountLessonBookingsHotOnly()),
    [refresh]
  );

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
      await refreshAfterCommand();
    },
    [accountId, refreshAfterCommand]
  );

  const createGuestBooking = useCallback(
    async (input: GuestLessonBookingInput): Promise<GuestBookingActionCredential | undefined> => {
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
        guestPhone: input.guestPhone,
        guestEmail: input.guestEmail,
        guestParticipantSkillLevel: input.guestSkillLevel,
        guestParticipantDiscipline: input.guestDiscipline,
        guestParticipantAgeYears: input.guestAgeYears,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      if (result.status !== 'success') {
        throw new Error('Guest booking did not succeed.');
      }
      const credentialPayload =
        typeof result.payload === 'object' && result.payload !== null
          ? (result.payload as { readonly guestActionCredential?: unknown }).guestActionCredential
          : undefined;
      const parsedCredential = GuestBookingActionCredentialSchema.safeParse(credentialPayload);
      if (!parsedCredential.success) return undefined;

      persistGuestBookingCredential(parsedCredential.data);
      return parsedCredential.data;
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
    }): Promise<CabinetCancellationCommandResult> => {
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
        return resolveCabinetCancellationOutcome({
          entityKind: 'lesson',
          entityId: input.bookingId,
          nextRevision: input.expectedRevision + 1,
          commandResult:
            result.status === 'success' ? result : { status: 'success', payload: undefined },
          refresh: async () => undefined,
          readLifecycleFromStore: () =>
            resolveLessonCancellationLifecycleFromStore(
              input.bookingId,
              useLessonBookingStore.getState().items
            ),
        });
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
      return resolveCabinetCancellationOutcome({
        entityKind: 'lesson',
        entityId: input.bookingId,
        nextRevision: input.expectedRevision + 1,
        commandResult:
          result.status === 'success' ? result : { status: 'success', payload: undefined },
        // Local lifecycle patch is applied by resolveCabinetCancellationOutcome
        // before this refresh runs, so an empty hot response cannot resurrect
        // the pre-cancellation state.
        refresh: refreshAfterCommand,
        readLifecycleFromStore: () =>
          resolveLessonCancellationLifecycleFromStore(
            input.bookingId,
            useLessonBookingStore.getState().items
          ),
      });
    },
    [accountId, refreshAfterCommand]
  );

  return {
    createAuthenticatedBooking,
    createGuestBooking,
    requestCancellation,
    // Post-command recovery refetch: deliberately account_hot only. No caller
    // depended on the account_history side effect this used to carry.
    refetchAccountHotBookings: accountId ? refreshAccountLessonBookingsHotOnly : undefined,
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
