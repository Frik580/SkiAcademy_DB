import { IdempotencyKeySchema, type IdempotencyKey } from './commands/commandContext';
import { canonicalDeterministicHash } from './deterministicIdentity';

export const BOUNDED_CANONICAL_IDEMPOTENCY_DIGEST_VERSION = 'bounded:v1';

export interface BuildBoundedCanonicalIdempotencyKeyOptions {
  /** Used only when prefix-scoped digests still exceed the schema bound. */
  readonly fallbackPrefix?: string;
}

/**
 * Join idempotency parts and fall back to a deterministic digest when the candidate
 * exceeds IdempotencyKeySchema (200 chars, charset A-Za-z0-9._:-).
 */
export function buildBoundedCanonicalIdempotencyKey(
  parts: readonly [string, ...string[]],
  options?: BuildBoundedCanonicalIdempotencyKeyOptions
): IdempotencyKey {
  const candidate = parts.join(':');
  const parsed = IdempotencyKeySchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  const digest = canonicalDeterministicHash([
    BOUNDED_CANONICAL_IDEMPOTENCY_DIGEST_VERSION,
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
  const fallbackPrefix = options?.fallbackPrefix ?? parts[0];
  return IdempotencyKeySchema.parse(`${fallbackPrefix}:${digest}`);
}

/** Bounded idempotency keys for client-issued canonical commands. */
export function buildCanonicalCommandIdempotencyKey(
  parts: readonly [string, ...string[]]
): IdempotencyKey {
  return buildBoundedCanonicalIdempotencyKey(parts);
}
