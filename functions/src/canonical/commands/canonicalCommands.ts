import {
  CanonicalCommandError,
  CommandKindSchema,
  CorrelationIdSchema,
  type CorrelationId,
  evaluateCommandContextAuthorization,
  parseCommandEnvelope,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandKind,
  type CommandResult,
  commandErrorResult,
} from '@ski-academy/shared-domain';

const MALFORMED_ENVELOPE_CORRELATION_ID = CorrelationIdSchema.parse('correlation_malformed_envelope');

import type { CanonicalTransactionExecutor } from '../transactions';
import { createFinanceCommandHandlers, type MonetaryEventLoader } from '../finance';
import { createParticipantAccessCommandHandlers } from '../participantAccess';
import { createBookingCommandHandlers } from '../bookings';
import { createGuestBookingCommandHandlers } from '../bookings/guestBookingCommands';
import { createBookingRescheduleCommandHandlers } from '../bookings/bookingRescheduleCommands';
import { createBookingCancellationCommandHandlers } from '../bookings/bookingCancellationCommands';
import { createBookingPartyCommandHandlers } from '../bookings/bookingPartyCommands';
import { createBookingProposalCommandHandlers } from '../bookings/bookingProposalCommands';
import { createBookingChangeRequestCommandHandlers } from '../bookings/bookingChangeRequestCommands';
import { createBookingAttendanceCommandHandlers } from '../bookings/bookingAttendanceCommands';
import { createCourseDayCommandHandlers, createCourseEnrollmentCommandHandlers, createCourseEnrollmentLifecycleCommandHandlers } from '../courses';
import type { GuestBookingCommandEnvironment } from '../bookings/guestBookingCommands';
import type { GuestCourseEnrollmentCommandEnvironment } from '../courses/guestCourseEnrollmentLifecycle';

export type CommandHandler<Kind extends CommandKind> = (
  envelope: CommandEnvelope<Kind>,
  environment: CommandExecutionEnvironment
) => Promise<CommandResult<Kind>>;

export type CommandHandlerMap = {
  [Kind in CommandKind]?: CommandHandler<Kind>;
};

export interface CanonicalCommands {
  execute<Kind extends CommandKind>(
    envelope: CommandEnvelope<Kind>
  ): Promise<CommandResult<Kind>>;
}

function readEnvelopeCorrelationId(envelope: CommandEnvelope<CommandKind>): CorrelationId {
  if (!envelope || typeof envelope !== 'object') {
    return MALFORMED_ENVELOPE_CORRELATION_ID;
  }

  const context = (envelope as { context?: { correlationId?: unknown } }).context;
  if (!context || typeof context !== 'object') {
    return MALFORMED_ENVELOPE_CORRELATION_ID;
  }

  const parsed = CorrelationIdSchema.safeParse(context.correlationId);
  return parsed.success ? parsed.data : MALFORMED_ENVELOPE_CORRELATION_ID;
}

function readEnvelopeKind(envelope: CommandEnvelope<CommandKind>): CommandKind {
  const parsed = CommandKindSchema.safeParse((envelope as { kind?: unknown }).kind);
  return parsed.success ? parsed.data : 'complete_booking';
}

function validationErrorResult<Kind extends CommandKind>(
  envelope: CommandEnvelope<Kind>
): CommandResult<Kind> {
  const correlationId = readEnvelopeCorrelationId(envelope);
  const kind = readEnvelopeKind(envelope) as Kind;
  return commandErrorResult(
    kind,
    correlationId,
    new CanonicalCommandError('validation', {
      correlationId,
      details: { reason: 'malformed' },
    }).toTransport()
  );
}

function forbiddenErrorResult<Kind extends CommandKind>(
  envelope: CommandEnvelope<Kind>
): CommandResult<Kind> {
  return commandErrorResult(
    envelope.kind,
    envelope.context.correlationId,
    new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    }).toTransport()
  );
}

function unavailableErrorResult<Kind extends CommandKind>(
  envelope: CommandEnvelope<Kind>
): CommandResult<Kind> {
  return commandErrorResult(
    envelope.kind,
    envelope.context.correlationId,
    new CanonicalCommandError('unavailable', {
      correlationId: envelope.context.correlationId,
    }).toTransport()
  );
}

export function createCanonicalCommands(
  handlers: CommandHandlerMap,
  environment: CommandExecutionEnvironment
): CanonicalCommands {
  return {
    async execute<Kind extends CommandKind>(envelope: CommandEnvelope<Kind>): Promise<
      CommandResult<Kind>
    > {
      const parsed = parseCommandEnvelope(envelope);
      if (!parsed.success) {
        return validationErrorResult(envelope);
      }

      const normalized = parsed.data as CommandEnvelope<Kind>;
      const authorization = evaluateCommandContextAuthorization(normalized.context);
      if (authorization === 'forbidden') {
        return forbiddenErrorResult(normalized);
      }

      const handler = handlers[normalized.kind] as CommandHandler<Kind> | undefined;
      if (!handler) {
        return unavailableErrorResult(normalized);
      }

      try {
        return await handler(normalized, environment);
      } catch (error) {
        if (error instanceof CanonicalCommandError) {
          return commandErrorResult(
            normalized.kind,
            normalized.context.correlationId,
            error.toTransport()
          );
        }
        throw error;
      }
    },
  };
}

export function createProductionCanonicalCommands(
  environment: CommandExecutionEnvironment,
  executor: CanonicalTransactionExecutor,
  options: {
    readonly guestActionTokenSecret?: string;
    readonly monetaryEventLoader?: MonetaryEventLoader;
  } = {}
): CanonicalCommands {
  const guestEnvironmentFactory = (
    base: CommandExecutionEnvironment
  ): GuestBookingCommandEnvironment => ({
    ...base,
    guestActionTokenSecret: options.guestActionTokenSecret,
  });

  const guestCourseEnrollmentEnvironmentFactory = (
    base: CommandExecutionEnvironment
  ): GuestCourseEnrollmentCommandEnvironment => ({
    ...base,
    guestActionTokenSecret: options.guestActionTokenSecret,
  });

  return createCanonicalCommands(
    {
      ...createParticipantAccessCommandHandlers(executor),
      ...createFinanceCommandHandlers(executor, options.monetaryEventLoader),
      ...createBookingCommandHandlers(executor),
      ...createBookingRescheduleCommandHandlers(executor),
      ...createGuestBookingCommandHandlers(executor, options.guestActionTokenSecret),
      ...createBookingCancellationCommandHandlers(executor, guestEnvironmentFactory),
      ...createBookingPartyCommandHandlers(executor),
      ...createBookingProposalCommandHandlers(executor),
      ...createBookingChangeRequestCommandHandlers(executor),
      ...createBookingAttendanceCommandHandlers(executor),
      ...createCourseDayCommandHandlers(executor),
      ...createCourseEnrollmentCommandHandlers(executor),
      ...createCourseEnrollmentLifecycleCommandHandlers(
        executor,
        guestCourseEnrollmentEnvironmentFactory
      ),
    },
    environment
  );
}
