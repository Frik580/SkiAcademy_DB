import {
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  AggregateRevisionSchema,
  BookingSchema,
  CanonicalCommandError,
  PaymentSchema,
  assertBookingPaymentIdentity,
  attendanceIdFromBookingIdentity,
  commandSuccessResult,
  derivePartyKindFromCount,
  evaluateAdminGuestBookingIdentityLinkAvailability,
  nextAggregateRevision,
  participantBlockIdFromDirection,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type Booking,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type Participant,
  type ParticipantBlock,
  type ParticipantManagement,
  type Payment,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { attendancePath, parseAttendance } from './attendanceStore';
import { BOOKING_PLANNING_ESTIMATES, bookingPath, parseBooking, toFirestoreWritePayload } from './bookingStore';
import { buildLinkGuestBookingAsAdministratorAuditPlan } from './guestBookingAudit';
import { assertLinkGuestBookingAsAdministratorAuthorization } from './guestBookingAuthorization';
import {
  planAcquireParticipantBookingClaim,
  planReleaseParticipantBookingClaim,
} from './bookingClaimOperations';
import { commitResourceClaimPlan } from '../resourceClaims/resourceClaimEngine';
import {
  assertAccountActive,
  assertAdministrator,
  assertParticipantActive,
  buildParticipantAccessTopology,
  evaluateNewServiceBlocked,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';
import {
  accountPath,
  parseAccount,
  parseParticipant,
  parseParticipantBlock,
  parseParticipantManagement,
  participantBlockPath,
  participantManagementPath,
  participantPath,
} from '../participantAccess/participantAccessStore';
import {
  FINANCE_PLANNING_ESTIMATES,
  parsePayment,
  paymentPath,
  toFirestoreWritePayload as financeToFirestoreWritePayload,
} from '../finance/financeStore';

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

function throwUnavailable(
  envelope: CommandEnvelope,
  reason: string
): never {
  if (reason === 'not_guest') {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'unsupported' },
    });
  }
  if (reason === 'already_linked' || reason === 'ambiguous_guest_participant') {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'conflict' },
    });
  }
  if (reason === 'expired_reservation') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reservationExpiresAt', reason: 'out_of_range' },
    });
  }
  throw new CanonicalCommandError('invalid_transition', {
    correlationId: envelope.context.correlationId,
    details: { resourceKind: 'booking', reason: 'conflict' },
  });
}

