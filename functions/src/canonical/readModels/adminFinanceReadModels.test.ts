import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountSchema,
  CorrelationIdSchema,
  MonetaryEventSchema,
  PaymentSchema,
  WalletSchema,
  monetaryEventIdFromCommandEffect,
  timestampFromDate,
  type MonetaryEvent,
} from '@ski-academy/shared-domain';
import { queryAdminFinanceReadModels } from './adminFinanceReadModels';

const accountId = 'account_admin_finance_read_01';
const paymentId = 'payment_admin_finance_read_01';
const correlationId = CorrelationIdSchema.parse('correlation_admin_finance_read_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

const account = AccountSchema.parse({
  accountId,
  lifecycle: { status: 'active' },
  revision: 1,
  createdAt,
  updatedAt: createdAt,
  audit: {
    createdByCommandId: 'command_admin_finance_account_seed',
    lastChangedByCommandId: 'command_admin_finance_account_seed',
    correlationId,
  },
});

const wallet = WalletSchema.parse({
  accountId,
  currency: 'KZT',
  balance: 123_45,
  revision: 3,
  eventRevision: 3,
  createdAt,
  updatedAt: createdAt,
});

const payment = PaymentSchema.parse({
  paymentId,
  subjectType: 'booking',
  subjectId: 'booking_admin_finance_read_01',
  currency: 'KZT',
  originalPrice: 150_000,
  price: 120_000,
  paidAmount: 70_000,
  refundedAmount: 10_000,
  retainedAmount: 60_000,
  settledAmount: 60_000,
  writtenOffAmount: 20_000,
  outstandingAmount: 40_000,
  paymentStatus: 'partially_refunded',
  payerAccountId: accountId,
  incrementalRequirements: [],
  revision: 4,
  eventRevision: 3,
  createdAt,
  updatedAt: createdAt,
});

function walletEvent(index: number, amount: number): MonetaryEvent {
  const commandId = `command_admin_finance_event_${index}`;
  const at = timestampFromDate(new Date(`2026-01-0${index}T00:00:00.000Z`));
  return MonetaryEventSchema.parse({
    eventId: monetaryEventIdFromCommandEffect(commandId, 0),
    eventKind: 'wallet_credit',
    currency: 'KZT',
    walletAccountId: accountId,
    walletBalanceDelta: amount,
    sourceKind: 'admin_adjustment',
    actor: { kind: 'account', accountId },
    commandId,
    correlationId,
    walletEventRevision: index,
    occurredAt: at,
    recordedAt: at,
  });
}

interface FakeDocument {
  readonly id: string;
  readonly data: Record<string, unknown>;
}

function createQuery(documents: readonly FakeDocument[]) {
  let selected = [...documents];
  let after: readonly unknown[] | undefined;
  let queryLimit = Number.MAX_SAFE_INTEGER;
  const query = {
    where: (field: string, _operator: string, value: unknown) => {
      selected = selected.filter((document) => document.data[field] === value);
      return query;
    },
    orderBy: () => query,
    startAfter: (...values: readonly unknown[]) => {
      after = values;
      return query;
    },
    limit: (value: number) => {
      queryLimit = value;
      return query;
    },
    get: async () => {
      selected.sort((left, right) => {
        const leftAt = left.data.occurredAt as { seconds: number; nanoseconds: number } | undefined;
        const rightAt = right.data.occurredAt as
          { seconds: number; nanoseconds: number } | undefined;
        if (!leftAt || !rightAt) return 0;
        return rightAt.seconds - leftAt.seconds || rightAt.nanoseconds - leftAt.nanoseconds;
      });
      if (after) {
        const [seconds, nanoseconds, eventId] = after;
        selected = selected.filter((document) => {
          const occurredAt = document.data.occurredAt as {
            seconds: number;
            nanoseconds: number;
          };
          return (
            occurredAt.seconds < seconds! ||
            (occurredAt.seconds === seconds && occurredAt.nanoseconds < nanoseconds!) ||
            (occurredAt.seconds === seconds &&
              occurredAt.nanoseconds === nanoseconds &&
              document.id > eventId!)
          );
        });
      }
      return {
        docs: selected.slice(0, queryLimit).map((document) => ({
          id: document.id,
          data: () => document.data,
        })),
      };
    },
  };
  return query;
}

function createFirestore(events: readonly MonetaryEvent[]): Firestore {
  const userData = { ...account, displayName: 'Ada Skier', email: 'ada@example.com' };
  return {
    collection: (name: string) => {
      if (name === 'users') {
        return {
          doc: () => ({
            get: async () => ({ exists: true, data: () => userData }),
            collection: () => ({
              doc: () => ({
                get: async () => ({ exists: true, data: () => wallet }),
              }),
            }),
          }),
        };
      }
      if (name === 'payments') {
        return {
          doc: () => ({
            get: async () => ({ exists: true, data: () => payment }),
          }),
        };
      }
      if (name === 'monetary_events') {
        return createQuery(events.map((event) => ({ id: event.eventId, data: event })));
      }
      if (name === 'admin_issues') return createQuery([]);
      throw new Error(`Unexpected collection: ${name}`);
    },
  } as unknown as Firestore;
}

const actor = { kind: 'administrator' as const, accountId: account.accountId };

describe('Admin canonical finance read models', () => {
  it('returns the authoritative Wallet and display-safe Account identity', async () => {
    const result = await queryAdminFinanceReadModels(
      createFirestore([walletEvent(1, 5_000)]),
      actor,
      {
        scope: 'admin_wallet',
        accountId: account.accountId,
      }
    );

    expect(result.scope).toBe('admin_wallet');
    if (result.scope !== 'admin_wallet') return;
    expect(result.item).toMatchObject({
      balance: 123_45,
      currency: 'KZT',
      revision: 3,
      accountStatus: 'active',
      accountIdentity: { displayName: 'Ada Skier', email: 'ada@example.com' },
      allowedActions: [{ kind: 'record_manual_wallet_funding', expectedWalletRevision: 3 }],
    });
    expect(result.item.events[0]).toMatchObject({ amount: 5_000, direction: 'in' });
  });

  it('maps Payment accounting amounts without frontend reconstruction', async () => {
    const result = await queryAdminFinanceReadModels(createFirestore([]), actor, {
      scope: 'admin_payment_detail',
      paymentId: payment.paymentId,
    });

    expect(result.scope).toBe('admin_payment_detail');
    if (result.scope !== 'admin_payment_detail') return;
    expect(result.item).toMatchObject({
      originalPrice: 150_000,
      price: 120_000,
      paidAmount: 70_000,
      refundedAmount: 10_000,
      retainedAmount: 60_000,
      settledAmount: 60_000,
      writtenOffAmount: 20_000,
      outstandingAmount: 40_000,
      paymentStatus: 'partially_refunded',
      allowedActions: [],
    });
  });

  it('paginates MonetaryEvents with a stable server cursor and no duplicate', async () => {
    const firestore = createFirestore([
      walletEvent(1, 1_000),
      walletEvent(2, 2_000),
      walletEvent(3, 3_000),
    ]);
    const first = await queryAdminFinanceReadModels(firestore, actor, {
      scope: 'admin_wallet',
      accountId: account.accountId,
      pageSize: 2,
    });
    expect(first.scope).toBe('admin_wallet');
    if (first.scope !== 'admin_wallet') return;
    expect(first.item.events.map((event) => event.amount)).toEqual([3_000, 2_000]);
    expect(first.item.hasMore).toBe(true);

    const second = await queryAdminFinanceReadModels(firestore, actor, {
      scope: 'admin_wallet',
      accountId: account.accountId,
      pageSize: 2,
      cursor: first.item.nextCursor,
    });
    expect(second.scope).toBe('admin_wallet');
    if (second.scope !== 'admin_wallet') return;
    expect(second.item.events.map((event) => event.amount)).toEqual([1_000]);
    expect(second.item.hasMore).toBe(false);
  });
});
