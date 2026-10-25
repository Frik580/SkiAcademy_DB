import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountSchema,
  LIVE_CANONICAL_READ_SCOPE,
  MonetaryEventSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { queryAccountWalletHistory } from './accountWalletHistoryReadModel';
import { createQueryAccountWalletHistoryHandler } from './queryAccountWalletHistoryCallable';

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const accountId = 'account_wallet_history_integration';
let app: App;
let db: Firestore;
describeEmulator('account wallet history Firestore integration', () => {
  beforeAll(async () => {
    app = initializeApp({ projectId: 'demo-ski-school-e2e' }, 'wallet-history-integration');
    db = getFirestore(app);
    const at = timestampFromDate(new Date('2026-08-01T00:00:00Z'));
    await db.doc(`users/${accountId}`).set(
      AccountSchema.parse({
        accountId,
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit: {
          createdByCommandId: 'seed_history',
          lastChangedByCommandId: 'seed_history',
          correlationId: 'correlation_history',
        },
      })
    );
    const batch = db.batch();
    for (let i = 0; i < 65; i++) {
      const eventId = `event_history_${String(i).padStart(3, '0')}`;
      batch.set(
        db.doc(`monetary_events/${eventId}`),
        MonetaryEventSchema.parse({
          eventId,
          eventKind: i === 2 ? 'refund_to_wallet' : i % 2 ? 'booking_charge' : 'wallet_credit',
          currency: 'KZT',
          walletAccountId: i === 64 ? 'other_account' : accountId,
          walletBalanceDelta: i % 2 ? -500 : 1000,
          sourceKind: 'wallet',
          actor: { kind: 'account', accountId },
          commandId: `seed_history_${i}`,
          correlationId: 'correlation_history',
          occurredAt: at,
          recordedAt: at,
        })
      );
    }
    for (let i = 0; i < 36; i++) {
      batch.set(db.doc(`wallet_ledger/old_${i}`), {
        userId: accountId,
        amount: 25,
        balanceAfter: 50,
        type: 'top_up',
        createdAt: '2020-01-01T00:00:00.000Z',
      });
    }
    batch.set(db.doc('wallet_ledger/duplicate_refund'), {
      userId: accountId,
      amount: 1000,
      type: 'refund',
      monetaryEventId: 'event_history_002',
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    await batch.commit();
  });
  afterAll(async () => {
    if (app) await deleteApp(app);
  });
  it('reads all historical pages, excludes other accounts, and returns the same first page after reload', async () => {
    const first = await queryAccountWalletHistory(db, accountId, LIVE_CANONICAL_READ_SCOPE);
    const operations = [...first.operations];
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await queryAccountWalletHistory(
        db,
        accountId,
        LIVE_CANONICAL_READ_SCOPE,
        cursor
      );
      operations.push(...page.operations);
      cursor = page.nextCursor;
    }
    expect(operations).toHaveLength(100);
    expect(new Set(operations.map((r) => r.id)).size).toBe(100);
    expect(operations.filter((r) => r.type === 'refund')).toHaveLength(1);
    expect(operations.some((r) => r.id === 'event:event_history_064')).toBe(false);
    expect(operations.filter((r) => r.source === 'ledger')).toHaveLength(36);
    expect(await queryAccountWalletHistory(db, accountId, LIVE_CANONICAL_READ_SCOPE)).toEqual(
      first
    );
    const handler = createQueryAccountWalletHistoryHandler(db);
    expect(
      await handler({
        auth: { uid: accountId },
        data: { idempotencyKey: 'read:account_wallet:start:rs:live' },
      } as never)
    ).toEqual(first);
    await expect(
      handler({ auth: { uid: accountId }, data: { accountId: 'other_account' } } as never)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await db.doc(`users/${accountId}`).update({ 'lifecycle.status': 'disabled' });
    await expect(handler({ auth: { uid: accountId }, data: {} } as never)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
