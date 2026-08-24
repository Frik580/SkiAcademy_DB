import {
  accountCommandActor,
  type AccountId,
  type CommandContext,
  type CommandEnvelope,
  type CommandKind,
  type CommandSource,
  type ExercisedCapability,
  type IdempotencyKey,
} from '@ski-academy/shared-domain';
import type { CallableRequest } from 'firebase-functions/v2/https';

export interface CallableCommandTransportInput<Kind extends CommandKind> {
  readonly kind: Kind;
  readonly intent: CommandEnvelope<Kind>['intent'];
  readonly idempotencyKey: IdempotencyKey;
  readonly correlationId: CommandContext['correlationId'];
  readonly causationId?: CommandContext['causationId'];
  readonly expectedRevision?: CommandContext['expectedRevision'];
  readonly calendarInput?: CommandContext['calendarInput'];
  readonly timezone?: CommandContext['timezone'];
}

export interface CallableAuthenticatedAccountContext {
  readonly accountId: AccountId;
  readonly capability: ExercisedCapability;
  readonly source: CommandSource;
}

export function buildCommandContextFromCallableAccount(
  transport: CallableAuthenticatedAccountContext,
  input: Pick<
    CallableCommandTransportInput<CommandKind>,
    'idempotencyKey' | 'correlationId' | 'causationId' | 'expectedRevision' | 'calendarInput' | 'timezone'
  >
): CommandContext {
  return {
    actor: accountCommandActor(transport.accountId),
    exercisedCapability: transport.capability,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
    ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
    source: transport.source,
    ...(input.calendarInput === undefined ? {} : { calendarInput: input.calendarInput }),
    ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
    transportMetadata: {
      transport: 'firebase_callable',
    },
  };
}

export function buildCommandEnvelopeFromCallable<
  Kind extends CommandKind,
>(
  transport: CallableAuthenticatedAccountContext,
  input: CallableCommandTransportInput<Kind>
): CommandEnvelope<Kind> {
  return {
    kind: input.kind,
    context: buildCommandContextFromCallableAccount(transport, input),
    intent: input.intent,
  };
}

export function parseCallableCommandTransportInput<Kind extends CommandKind>(
  request: CallableRequest<CallableCommandTransportInput<Kind>>
): CallableCommandTransportInput<Kind> {
  const data = request.data;
  if (!data || typeof data !== 'object') {
    throw new Error('Callable payload is required.');
  }
  return data as CallableCommandTransportInput<Kind>;
}
