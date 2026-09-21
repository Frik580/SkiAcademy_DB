import { z } from 'zod';
import { encodeCommandActorScope } from './commandActorScope';
import {
  CommandFingerprintSchema,
  computeCommandFingerprintFromEnvelope,
} from './commandFingerprint';
import { CommandKindSchema } from './commands/commandEnvelope';
import type { CommandEnvelope } from './commands/commandEnvelope';
import type { IdempotencyKey } from './commands/commandContext';
import type { CommandKind } from './commands/commandKinds';
import { CommandSuccessResultSchema, type CommandResult } from './commands/commandResults';
import { canonicalDeterministicHash } from './deterministicIdentity';
import { CommandErrorTransportSchema } from './errors';
import {
  CommandIdSchema,
  CorrelationIdSchema,
  TestSessionIdSchema,
  type CommandId,
} from './identifiers';
import { canonicalPaths } from './paths';
import { CanonicalTimestampSchema } from './primitives';
import {
  LIVE_CANONICAL_EXECUTION_SCOPE,
  canonicalScopeFields,
  canonicalScopeKeyParts,
  type CanonicalExecutionScope,
} from './canonicalScope';

export const COMMAND_IDEMPOTENCY_SCHEMA_VERSION = 'idempotency:v2' as const;

export const COMMAND_IDEMPOTENCY_COMPLETION_STATES = ['completed', 'rejected'] as const;
export type CommandIdempotencyCompletionState =
  (typeof COMMAND_IDEMPOTENCY_COMPLETION_STATES)[number];

const COMMAND_KEY_PREFIX = 'command-key:v2';
const SCOPED_FINGERPRINT_PREFIX = 'command-fingerprint:v2';

export const StoredCommandResultSchema = z.discriminatedUnion('status', [
  CommandSuccessResultSchema,
  z
    .object({
      status: z.literal('error'),
      kind: CommandKindSchema,
      correlationId: CorrelationIdSchema,
      error: CommandErrorTransportSchema,
    })
    .strict(),
]);

export type StoredCommandResult = z.output<typeof StoredCommandResultSchema>;

export const CommandIdempotencyRecordSchema = z
  .object({
    schemaVersion: z.literal(COMMAND_IDEMPOTENCY_SCHEMA_VERSION),
    dataScope: z.enum(['live', 'test']),
    testSessionId: TestSessionIdSchema.optional(),
    actorScope: z.string().min(1),
    commandKind: CommandKindSchema,
    fingerprint: CommandFingerprintSchema,
    completionState: z.enum(COMMAND_IDEMPOTENCY_COMPLETION_STATES),
    result: StoredCommandResultSchema,
    correlationId: CorrelationIdSchema,
    decidedAt: CanonicalTimestampSchema,
    createdAt: CanonicalTimestampSchema,
  })
  .strict()
  .superRefine((record, context) => {
    if (
      (record.dataScope === 'live' && record.testSessionId !== undefined) ||
      (record.dataScope === 'test' && record.testSessionId === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['testSessionId'],
        message: 'testSessionId must be present exactly for TEST scope',
      });
    }
  });

export type CommandIdempotencyRecord = z.output<typeof CommandIdempotencyRecordSchema>;

export interface CommandIdempotencyIdentity {
  readonly commandKey: CommandId;
  readonly actorScope: string;
  readonly fingerprint: z.output<typeof CommandFingerprintSchema>;
  readonly scope: CanonicalExecutionScope;
  readonly recordPath: ReturnType<typeof canonicalPaths.commandIdempotency>;
}

export function deriveCommandKey(
  actorScope: string,
  idempotencyKey: IdempotencyKey,
  scope: CanonicalExecutionScope = LIVE_CANONICAL_EXECUTION_SCOPE
): CommandId {
  return CommandIdSchema.parse(
    canonicalDeterministicHash([
      COMMAND_KEY_PREFIX,
      ...canonicalScopeKeyParts(scope),
      actorScope,
      idempotencyKey,
    ])
  );
}

export function resolveCommandIdempotencyIdentity(
  envelope: CommandEnvelope,
  scope: CanonicalExecutionScope = LIVE_CANONICAL_EXECUTION_SCOPE
): CommandIdempotencyIdentity {
  const actorScope = encodeCommandActorScope(envelope.context.actor);
  const commandKey = deriveCommandKey(actorScope, envelope.context.idempotencyKey, scope);
  const fingerprint = CommandFingerprintSchema.parse(
    canonicalDeterministicHash([
      SCOPED_FINGERPRINT_PREFIX,
      ...canonicalScopeKeyParts(scope),
      computeCommandFingerprintFromEnvelope(envelope),
    ])
  );
  return {
    commandKey,
    actorScope,
    fingerprint,
    scope: canonicalScopeFields(scope),
    recordPath: canonicalPaths.commandIdempotency(commandKey),
  };
}

export function parseCommandIdempotencyRecord(
  input: unknown
): z.ZodSafeParseResult<CommandIdempotencyRecord> {
  return CommandIdempotencyRecordSchema.safeParse(input);
}

export function shouldPersistIdempotencyOutcome(result: CommandResult): boolean {
  if (result.status === 'success') {
    return true;
  }
  return !result.error.retryable;
}

export function toStoredCommandResult(result: CommandResult): StoredCommandResult {
  return StoredCommandResultSchema.parse(result);
}

export function fromStoredCommandResult<Kind extends CommandKind>(
  stored: StoredCommandResult,
  kind: Kind
): CommandResult<Kind> {
  if (stored.kind !== kind) {
    throw new Error('Stored command result kind does not match requested kind');
  }
  return stored as CommandResult<Kind>;
}
