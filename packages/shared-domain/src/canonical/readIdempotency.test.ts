import { describe, expect, it } from 'vitest';
import { IdempotencyKeySchema } from './commands/commandContext';
import { canonicalDeterministicHash } from './deterministicIdentity';
import {
  boundCanonicalReadIdempotencyCursor,
  buildCanonicalReadIdempotencyKey,
} from './readIdempotency';

describe('canonical read idempotency bounding', () => {
  it('keeps a missing cursor as the start sentinel', () => {
    expect(boundCanonicalReadIdempotencyCursor(undefined)).toBe('start');
    expect(boundCanonicalReadIdempotencyCursor('')).toBe('start');
  });

  it('hashes the full opaque cursor without truncation', () => {
    const cursor = `eyJ${'A'.repeat(400)}`;
    const hashed = boundCanonicalReadIdempotencyCursor(cursor);
    expect(hashed).toBe(canonicalDeterministicHash([cursor]));
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toContain(cursor);
    expect(hashed.slice(0, 32)).not.toBe(cursor.slice(0, 32));
  });

  it('is deterministic for the same cursor and distinct for different cursors', () => {
    const cursorA = 'cursor_page_2_fixture';
    const cursorB = 'cursor_page_3_fixture';
    expect(boundCanonicalReadIdempotencyCursor(cursorA)).toBe(
      boundCanonicalReadIdempotencyCursor(cursorA)
    );
    expect(boundCanonicalReadIdempotencyCursor(cursorA)).not.toBe(
      boundCanonicalReadIdempotencyCursor(cursorB)
    );
  });

  it('passes through short keys unchanged', () => {
    expect(
      buildCanonicalReadIdempotencyKey([
        'read:lesson_booking',
        'instructor_history',
        'start',
        'none',
      ])
    ).toBe('read:lesson_booking:instructor_history:start:none');
  });

  it('keeps concatenated long identity parts within IdempotencyKeySchema', () => {
    const longId = `booking_${'x'.repeat(120)}`;
    const cursorHash = boundCanonicalReadIdempotencyCursor(`opaque_${'y'.repeat(400)}`);
    const key = buildCanonicalReadIdempotencyKey([
      'read:lesson_booking',
      'admin_detail',
      cursorHash,
      longId,
    ]);
    expect(key.length).toBeLessThanOrEqual(200);
    expect(IdempotencyKeySchema.safeParse(key).success).toBe(true);
    expect(key).not.toContain(longId);
    expect(key.startsWith('read:lesson_booking:admin_detail:')).toBe(true);
  });

  it('is deterministic for the same overflow parts', () => {
    const parts = [
      'read:lesson_booking',
      'admin_detail',
      boundCanonicalReadIdempotencyCursor('opaque_cursor_overflow'),
      `booking_${'z'.repeat(120)}`,
    ] as const;
    expect(buildCanonicalReadIdempotencyKey(parts)).toBe(buildCanonicalReadIdempotencyKey(parts));
  });
});
