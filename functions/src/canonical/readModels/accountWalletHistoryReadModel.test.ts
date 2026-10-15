import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  LIVE_CANONICAL_READ_SCOPE,
  MonetaryEventSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { queryAccountWalletHistory } from './accountWalletHistoryReadModel';
import { createQueryAccountWalletHistoryHandler } from './queryAccountWalletHistoryCallable';

export const accountId = 'wallet_history_owner';
export function historyEvent(index: number, delta = 10000, extra: Record<string, unknown> = {}) {
  const at = timestampFromDate(new Date('2026-08-01T00:00:00Z'));
  return MonetaryEventSchema.parse({
    eventId: `event_history_${String(index).padStart(3, '0')}`,
    eventKind: delta > 0 ? 'wallet_credit' : 'booking_charge',
    currency: 'KZT',
    walletAccountId: accountId,
    walletBalanceDelta: delta,
    sourceKind: 'wallet',
    actor: { kind: 'account', accountId },
    commandId: `command_history_${index}`,
    correlationId: 'correlation_history',
    occurredAt: at,
    recordedAt: at,
    ...extra,
  });
}

function fakeFirestore(
  eventRows: ReturnType<typeof historyEvent>[],
  legacy: Record<string, unknown>[] = []
) {
  const bounds: number[] = [];
  const filters: unknown[][] = [];
  const data: Record<string, Record<string, unknown>[]> = {
    monetary_events: eventRows,
    wallet_ledger: legacy,
  };
  const docId = (row: Record<string, unknown>) => String(row.eventId ?? row.id);
  const field = (row: Record<string, unknown>, path: string): unknown =>
    path === '__name__' ? docId(row) : path.split('.').reduce((v: any, key) => v?.[key], row);
  const snapshot = (row: Record<string, unknown>) => ({ id: docId(row), data: () => row });
  const db = {
    collection(name: string) {
      let rows = [...(data[name] ?? [])];
      let orders: [string, string][] = [];
      let after: unknown[] | undefined;
      let bound = 0;
      const compare = (a: unknown[], b: unknown[]) => {
        for (let i = 0; i < orders.length; i++) {
          const cmp = a[i]! < b[i]! ? -1 : a[i]! > b[i]! ? 1 : 0;
          if (cmp) return orders[i][1] === 'desc' ? -cmp : cmp;
        }
        return 0;
      };
      const query = {
        where(key: string, op: string, value: unknown) {
          filters.push([name, key, op, value]);
          rows = rows.filter((r) => field(r, key) === value);
          return query;
        },
        orderBy(key: any, direction: string) {
          orders.push([typeof key === 'string' ? key : '__name__', direction]);
          return query;
        },
        startAfter(...values: unknown[]) {
          after = values;
          return query;
        },
        limit(value: number) {
          bounds.push(value);
          bound = value;
          return query;
        },
        async get() {
          const values = (r: Record<string, unknown>) => orders.map(([key]) => field(r, key));
          return {
            docs: rows
              .sort((a, b) => compare(values(a), values(b)))
              .filter((r) => !after || compare(values(r), after) > 0)
              .slice(0, bound)
              .map(snapshot),
          };
        },
        doc(id: string) {
          return { name, id };
        },
      };
      return query;
    },
    async getAll(...refs: { name: string; id: string }[]) {
      return refs.map((ref) => {
        const row = data[ref.name].find((r) => docId(r) === ref.id);
        return { id: ref.id, data: () => row };
      });
    },
  } as unknown as Firestore;
  return { db, bounds, filters };
}

