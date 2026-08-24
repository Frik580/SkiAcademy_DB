import { z } from 'zod';
import { IdempotencyKeySchema, type IdempotencyKey } from './commands/commandContext';
import type { CommandKind } from './commands/commandKinds';
import type { SystemActorId } from './identifiers';

const SCHEDULED_IDEMPOTENCY_KEY_PREFIX = 'sched';

const PERSONAL_DATA_PATTERNS = [/@/, /\b\+?\d[\d\s().-]{7,}\d\b/] as const;

export const ScheduledIdempotencySubjectIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);

function buildScopedIdempotencyKey(parts: readonly string[]): IdempotencyKey {
  const candidate = [SCHEDULED_IDEMPOTENCY_KEY_PREFIX, ...parts].join(':');
  const parsed = IdempotencyKeySchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error('Scheduled idempotency key exceeds canonical bounds');
  }
  return parsed.data;
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
}): IdempotencyKey {
  assertOpaqueIdempotencyMaterial('subjectId', input.subjectId);
  if (input.occurrenceId !== undefined) {
    assertOpaqueIdempotencyMaterial('occurrenceId', input.occurrenceId);
  }
  const parts = [input.systemActorId, input.commandKind, input.subjectId];
  if (input.occurrenceId !== undefined) {
    parts.push(input.occurrenceId);
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
