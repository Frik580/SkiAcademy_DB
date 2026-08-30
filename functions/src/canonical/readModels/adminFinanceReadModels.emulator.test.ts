import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountSchema,
  AccountIdSchema,
  CorrelationIdSchema,
  MonetaryEventSchema,
  WalletSchema,
  monetaryEventIdFromCommandEffect,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { queryAdminFinanceReadModels } from './adminFinanceReadModels';

const PROJECT_ID = 'ski-academy-admin-finance-read-model-test';
const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);
const describeEmulator = runsOnFirestoreEmulator ? describe : describe.skip;
const accountId = AccountIdSchema.parse('account_admin_finance_emulator_01');
const correlationId = CorrelationIdSchema.parse('correlation_admin_finance_emulator_01');
const actor = { kind: 'administrator' as const, accountId };
const createdAt = timestampFromDate(new Date('2026-08-01T10:00:00.000Z'));

let app: App;
let firestore: Firestore;

describeEmulator('Admin finance read models', () => {
  beforeAll(async () => {
    app =
      getApps().find((candidate) => candidate.name === PROJECT_ID) ??
      initializeApp({ projectId: PROJECT_ID }, PROJECT_ID);
    firestore = getFirestore(app);
  });

  beforeEach(async () => {
    const eventSnapshot = await firestore.collection('monetary_events').get();
    await Promise.all(eventSnapshot.docs.map((document) => document.ref.delete()));
    await firestore.collection('users').doc(accountId).collection('wallet').doc('state').delete();
    await firestore.collection('users').doc(accountId).delete();

    const account = AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'command_admin_finance_emulator_seed',
        lastChangedByCommandId: 'command_admin_finance_emulator_seed',
        correlationId,
      },
    });
    const wallet = WalletSchema.parse({
      accountId,
      currency: 'KZT',
      balance: 90_000,
      revision: 3,
      eventRevision: 3,
      createdAt,
      updatedAt: createdAt,
    });
    await firestore
      .collection('users')
      .doc(accountId)
      .set({
        ...account,
        role: 'admin',
        displayName: 'Finance Admin',
        email: 'finance-admin@example.com',
      });
    await firestore
      .collection('users')
      .doc(accountId)
      .collection('wallet')
      .doc('state')
      .set(wallet);

    for (let index = 1; index <= 3; index += 1) {
      const commandId = `command_admin_finance_emulator_event_${index}`;
      const at = timestampFromDate(new Date(`2026-08-0${index}T10:00:00.000Z`));
      const event = MonetaryEventSchema.parse({
        eventId: monetaryEventIdFromCommandEffect(commandId, 0),
        eventKind: 'wallet_credit',
        currency: 'KZT',
        walletAccountId: accountId,
        walletBalanceDelta: index * 10_000,
        sourceKind: 'admin_adjustment',
        actor: { kind: 'account', accountId },
        commandId,
        correlationId,
        walletEventRevision: index,
        occurredAt: at,
        recordedAt: at,
      });
      await firestore.collection('monetary_events').doc(event.eventId).set(event);
    }
  });

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  it('reads Wallet state and stable MonetaryEvent pages from Firestore', async () => {
    const first = await queryAdminFinanceReadModels(firestore, actor, {
      scope: 'admin_wallet',
      accountId,
      pageSize: 2,
    });
    expect(first.scope).toBe('admin_wallet');
    if (first.scope !== 'admin_wallet') return;
    expect(first.item).toMatchObject({ balance: 90_000, revision: 3, hasMore: true });
    expect(first.item.events.map((event) => event.amount)).toEqual([30_000, 20_000]);

    const second = await queryAdminFinanceReadModels(firestore, actor, {
      scope: 'admin_wallet',
      accountId,
      pageSize: 2,
      cursor: first.item.nextCursor,
    });
    expect(second.scope).toBe('admin_wallet');
    if (second.scope !== 'admin_wallet') return;
    expect(second.item.events.map((event) => event.amount)).toEqual([10_000]);
    expect(second.item.hasMore).toBe(false);
  });
});
