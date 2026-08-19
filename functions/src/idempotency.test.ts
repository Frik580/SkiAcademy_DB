import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  FUNCTION_IDEMPOTENCY_COLLECTION,
  idempotencyRef,
  idempotencySpecFromRequest,
  parseIdempotencyKey,
  replayIdempotentResult,
  withOptionalIdempotency,
} from './idempotency';

describe('idempotency helpers', () => {
  it('accepts the client retry key charset including time colons', () => {
    expect(parseIdempotencyKey({ idempotencyKey: 'resched_b-100_2026-12-11_14:00_' })).toBe(
      'resched_b-100_2026-12-11_14:00_'
    );
  });

  it('rejects malformed idempotency keys', () => {
    expect(() => parseIdempotencyKey({ idempotencyKey: 'bad key' })).toThrow(HttpsError);
  });

  it('builds a spec only when a key is present', () => {
    expect(idempotencySpecFromRequest({}, 'createBooking_u1', { id: 'b-1' })).toBeUndefined();
    expect(
      idempotencySpecFromRequest({ idempotencyKey: 'b-1' }, 'createBooking_u1', { id: 'b-1' })
    ).toEqual({
      operation: 'createBooking_u1',
      key: 'b-1',
      requestSignature: JSON.stringify({ id: 'b-1' }),
    });
  });

  it('replays a matching record and conflicts on a different signature', () => {
    const snap = {
      exists: true,
      data: () => ({
        requestSignature: JSON.stringify({ id: 'b-1' }),
        result: { bookingId: 'b-1' },
      }),
    } as FirebaseFirestore.DocumentSnapshot;

    expect(replayIdempotentResult(snap, JSON.stringify({ id: 'b-1' }))).toEqual({
      bookingId: 'b-1',
    });
    expect(() => replayIdempotentResult(snap, JSON.stringify({ id: 'b-2' }))).toThrow(
      expect.objectContaining({ code: 'already-exists', message: 'IDEMPOTENCY_KEY_CONFLICT' })
    );
  });

  it('returns the stored result on a second transaction with the same key', async () => {
    const docs = new Map<string, Record<string, unknown>>();
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => ({ path: `${name}/${id}`, id }),
      }),
      runTransaction: async (
        fn: (transaction: {
          get: (ref: { path: string }) => Promise<{ exists: boolean; data: () => unknown }>;
          set: (ref: { path: string }, data: Record<string, unknown>) => void;
        }) => Promise<unknown>
      ) => {
        const transaction = {
          get: async (ref: { path: string }) => ({
            exists: docs.has(ref.path),
            data: () => docs.get(ref.path),
          }),
          set: (ref: { path: string }, data: Record<string, unknown>) => {
            docs.set(ref.path, data);
          },
        };
        return fn(transaction);
      },
    };

    const spec = idempotencySpecFromRequest(
      { idempotencyKey: 'create_b-1' },
      'createBooking_u1',
      { id: 'b-1' }
    );
    let executions = 0;

    const first = await withOptionalIdempotency(db as never, spec, async (_tx, commit) => {
      executions += 1;
      const result = { bookingId: 'b-1', newBalance: 400 };
      commit(result);
      return result;
    });
    const second = await withOptionalIdempotency(db as never, spec, async (_tx, commit) => {
      executions += 1;
      const result = { bookingId: 'b-1', newBalance: 300 };
      commit(result);
      return result;
    });

    expect(first).toEqual({ bookingId: 'b-1', newBalance: 400 });
    expect(second).toEqual(first);
    expect(executions).toBe(1);
    expect(
      docs.has(
        `${FUNCTION_IDEMPOTENCY_COLLECTION}/${idempotencyRef(db as never, spec!).id}`
      )
    ).toBe(true);
  });
});
