import { z } from 'zod';
import { CanonicalTimestampSchema, type CanonicalTimestamp } from './primitives';

function isFirestoreTimestampLike(
  value: unknown
): value is Readonly<{ seconds: number; nanoseconds: number }> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { seconds?: unknown; nanoseconds?: unknown };
  return (
    typeof candidate.seconds === 'number' &&
    Number.isFinite(candidate.seconds) &&
    typeof candidate.nanoseconds === 'number' &&
    Number.isFinite(candidate.nanoseconds)
  );
}

export function normalizeCanonicalTimestamp(value: unknown): CanonicalTimestamp | undefined {
  if (!isFirestoreTimestampLike(value)) {
    return undefined;
  }

  const parsed = CanonicalTimestampSchema.safeParse({
    seconds: value.seconds,
    nanoseconds: value.nanoseconds,
  });
  return parsed.success ? parsed.data : undefined;
}

export function normalizeFirestoreRecord(value: unknown): unknown {
  const timestamp = normalizeCanonicalTimestamp(value);
  if (timestamp) {
    return timestamp;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeFirestoreRecord(entry));
  }

  if (typeof value === 'object' && value !== null) {
    const normalized: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      normalized[key] = normalizeFirestoreRecord(child);
    }
    return normalized;
  }

  return value;
}

export function normalizeFirestoreDocument(
  value: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = normalizeFirestoreRecord(value);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    return undefined;
  }

  return normalized as Record<string, unknown>;
}

export const NormalizedCanonicalTimestampSchema = z.preprocess(
  (value) => normalizeCanonicalTimestamp(value) ?? value,
  CanonicalTimestampSchema
);
