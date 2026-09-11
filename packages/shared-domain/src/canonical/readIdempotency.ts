import { IdempotencyKeySchema, type IdempotencyKey } from './commands/commandContext';
import { canonicalDeterministicHash } from './deterministicIdentity';

const READ_IDEMPOTENCY_BOUNDED_DIGEST_VERSION = 'bounded:v1';
const READ_IDEMPOTENCY_EMPTY_CURSOR = 'start';
const FALLBACK_READ_PREFIX = 'read';

/**
 * Opaque pagination cursors are unbounded relative to IdempotencyKeySchema.
 * Hash the whole cursor so the key stays deterministic, unique, and bounded.
 */
export function boundCanonicalReadIdempotencyCursor(cursor: string | undefined): string {
  if (!cursor) {
    return READ_IDEMPOTENCY_EMPTY_CURSOR;
  }
  return canonicalDeterministicHash([cursor]);
}

/**
 * Join read-idempotency parts and fall back to a digest when the candidate
 * exceeds IdempotencyKeySchema (200 chars, charset A-Za-z0-9._:-).
 */
export function buildCanonicalReadIdempotencyKey(
  parts: readonly [string, ...string[]]
): IdempotencyKey {
  const candidate = parts.join(':');
  const parsed = IdempotencyKeySchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  const digest = canonicalDeterministicHash([
    READ_IDEMPOTENCY_BOUNDED_DIGEST_VERSION,
    ...parts,
  ]);
  if (parts.length >= 2) {
    const scoped = IdempotencyKeySchema.safeParse(`${parts[0]}:${parts[1]}:${digest}`);
    if (scoped.success) {
      return scoped.data;
    }
  }
  const prefixed = IdempotencyKeySchema.safeParse(`${parts[0]}:${digest}`);
  if (prefixed.success) {
    return prefixed.data;
  }
  return IdempotencyKeySchema.parse(`${FALLBACK_READ_PREFIX}:${digest}`);
}
