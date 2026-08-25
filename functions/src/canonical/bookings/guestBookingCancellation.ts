import {
  AggregateRevisionSchema,
  BookingSchema,
  CanonicalCommandError,
  commandSuccessResult,
  isGuestReservationExpired,
  nextAggregateRevision,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type Booking,
  type BookingCancellationReasonCode,
  type CommandEnvelope,
  type CommandResult,
} from '@ski-academy/shared-domain';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { resolvePendingGuestCancellationAuthorization } from './guestBookingAuthorization';
import { buildPendingGuestCancellationAuditPlan } from './guestBookingAudit';
import type { GuestBookingCommandEnvironment } from './guestBookingCommands';
import { commitPlannedReleaseBookingClaims, planReleaseBookingClaims } from './bookingClaimOperations';
import { BOOKING_PLANNING_ESTIMATES, bookingPath, parseBooking, toFirestoreWritePayload } from './bookingStore';

interface CommandMetadata {
  readonly commandId: ReturnType<typeof resolveCommandIdempotencyIdentity>['commandKey'];
  readonly correlationId: CommandEnvelope['context']['correlationId'];
}

function metadataFromEnvelope(envelope: CommandEnvelope): CommandMetadata {
  const identity = resolveCommandIdempotencyIdentity(envelope);
  return {
    commandId: identity.commandKey,
    correlationId: envelope.context.correlationId,
  };
}

export function requestPendingGuestCancellationHandler(
  envelope: CommandEnvelope<'request_booking_cancellation'>,
  environment: GuestBookingCommandEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'request_booking_cancellation'>> {
  const metadata = metadataFromEnvelope(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);

  let booking!: Booking;
  let reasonCode!: BookingCancellationReasonCode;
  let plannedRevision = AggregateRevisionSchema.parse(1);
  let plannedReleaseClaims: Awaited<ReturnType<typeof planReleaseBookingClaims>> = [];

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'request_booking_cancellation'> = {
    read: async (session) => {
      const bookingRead = await session.tx.get({ path: bookingDocumentPath });
      session.plan.planRead({ path: bookingDocumentPath, category: 'aggregate' });
      const parsed = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
      if (!parsed) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'bookingId', reason: 'conflict' },
        });
      }
      booking = parsed;
      const now = timestampFromDate(environment.clock.now());
      reasonCode = resolvePendingGuestCancellationAuthorization(
        envelope,
        booking,
        environment.guestActionTokenSecret,
        now
      );

      if (
        reasonCode === 'guest_cancelled' &&
        isGuestReservationExpired({
          now,
          reservationExpiresAt:
            booking.lifecycle.status === 'pending'
              ? booking.lifecycle.reservationExpiresAt
              : now,
        })
      ) {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { field: 'reservationExpiresAt', reason: 'out_of_range' },
        });
      }

      plannedRevision = nextAggregateRevision(booking.revision);
      plannedReleaseClaims = await planReleaseBookingClaims(
        session,
        booking,
        metadata,
        environment.clock.decidedAt()
      );
      session.plan.planMutation({
        path: bookingDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
      });
    },
    planAuditOutbox: async () =>
      buildPendingGuestCancellationAuditPlan({
        envelope,
        bookingId: envelope.intent.bookingId,
        bookingRevision: plannedRevision,
        reasonCode,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const updatedBooking = BookingSchema.parse({
        ...booking,
        lifecycle: {
          status: 'cancelled',
          cancelledAt: decidedAt,
          reasonCode,
        },
        revision: plannedRevision,
        updatedAt: decidedAt,
        audit: {
          ...booking.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      });
      session.tx.update(
        { path: bookingDocumentPath },
        toFirestoreWritePayload(updatedBooking as Record<string, unknown>)
      );
      commitPlannedReleaseBookingClaims(
        session,
        plannedReleaseClaims,
        metadata,
        context.decidedAt
      );
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: bookingDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}