describe('account wallet history read model', () => {
  it('uses wallet deltas once, includes all operation types and preserves legacy balances/currency', async () => {
    const refund = historyEvent(3, 5000, { eventKind: 'refund_to_wallet' });
    const { db, bounds, filters } = fakeFirestore(
      [
        historyEvent(1),
        historyEvent(2, -5000),
        refund,
        historyEvent(4, -4000, {
          subjectType: 'course_enrollment',
          subjectId: 'enrollment_history',
        }),
        historyEvent(5, -1000, { eventKind: 'correction' }),
        historyEvent(6, 0),
        historyEvent(7, 99999, { walletAccountId: 'other_account' }),
      ],
      [
        {
          id: 'old',
          userId: accountId,
          amount: 12,
          balanceAfter: 42,
          type: 'top_up',
          currency: 'USD',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
        {
          id: 'duplicate_refund',
          userId: accountId,
          amount: 5000,
          type: 'refund',
          monetaryEventId: refund.eventId,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ]
    );
    const result = await queryAccountWalletHistory(db, accountId, LIVE_CANONICAL_READ_SCOPE);
    expect(result.operations.map((r) => r.type)).toEqual([
      'top_up',
      'lesson_payment',
      'refund',
      'course_payment',
      'admin_adjustment',
      'top_up',
    ]);
    expect(result.operations.filter((r) => r.type === 'refund')).toHaveLength(1);
    expect(result.operations.at(-1)).toMatchObject({
      currency: 'USD',
      amount: 12,
      balanceAfter: 42,
    });
    expect(result.operations[0]).not.toHaveProperty('balanceAfter');
    expect(bounds).toEqual([31, 31]);
    expect(filters).toEqual([
      ['monetary_events', 'walletAccountId', '==', accountId],
      ['wallet_ledger', 'userId', '==', accountId],
    ]);
  });

  it('paginates both streams with stable ties and does not skip or repeat old rows', async () => {
    const events = Array.from({ length: 45 }, (_, i) => historyEvent(i));
    const legacy = Array.from({ length: 40 }, (_, i) => ({
      id: `old_${i}`,
      userId: accountId,
      amount: 1,
      type: 'top_up',
      createdAt: '2026-08-01T00:00:00.000Z',
    }));
    const { db, bounds } = fakeFirestore(events, legacy);
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await queryAccountWalletHistory(
        db,
        accountId,
        LIVE_CANONICAL_READ_SCOPE,
        cursor
      );
      ids.push(...page.operations.map((r) => r.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toHaveLength(85);
    expect(new Set(ids).size).toBe(85);
    expect(bounds.every((b) => b === 31)).toBe(true);
  });

  it('rejects another account cursor and malformed cursors', async () => {
    const { db } = fakeFirestore(Array.from({ length: 35 }, (_, i) => historyEvent(i)));
    const first = await queryAccountWalletHistory(db, accountId, LIVE_CANONICAL_READ_SCOPE);
    await expect(
      queryAccountWalletHistory(db, 'other', LIVE_CANONICAL_READ_SCOPE, first.nextCursor)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      queryAccountWalletHistory(db, accountId, LIVE_CANONICAL_READ_SCOPE, 'bad')
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('classifies price changes and adjustments without inventing service payments', async () => {
    const { db } = fakeFirestore([
      historyEvent(1, -400, { eventKind: 'admin_price_adjustment' }),
      historyEvent(2, 400, { eventKind: 'admin_price_adjustment' }),
      historyEvent(3, -200, { eventKind: 'wallet_adjustment' }),
    ]);
    const page = await queryAccountWalletHistory(db, accountId, LIVE_CANONICAL_READ_SCOPE);
    expect(page.operations.map((r) => r.type)).toEqual([
      'admin_adjustment',
      'admin_adjustment',
      'admin_adjustment',
    ]);
    expect(page.operations.map((r) => r.amount)).toEqual([-400, 400, -200]);
  });

  it('advances over hidden scope rows with a bounded page, including an empty visible page', async () => {
    const { db, bounds } = fakeFirestore(
      Array.from({ length: 35 }, (_, i) =>
        historyEvent(i, 100, {
          dataScope: 'test',
          testSessionId: 'test_session_wallet_history',
        })
      )
    );
    const first = await queryAccountWalletHistory(db, accountId, LIVE_CANONICAL_READ_SCOPE);
    expect(first.operations).toEqual([]);
    expect(first.nextCursor).toBeTruthy();
    const second = await queryAccountWalletHistory(
      db,
      accountId,
      LIVE_CANONICAL_READ_SCOPE,
      first.nextCursor
    );
    expect(second.operations).toEqual([]);
    expect(second.nextCursor).toBeUndefined();
    expect(bounds).toEqual([31, 31, 31, 31]);
  });

  it('rejects unauthenticated access and caller-supplied account identity before reading', async () => {
    const handler = createQueryAccountWalletHistoryHandler({} as Firestore);
    await expect(handler({ data: {} } as never)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      handler({ auth: { uid: accountId }, data: { accountId: 'victim' } } as never)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
