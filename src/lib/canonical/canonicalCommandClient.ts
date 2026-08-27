import {
  CorrelationIdSchema,
  deriveCommandKey,
  encodeCommandActorScope,
  resolveCommandIdempotencyIdentity,
  type CommandEnvelope,
  type CommandKind,
  type CommandResult,
  type IdempotencyKey,
  accountCommandActor,
  guestCommandActor,
} from '@ski-academy/shared-domain';
import { callFunction } from '../functions/functionsClient';
import { toCanonicalCommandClientError } from './mapCanonicalCommandError';

export const AUTHENTICATED_CANONICAL_COMMAND_CALLABLE = 'executeCanonicalCommand';
export const GUEST_CANONICAL_COMMAND_CALLABLE = 'executeGuestCanonicalCommand';

export type ClientCallableCapability = 'account_owner' | 'parent_guardian' | 'instructor';

export interface CanonicalCommandSubmission<Kind extends CommandKind> {
  readonly kind: Kind;
  readonly intent: CommandEnvelope<Kind>['intent'];
  readonly idempotencyKey: IdempotencyKey;
  readonly correlationId?: string;
  readonly causationId?: CommandEnvelope<Kind>['context']['causationId'];
  readonly expectedRevision?: CommandEnvelope<Kind>['context']['expectedRevision'];
  readonly calendarInput?: CommandEnvelope<Kind>['context']['calendarInput'];
  readonly timezone?: CommandEnvelope<Kind>['context']['timezone'];
  readonly exercisedCapability?: ClientCallableCapability;
  readonly administratorContext?: boolean;
}

export interface GuestCanonicalCommandSubmission<Kind extends CommandKind> {
  readonly kind: Kind;
  readonly intent: CommandEnvelope<Kind>['intent'];
  readonly idempotencyKey: IdempotencyKey;
  readonly correlationId?: string;
  readonly causationId?: CommandEnvelope<Kind>['context']['causationId'];
  readonly expectedRevision?: CommandEnvelope<Kind>['context']['expectedRevision'];
  readonly calendarInput?: CommandEnvelope<Kind>['context']['calendarInput'];
  readonly timezone?: CommandEnvelope<Kind>['context']['timezone'];
  readonly guestActionNonce?: string;
  readonly guestActionSignature?: string;
}

function createCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `correlation_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `correlation_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseCorrelationId(value: string): CommandEnvelope['context']['correlationId'] {
  return CorrelationIdSchema.parse(value);
}

export function deriveCanonicalCommandIdForSubmission(
  actorScope: string,
  idempotencyKey: IdempotencyKey
): string {
  return deriveCommandKey(actorScope, idempotencyKey);
}

export function deriveAuthenticatedCommandId(
  accountId: string,
  idempotencyKey: IdempotencyKey
): string {
  return deriveCanonicalCommandIdForSubmission(
    encodeCommandActorScope(accountCommandActor(accountId as never)),
    idempotencyKey
  );
}

export function deriveGuestCommandId(
  guestSubjectId: string,
  idempotencyKey: IdempotencyKey
): string {
  return deriveCanonicalCommandIdForSubmission(
    encodeCommandActorScope(guestCommandActor(guestSubjectId as never)),
    idempotencyKey
  );
}

export async function executeAuthenticatedCanonicalCommand<Kind extends CommandKind>(
  _accountId: string,
  submission: CanonicalCommandSubmission<Kind>
): Promise<CommandResult<Kind>> {
  const correlationId = parseCorrelationId(submission.correlationId ?? createCorrelationId());
  const payload = {
    kind: submission.kind,
    intent: submission.intent,
    idempotencyKey: submission.idempotencyKey,
    correlationId,
    ...(submission.causationId ? { causationId: submission.causationId } : {}),
    ...(submission.expectedRevision !== undefined
      ? { expectedRevision: submission.expectedRevision }
      : {}),
    ...(submission.calendarInput ? { calendarInput: submission.calendarInput } : {}),
    ...(submission.timezone ? { timezone: submission.timezone } : {}),
    ...(submission.exercisedCapability
      ? { exercisedCapability: submission.exercisedCapability }
      : {}),
    ...(submission.administratorContext ? { administratorContext: true } : {}),
  };

  try {
    return await callFunction<typeof payload, CommandResult<Kind>>(
      AUTHENTICATED_CANONICAL_COMMAND_CALLABLE,
      payload,
      { idempotencyKey: submission.idempotencyKey }
    );
  } catch (error) {
    throw toCanonicalCommandClientError(error, correlationId);
  }
}

export async function executeGuestCanonicalCommand<Kind extends CommandKind>(
  submission: GuestCanonicalCommandSubmission<Kind>
): Promise<CommandResult<Kind>> {
  const correlationId = parseCorrelationId(submission.correlationId ?? createCorrelationId());
  const payload = {
    kind: submission.kind,
    intent: submission.intent,
    idempotencyKey: submission.idempotencyKey,
    correlationId,
    ...(submission.causationId ? { causationId: submission.causationId } : {}),
    ...(submission.expectedRevision !== undefined
      ? { expectedRevision: submission.expectedRevision }
      : {}),
    ...(submission.calendarInput ? { calendarInput: submission.calendarInput } : {}),
    ...(submission.timezone ? { timezone: submission.timezone } : {}),
    ...(submission.guestActionNonce ? { guestActionNonce: submission.guestActionNonce } : {}),
    ...(submission.guestActionSignature
      ? { guestActionSignature: submission.guestActionSignature }
      : {}),
  };

  try {
    return await callFunction<typeof payload, CommandResult<Kind>>(
      GUEST_CANONICAL_COMMAND_CALLABLE,
      payload,
      { idempotencyKey: submission.idempotencyKey }
    );
  } catch (error) {
    throw toCanonicalCommandClientError(error, correlationId);
  }
}

export function previewAuthenticatedCommandIdentity<Kind extends CommandKind>(
  accountId: string,
  envelope: Pick<CommandEnvelope<Kind>, 'kind' | 'context' | 'intent'>
): ReturnType<typeof resolveCommandIdempotencyIdentity> {
  return resolveCommandIdempotencyIdentity({
    kind: envelope.kind,
    context: {
      ...envelope.context,
      actor: accountCommandActor(accountId as never),
    },
    intent: envelope.intent,
  } as CommandEnvelope<Kind>);
}
