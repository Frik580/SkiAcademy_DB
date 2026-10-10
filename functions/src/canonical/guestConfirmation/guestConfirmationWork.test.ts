import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  processGuestConfirmationWork,
  workRetryDelayMs,
  WORK_BLOCKED_RETRY_MS,
} from './guestConfirmationWork';
import { parseGuestConfirmationControl } from './guestConfirmationRecovery';

describe('guest reconciliation work policy', () => {
  it('backs off and caps repeated failure frequency at one daily attempt', () => {
    expect([1, 2, 3].map(workRetryDelayMs)).toEqual([30_000, 60_000, 120_000]);
    expect(workRetryDelayMs(8)).toBe(WORK_BLOCKED_RETRY_MS);
    expect(workRetryDelayMs(1000)).toBe(WORK_BLOCKED_RETRY_MS);
  });
  it('does not accept an empty ready marker as a proven cutover', () => {
    expect(parseGuestConfirmationControl({ mode: 'queue', status: 'ready' })).toBeUndefined();
  });
  it('queries only due work with a hard bound and performs no subject/payment lookup on an empty queue', async () => {
    const query = {
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [], size: 0 }),
    };
    const collection = vi.fn().mockReturnValue(query);
    const firestore = { collection, runTransaction: vi.fn() } as unknown as Firestore;
    const result = await processGuestConfirmationWork(firestore, new Date(1000), { limit: 999 });
    expect(collection.mock.calls).toEqual([['guest_confirmation_reconciliation_work']]);
    expect(query.where.mock.calls).toEqual([
      ['status', 'in', ['pending', 'blocked']],
      ['nextAttemptAtMs', '<=', 1000],
    ]);
    expect(query.limit).toHaveBeenCalledWith(25);
    expect(result).toMatchObject({
      workDocsRead: 0,
      subjectDocsRead: 0,
      paymentLookupReads: 0,
      workCandidatesSelected: 0,
      reconciled: 0,
      failed: 0,
    });
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });
});