function linkGuestBookingToAccountAsAdministratorHandler(
  envelope: CommandEnvelope<'link_guest_booking_to_account_as_administrator'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'link_guest_booking_to_account_as_administrator'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertLinkGuestBookingAsAdministratorAuthorization(envelope);
  const actor = requireAccountActor(envelope);
  assertAdministrator(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);
  const targetParticipantDocumentPath = participantPath(envelope.intent.targetParticipantId);

  let booking!: Booking;
  let payment!: Payment;
  let paymentAssociationChanged = false;
  let sourceGuestParticipantId!: Participant['participantId'];
  let targetParticipant!: Participant;
  let targetManagement!: ParticipantManagement;
  let plannedBookingRevision = AggregateRevisionSchema.parse(1);
  let plannedPaymentRevision = AggregateRevisionSchema.parse(1);
  let acquireClaimPlan!: Awaited<ReturnType<typeof planAcquireParticipantBookingClaim>>;
  let releaseClaimPlan!: Awaited<ReturnType<typeof planReleaseParticipantBookingClaim>>;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'link_guest_booking_to_account_as_administrator'> =
    {
      read: async (session) => {
        const decidedAt = timestampFromDate(environment.clock.now());
        const actorAccountRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        assertAccountActive(
          envelope,
          parseAccount(actorAccountRead.exists ? actorAccountRead.data : undefined)
        );

        const targetAccountRead = await session.tx.get({
          path: accountPath(envelope.intent.targetAccountId),
        });
        session.plan.planRead({
          path: accountPath(envelope.intent.targetAccountId),
          category: 'authorization_check',
        });
        const targetAccount = assertAccountActive(
          envelope,
          parseAccount(targetAccountRead.exists ? targetAccountRead.data : undefined)
        );

        const bookingRead = await session.tx.get({ path: bookingDocumentPath });
        session.plan.planRead({ path: bookingDocumentPath, category: 'aggregate' });
        const parsedBooking = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
        if (!parsedBooking) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'booking', reason: 'conflict' },
          });
        }
        booking = parsedBooking;

        const paymentDocumentPath = paymentPath(booking.paymentId);
        const paymentRead = await session.tx.get({ path: paymentDocumentPath });
        session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
        const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
        if (!parsedPayment) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'paymentId', reason: 'conflict' },
          });
        }
        assertBookingPaymentIdentity(envelope.context.correlationId, booking, parsedPayment);
        payment = parsedPayment;
        if (
          (booking.payerAccountId !== undefined &&
            booking.payerAccountId !== envelope.intent.targetAccountId) ||
          (payment.payerAccountId !== undefined &&
            payment.payerAccountId !== envelope.intent.targetAccountId)
        ) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'booking', reason: 'conflict' },
          });
        }
        paymentAssociationChanged = payment.payerAccountId !== envelope.intent.targetAccountId;

        const partyParticipants: Participant[] = [];
        for (const participantId of booking.party.participantIds) {
          const participantRead = await session.tx.get({ path: participantPath(participantId) });
          session.plan.planRead({ path: participantPath(participantId), category: 'aggregate' });
          const participant = parseParticipant(
            participantRead.exists ? participantRead.data : undefined
          );
          if (!participant) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { resourceKind: 'participant', reason: 'conflict' },
            });
          }
          partyParticipants.push(participant);
        }

        const sourceAttendanceReads = await Promise.all(
          booking.party.participantIds.map(async (participantId) => {
            const attendanceId = attendanceIdFromBookingIdentity({
              strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
              subjectKind: 'booking',
              occurrenceId: booking.occurrence.occurrenceId,
              participantId,
            });
            const attendanceRead = await session.tx.get({ path: attendancePath(attendanceId) });
            session.plan.planRead({ path: attendancePath(attendanceId), category: 'aggregate' });
            return {
              participantId,
              attendance: parseAttendance(
                attendanceRead.exists ? attendanceRead.data : undefined
              ),
            };
          })
        );
        const recordedAttendance = sourceAttendanceReads.some(
          (item) =>
            item.attendance?.attendanceStatus === 'present' ||
            item.attendance?.attendanceStatus === 'absent'
        );

        const availability = evaluateAdminGuestBookingIdentityLinkAvailability({
          bookingOrigin: booking.attribution.bookingOrigin,
          lifecycleStatus: booking.lifecycle.status,
          reservationExpiresAt:
            booking.lifecycle.status === 'pending'
              ? booking.lifecycle.reservationExpiresAt
              : undefined,
          now: decidedAt,
          partyParticipantIds: booking.party.participantIds,
          participants: partyParticipants,
          recordedAttendance,
          administratorAccountActive: true,
        });
        if (!availability.canLink || !availability.sourceGuestParticipantId) {
          throwUnavailable(envelope, availability.reason ?? 'ineligible_lifecycle');
        }
        sourceGuestParticipantId = availability.sourceGuestParticipantId;
        const parsedSource = partyParticipants.find(
          (participant) => participant.participantId === sourceGuestParticipantId
        );
        assertParticipantActive(envelope, parsedSource);

        if (envelope.intent.targetParticipantId === sourceGuestParticipantId) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'targetParticipantId', reason: 'conflict' },
          });
        }
        if (booking.party.participantIds.includes(envelope.intent.targetParticipantId)) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'targetParticipantId', reason: 'conflict' },
          });
        }

        const targetParticipantRead = await session.tx.get({ path: targetParticipantDocumentPath });
        session.plan.planRead({ path: targetParticipantDocumentPath, category: 'aggregate' });
        targetParticipant = assertParticipantActive(
          envelope,
          parseParticipant(
            targetParticipantRead.exists ? targetParticipantRead.data : undefined
          )
        );
        if (targetParticipant.management.kind !== 'managed') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }

        const managementDocumentPath = participantManagementPath(
          targetParticipant.management.participantManagementId
        );
        const managementRead = await session.tx.get({ path: managementDocumentPath });
        session.plan.planRead({ path: managementDocumentPath, category: 'aggregate' });
        const parsedManagement = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        if (
          !parsedManagement ||
          parsedManagement.status !== 'active' ||
          parsedManagement.accountId !== envelope.intent.targetAccountId ||
          parsedManagement.participantId !== envelope.intent.targetParticipantId
        ) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }
        targetManagement = parsedManagement;

        const managerBlockPath = participantBlockPath(
          participantBlockIdFromDirection({
            participantId: envelope.intent.targetParticipantId,
            instructorId: booking.occurrence.instructorId,
            createdByKind: 'participant_manager',
          })
        );
        const instructorBlockPathValue = participantBlockPath(
          participantBlockIdFromDirection({
            participantId: envelope.intent.targetParticipantId,
            instructorId: booking.occurrence.instructorId,
            createdByKind: 'instructor',
          })
        );
        const managerBlockRead = await session.tx.get({ path: managerBlockPath });
        const instructorBlockRead = await session.tx.get({ path: instructorBlockPathValue });
        session.plan.planRead({ path: managerBlockPath, category: 'aggregate' });
        session.plan.planRead({ path: instructorBlockPathValue, category: 'aggregate' });
        const blocks: ParticipantBlock[] = [];
        const managerBlock = parseParticipantBlock(
          managerBlockRead.exists ? managerBlockRead.data : undefined
        );
        const instructorBlock = parseParticipantBlock(
          instructorBlockRead.exists ? instructorBlockRead.data : undefined
        );
        if (managerBlock) blocks.push(managerBlock);
        if (instructorBlock) blocks.push(instructorBlock);
        const topology = buildParticipantAccessTopology({
          account: targetAccount,
          participant: targetParticipant,
          management: targetManagement,
          additionalBlocks: blocks,
        });
        if (
          evaluateNewServiceBlocked(
            topology,
            envelope.intent.targetParticipantId,
            booking.occurrence.instructorId
          )
        ) {
          throw new CanonicalCommandError('blocked_relationship', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }

        releaseClaimPlan = await planReleaseParticipantBookingClaim(
          session,
          booking,
          sourceGuestParticipantId,
          metadata,
          environment.clock.now()
        );
        acquireClaimPlan = await planAcquireParticipantBookingClaim(session, {
          booking,
          participantId: envelope.intent.targetParticipantId,
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: environment.clock.now(),
        });

        plannedBookingRevision = nextAggregateRevision(booking.revision);
        plannedPaymentRevision = paymentAssociationChanged
          ? nextAggregateRevision(payment.revision)
          : payment.revision;
        session.plan.planMutation({
          path: bookingDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
        });
        if (paymentAssociationChanged) {
          session.plan.planMutation({
            path: paymentPath(booking.paymentId),
            kind: 'update',
            category: 'payment_wallet',
            estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.paymentBytes,
          });
        }
      },
      planAuditOutbox: async () =>
        buildLinkGuestBookingAsAdministratorAuditPlan({
          bookingId: envelope.intent.bookingId,
          sourceGuestParticipantId,
          targetAccountId: envelope.intent.targetAccountId,
          targetParticipantId: envelope.intent.targetParticipantId,
          bookingRevision: plannedBookingRevision,
          paymentId: booking.paymentId,
          paymentRevision: plannedPaymentRevision,
          reasonExplanation: envelope.intent.reasonExplanation,
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        const nextParticipantIds = booking.party.participantIds.map((participantId) =>
          participantId === sourceGuestParticipantId
            ? envelope.intent.targetParticipantId
            : participantId
        );
        const updatedBooking = BookingSchema.parse({
          ...booking,
          party: {
            kind: derivePartyKindFromCount(nextParticipantIds.length),
            participantIds: nextParticipantIds,
          },
          occurrence: {
            ...booking.occurrence,
            serviceParty: {
              participantIds: nextParticipantIds,
              ...(booking.occurrence.serviceParty.frozenAt === undefined
                ? {}
                : { frozenAt: booking.occurrence.serviceParty.frozenAt }),
            },
          },
          payerAccountId: envelope.intent.targetAccountId,
          revision: plannedBookingRevision,
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

        if (paymentAssociationChanged) {
          const updatedPayment = PaymentSchema.parse({
            ...payment,
            payerAccountId: envelope.intent.targetAccountId,
            revision: plannedPaymentRevision,
            updatedAt: decidedAt,
          });
          session.tx.update(
            { path: paymentPath(booking.paymentId) },
            financeToFirestoreWritePayload(updatedPayment as Record<string, unknown>)
          );
        }

        const claimMetadata = {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: context.decidedAt,
        };
        commitResourceClaimPlan(session, acquireClaimPlan, claimMetadata);
        if (releaseClaimPlan) {
          commitResourceClaimPlan(session, releaseClaimPlan, claimMetadata);
        }

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

export function createAdminGuestBookingLinkCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'link_guest_booking_to_account_as_administrator'> {
  return {
    link_guest_booking_to_account_as_administrator: (envelope, environment) =>
      linkGuestBookingToAccountAsAdministratorHandler(envelope, environment, executor),
  };
}
