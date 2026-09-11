import { z } from 'zod';
import { IdempotencyKeySchema, type IdempotencyKey } from './commands/commandContext';
import type { CommandKind } from './commands/commandKinds';
import { canonicalDeterministicHash } from './deterministicIdentity';
import type { SystemActorId } from './identifiers';

const SCHEDULED_IDEMPOTENCY_KEY_PREFIX = 'sched';
const SCHEDULED_IDEMPOTENCY_BOUNDED_DIGEST_VERSION = 'bounded:v1';

const PERSONAL_DATA_PATTERNS = [/@/, /\b\+?\d[\d\s().-]{7,}\d\b/] as const;

export const ScheduledIdempotencySubjectIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);

function buildScopedIdempotencyKey(parts: readonly string[]): IdempotencyKey {
  const candidate = [SCHEDULED_IDEMPOTENCY_KEY_PREFIX, ...parts].join(':');
  const parsed = IdempotencyKeySchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }
  // Concatenated identities with hashed occurrence IDs can exceed the 200-char
  // IdempotencyKey bound. Digest the same opaque parts so distinct deadlines
  // remain distinct without throwing and silently failing the sweep.
  const digest = canonicalDeterministicHash([
    SCHEDULED_IDEMPOTENCY_KEY_PREFIX,
    SCHEDULED_IDEMPOTENCY_BOUNDED_DIGEST_VERSION,
    ...parts,
  ]);
  return IdempotencyKeySchema.parse(`${SCHEDULED_IDEMPOTENCY_KEY_PREFIX}:${digest}`);
}

function assertOpaqueIdempotencyMaterial(fieldName: string, value: string): void {
  for (const pattern of PERSONAL_DATA_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(`${fieldName} must not contain personal data`);
    }
  }
  const parsed = ScheduledIdempotencySubjectIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${fieldName} must use opaque identifiers`);
  }
}

export function buildScheduledCommandIdempotencyKey(input: {
  readonly systemActorId: SystemActorId;
  readonly commandKind: CommandKind;
  readonly subjectId: string;
  readonly occurrenceId?: string;
  readonly deadlineId?: string;
}): IdempotencyKey {
  assertOpaqueIdempotencyMaterial('subjectId', input.subjectId);
  if (input.occurrenceId !== undefined) {
    assertOpaqueIdempotencyMaterial('occurrenceId', input.occurrenceId);
  }
  if (input.deadlineId !== undefined) {
    assertOpaqueIdempotencyMaterial('deadlineId', input.deadlineId);
  }
  const parts = [input.systemActorId, input.commandKind, input.subjectId];
  if (input.occurrenceId !== undefined) {
    parts.push(input.occurrenceId);
  }
  if (input.deadlineId !== undefined) {
    parts.push(input.deadlineId);
  }
  return buildScopedIdempotencyKey(parts);
}

export function buildProviderCallbackIdempotencyKey(providerEventId: string): IdempotencyKey {
  const normalized = providerEventId.trim();
  if (!normalized) {
    throw new Error('Provider event id is required for callback idempotency');
  }
  assertOpaqueIdempotencyMaterial('providerEventId', normalized);
  return buildScopedIdempotencyKey(['provider', normalized]);
}
