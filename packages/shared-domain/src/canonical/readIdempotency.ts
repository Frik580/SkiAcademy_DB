import type { IdempotencyKey } from './commands/commandContext';
import { buildBoundedCanonicalIdempotencyKey } from './boundedCanonicalIdempotency';
import { canonicalDeterministicHash } from './deterministicIdentity';

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
  return buildBoundedCanonicalIdempotencyKey(parts, { fallbackPrefix: FALLBACK_READ_PREFIX });
}
