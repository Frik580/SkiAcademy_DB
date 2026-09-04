import type { Firestore, Query } from 'firebase-admin/firestore';
import {
  ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_DEFAULT,
  ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_MAX,
  AggregateRevisionSchema,
  KztMinorUnitsSchema,
  QueryAdminFinanceReadModelsResultSchema,
  adminFinancialOverviewWindow,
  eventOccurredInFinancialOverviewWindow,
  financialOverviewTotalsFromMonetaryEffects,
  type AdminFinanceAccountIdentity,
  type AdminFinancialOverviewReadModel,
  type AdminMonetaryEventPresentation,
  type AdminPaymentAction,
  type AdminPaymentDetailReadModel,
  type AdminWalletReadModel,
  type MonetaryEvent,
  type Payment,
  type QueryAdminFinanceReadModelsInput,
  type QueryAdminFinanceReadModelsResult,
  type ReadModelAdministratorActor,
  type TimeInterval,
  type Wallet,
} from '@ski-academy/shared-domain';
import { parseAdminIssue } from '../adminIssues';
import {
  parseAccount,
  parseMonetaryEvent,
  parsePayment,
  parseWallet,
} from '../finance/financeStore';
import { buildAdminIssueDetail } from './adminIssueReadModels';
import {
  InvalidAdminGuestFundsReadCursorError,
  queryAdminGuestFundsReadModel,
} from './adminGuestFundsReadModels';

interface AdminFinanceEventCursor {
  readonly scope: QueryAdminFinanceReadModelsInput['scope'];
  readonly targetId: string;
  readonly occurredAtSeconds: number;
  readonly occurredAtNanoseconds: number;
  readonly eventId: string;
}

export class InvalidAdminFinanceReadCursorError extends Error {
  constructor() {
    super('The Admin finance cursor is invalid for this query.');
    this.name = 'InvalidAdminFinanceReadCursorError';
  }
}

function encodeCursor(cursor: AdminFinanceEventCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(encoded: string): AdminFinanceEventCursor | undefined {
  try {
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      (value.scope !== 'admin_wallet' &&
        value.scope !== 'admin_payment_detail' &&
        value.scope !== 'admin_school_movement') ||
      typeof value.targetId !== 'string' ||
      typeof value.occurredAtSeconds !== 'number' ||
      !Number.isInteger(value.occurredAtSeconds) ||
      typeof value.occurredAtNanoseconds !== 'number' ||
      !Number.isInteger(value.occurredAtNanoseconds) ||
      typeof value.eventId !== 'string'
    ) {
      return undefined;
    }
    return value as unknown as AdminFinanceEventCursor;
  } catch {
    return undefined;
  }
}

function safeAccountIdentity(
  accountId: Wallet['accountId'],
  data: Record<string, unknown> | undefined
): AdminFinanceAccountIdentity {
  const displayName =
    typeof data?.displayName === 'string' && data.displayName.trim()
      ? data.displayName.trim().slice(0, 200)
      : accountId;
  const email =
    typeof data?.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
      ? data.email.slice(0, 320)
      : undefined;
  return {
    accountId,
    displayName,
    ...(email === undefined ? {} : { email }),
  };
}

type AdminFinanceEventPageInput = Exclude<
  QueryAdminFinanceReadModelsInput,
  { scope: 'admin_financial_overview' } | { scope: 'admin_guest_funds' }
>;

function schoolMovementWindow(
  input: Extract<QueryAdminFinanceReadModelsInput, { scope: 'admin_school_movement' }>
): TimeInterval | undefined {
  if (!input.period || !input.localDate || !input.timeZone) return undefined;
  return adminFinancialOverviewWindow(input.localDate, input.period, input.timeZone);
}

function schoolMovementTargetId(
  input: Extract<QueryAdminFinanceReadModelsInput, { scope: 'admin_school_movement' }>
): string {
  const windowed = schoolMovementWindow(input);
  if (!windowed || !input.period || !input.localDate || !input.timeZone) return 'school';
  return `school:${input.period}:${input.localDate}:${input.timeZone}`;
}

function eventAmountAndDirection(
  event: MonetaryEvent,
  scope: AdminFinanceEventPageInput['scope']
): Pick<AdminMonetaryEventPresentation, 'amount' | 'direction'> {
  if (scope === 'admin_wallet' || (scope === 'admin_school_movement' && event.walletBalanceDelta !== undefined)) {
    const delta = event.walletBalanceDelta ?? 0;
    return {
      amount: KztMinorUnitsSchema.parse(Math.abs(delta)),
      direction: delta > 0 ? 'in' : delta < 0 ? 'out' : 'neutral',
    };
  }

  const effect = event.paymentEffect;
  const refunded = effect?.refundedAmountDelta ?? 0;
  if (refunded !== 0) {
    return {
      amount: KztMinorUnitsSchema.parse(Math.abs(refunded)),
      direction: refunded > 0 ? 'out' : 'in',
    };
  }
  const paid = effect?.paidAmountDelta ?? 0;
  if (paid !== 0) {
    return {
      amount: KztMinorUnitsSchema.parse(Math.abs(paid)),
      direction: paid > 0 ? 'in' : 'out',
    };
  }
  const settled = effect?.settledAmountDelta ?? 0;
  if (settled !== 0) {
    return {
      amount: KztMinorUnitsSchema.parse(Math.abs(settled)),
      direction: settled > 0 ? 'in' : 'out',
    };
  }
  const materialDelta =
    effect?.priceDelta ?? effect?.writtenOffAmountDelta ?? effect?.outstandingAmountDelta ?? 0;
  return {
    amount: KztMinorUnitsSchema.parse(Math.abs(materialDelta)),
    direction: 'neutral',
  };
}

function presentEvent(
  event: MonetaryEvent,
  scope: AdminFinanceEventPageInput['scope']
): AdminMonetaryEventPresentation {
  return {
    eventId: event.eventId,
    eventKind: event.eventKind,
    currency: event.currency,
    ...eventAmountAndDirection(event, scope),
    sourceKind: event.sourceKind,
    ...(event.paymentId === undefined ? {} : { paymentId: event.paymentId }),
    ...(event.subjectType === undefined ? {} : { subjectType: event.subjectType }),
    ...(event.subjectId === undefined ? {} : { subjectId: event.subjectId }),
    ...(event.walletAccountId === undefined ? {} : { walletAccountId: event.walletAccountId }),
    ...(event.walletBalanceDelta === undefined
      ? {}
      : { walletBalanceDelta: event.walletBalanceDelta }),
    ...(event.paymentEffect === undefined ? {} : { paymentEffect: event.paymentEffect }),
    ...(event.reasonCode === undefined ? {} : { reasonCode: event.reasonCode }),
    ...(event.providerKind === undefined ? {} : { providerKind: event.providerKind }),
    ...(event.providerTransactionRef === undefined
      ? {}
      : { providerTransactionRef: event.providerTransactionRef }),
    ...(event.manualReference === undefined ? {} : { manualReference: event.manualReference }),
    commandId: event.commandId,
    correlationId: event.correlationId,
    ...(event.causationId === undefined ? {} : { causationId: event.causationId }),
    ...(event.correctsEventId === undefined ? {} : { correctsEventId: event.correctsEventId }),
    occurredAt: event.occurredAt,
    recordedAt: event.recordedAt,
  };
}

async function queryEventPage(
  firestore: Firestore,
  input: AdminFinanceEventPageInput
): Promise<{
  readonly rawEvents: readonly MonetaryEvent[];
  readonly events: readonly AdminMonetaryEventPresentation[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
}> {
  const pageSize = Math.min(
    input.pageSize ?? ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_DEFAULT,
    ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_MAX
  );
  const movementWindow =
    input.scope === 'admin_school_movement' ? schoolMovementWindow(input) : undefined;
  const targetId =
    input.scope === 'admin_wallet'
      ? input.accountId
      : input.scope === 'admin_school_movement'
        ? schoolMovementTargetId(input)
        : input.paymentId;
  let query: Query = firestore
    .collection('monetary_events')
    .orderBy('occurredAt.seconds', 'desc')
    .orderBy('occurredAt.nanoseconds', 'desc')
    .orderBy('eventId', 'asc');
  if (input.scope === 'admin_wallet') {
    query = firestore
      .collection('monetary_events')
      .where('walletAccountId', '==', targetId)
      .orderBy('occurredAt.seconds', 'desc')
      .orderBy('occurredAt.nanoseconds', 'desc')
      .orderBy('eventId', 'asc');
  } else if (input.scope === 'admin_payment_detail') {
    query = firestore
      .collection('monetary_events')
      .where('paymentId', '==', targetId)
      .orderBy('occurredAt.seconds', 'desc')
      .orderBy('occurredAt.nanoseconds', 'desc')
      .orderBy('eventId', 'asc');
  } else if (movementWindow) {
    query = firestore
      .collection('monetary_events')
      .where('occurredAt.seconds', '>=', movementWindow.startsAt.seconds)
      .where('occurredAt.seconds', '<=', movementWindow.endsAt.seconds)
      .orderBy('occurredAt.seconds', 'desc')
      .orderBy('occurredAt.nanoseconds', 'desc')
      .orderBy('eventId', 'asc');
  }

  const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
  if (input.cursor && (!cursor || cursor.scope !== input.scope || cursor.targetId !== targetId)) {
    throw new InvalidAdminFinanceReadCursorError();
  }
  if (cursor) {
    query = query.startAfter(
      cursor.occurredAtSeconds,
      cursor.occurredAtNanoseconds,
      cursor.eventId
    );
  }

  const snapshot = await query.limit(pageSize + 1).get();
  const parsed = snapshot.docs.map((document) => {
    const event = parseMonetaryEvent(document.data() as Record<string, unknown>);
    if (!event || event.eventId !== document.id) {
      throw new Error(
        `Canonical Admin finance read integrity failure: monetary_events/${document.id}`
      );
    }
    return event;
  });
  const inWindow = movementWindow
    ? parsed.filter((event) => eventOccurredInFinancialOverviewWindow(event.occurredAt, movementWindow))
    : parsed;
  const page = inWindow.slice(0, pageSize);
  const hasMore = parsed.length > pageSize || inWindow.length > pageSize;
  const last = page[page.length - 1];
  return {
    rawEvents: page,
    events: page.map((event) => presentEvent(event, input.scope)),
    hasMore,
    ...(hasMore && last
      ? {
          nextCursor: encodeCursor({
            scope: input.scope,
            targetId,
            occurredAtSeconds: last.occurredAt.seconds,
            occurredAtNanoseconds: last.occurredAt.nanoseconds,
            eventId: last.eventId,
          }),
        }
      : {}),
  };
}

async function queryWalletReadModel(
  firestore: Firestore,
  input: Extract<QueryAdminFinanceReadModelsInput, { scope: 'admin_wallet' }>
): Promise<AdminWalletReadModel> {
  const [profileSnapshot, walletSnapshot, eventPage] = await Promise.all([
    firestore.collection('users').doc(input.accountId).get(),
    firestore.collection('users').doc(input.accountId).collection('wallet').doc('state').get(),
    queryEventPage(firestore, input),
  ]);
  const profileData = profileSnapshot.data() as Record<string, unknown> | undefined;
  const account = parseAccount(profileData);
  const wallet = walletSnapshot.exists
    ? parseWallet(walletSnapshot.data() as Record<string, unknown>)
    : undefined;
  if (walletSnapshot.exists && (!wallet || wallet.accountId !== input.accountId)) {
    throw new Error(
      `Canonical Admin finance read integrity failure: users/${input.accountId}/wallet/state`
    );
  }
  const accountActive = account?.lifecycle.status === 'active';
  return {
    accountId: input.accountId,
    accountIdentity: safeAccountIdentity(input.accountId, profileData),
    accountStatus: accountActive ? 'active' : 'unavailable',
    exists: wallet !== undefined,
    balance: wallet?.balance ?? KztMinorUnitsSchema.parse(0),
    currency: 'KZT',
    revision: wallet?.revision ?? AggregateRevisionSchema.parse(0),
    eventRevision: wallet?.eventRevision ?? AggregateRevisionSchema.parse(0),
    ...(wallet?.updatedAt === undefined ? {} : { updatedAt: wallet.updatedAt }),
    allowedActions: accountActive
      ? [
          {
            kind: 'record_manual_wallet_funding',
            ...(wallet === undefined ? {} : { expectedWalletRevision: wallet.revision }),
          },
        ]
      : [],
    events: [...eventPage.events],
    hasMore: eventPage.hasMore,
    ...(eventPage.nextCursor === undefined ? {} : { nextCursor: eventPage.nextCursor }),
  };
}

async function loadRelatedIssues(
  firestore: Firestore,
  actor: ReadModelAdministratorActor,
  payment: Payment
) {
  const subjectField =
    payment.subjectType === 'booking' ? 'subjectRef.bookingId' : 'subjectRef.enrollmentId';
  const snapshot = await firestore
    .collection('admin_issues')
    .where(subjectField, '==', payment.subjectId)
    .limit(50)
    .get();
  const issues = snapshot.docs.map((document) => {
    const issue = parseAdminIssue(document.data() as Record<string, unknown>);
    if (!issue || issue.issueId !== document.id) {
      throw new Error(
        `Canonical Admin finance read integrity failure: admin_issues/${document.id}`
      );
    }
    return issue;
  });

  const details = await Promise.all(
    issues.map(async (issue) => ({
      issue,
      detail:
        issue.lifecycle.status === 'open'
          ? await buildAdminIssueDetail(firestore, actor, issue)
          : undefined,
    }))
  );
  return details
    .map(({ issue, detail }) => ({
      issue,
      financeActionAvailable:
        detail?.authorizedActions.actions.some((action) => action.kind === 'correct_finance') ??
        false,
    }))
    .sort((left, right) => {
      const seconds = right.issue.updatedAt.seconds - left.issue.updatedAt.seconds;
      return seconds !== 0
        ? seconds
        : right.issue.updatedAt.nanoseconds - left.issue.updatedAt.nanoseconds;
    });
}

function buildPaymentActions(input: {
  readonly payment: Payment;
  readonly relatedIssues: Awaited<ReturnType<typeof loadRelatedIssues>>;
  readonly wallet?: Wallet;
}): AdminPaymentAction[] {
  const actions: AdminPaymentAction[] = [];
  for (const related of input.relatedIssues) {
    if (!related.financeActionAvailable) continue;
    const base = {
      adminIssueId: related.issue.issueId,
      expectedAdminIssueRevision: related.issue.revision,
      expectedPaymentRevision: input.payment.revision,
      requiresReason: true as const,
    };
    if (
      input.payment.retainedAmount > 0 &&
      (input.payment.payerAccountId === undefined || input.wallet !== undefined)
    ) {
      actions.push({
        ...base,
        kind: 'admin_refund',
        maximumAmount: input.payment.retainedAmount,
        ...(input.wallet === undefined
          ? {}
          : {
              walletAccountId: input.wallet.accountId,
              expectedWalletRevision: input.wallet.revision,
            }),
      });
    }
    if (input.payment.outstandingAmount > 0) {
      actions.push({
        ...base,
        kind: 'write_off',
        maximumAmount: input.payment.outstandingAmount,
      });
    }
    if (input.payment.writtenOffAmount > 0) {
      actions.push({
        ...base,
        kind: 'reverse_write_off',
        maximumAmount: input.payment.writtenOffAmount,
      });
    }
    if (related.issue.kind === 'financial_reconciliation_mismatch') {
      actions.push({ ...base, kind: 'rebuild_payment_projection' });
    }
  }
  return actions.slice(0, 16);
}

async function queryPaymentDetailReadModel(
  firestore: Firestore,
  actor: ReadModelAdministratorActor,
  input: Extract<QueryAdminFinanceReadModelsInput, { scope: 'admin_payment_detail' }>
): Promise<AdminPaymentDetailReadModel | undefined> {
  const paymentSnapshot = await firestore.collection('payments').doc(input.paymentId).get();
  if (!paymentSnapshot.exists) return undefined;
  const payment = parsePayment(paymentSnapshot.data() as Record<string, unknown>);
  if (!payment || payment.paymentId !== input.paymentId) {
    throw new Error(`Canonical Admin finance read integrity failure: payments/${input.paymentId}`);
  }

  const [eventPage, payerSnapshot, walletSnapshot, relatedIssues] = await Promise.all([
    queryEventPage(firestore, input),
    payment.payerAccountId
      ? firestore.collection('users').doc(payment.payerAccountId).get()
      : Promise.resolve(undefined),
    payment.payerAccountId
      ? firestore
          .collection('users')
          .doc(payment.payerAccountId)
          .collection('wallet')
          .doc('state')
          .get()
      : Promise.resolve(undefined),
    loadRelatedIssues(firestore, actor, payment),
  ]);
  const wallet = walletSnapshot?.exists
    ? parseWallet(walletSnapshot.data() as Record<string, unknown>)
    : undefined;
  if (walletSnapshot?.exists && (!wallet || wallet.accountId !== payment.payerAccountId)) {
    throw new Error(
      `Canonical Admin finance read integrity failure: users/${payment.payerAccountId}/wallet/state`
    );
  }
  const providerEvent = eventPage.rawEvents.find(
    (event) => event.sourceKind === 'provider' || event.providerKind !== undefined
  );
  const result: AdminPaymentDetailReadModel = {
    paymentId: payment.paymentId,
    subjectType: payment.subjectType,
    subjectId: payment.subjectId,
    ...(payment.payerAccountId === undefined
      ? {}
      : {
          payer: safeAccountIdentity(
            payment.payerAccountId,
            payerSnapshot?.data() as Record<string, unknown> | undefined
          ),
        }),
    currency: payment.currency,
    originalPrice: payment.originalPrice,
    price: payment.price,
    paidAmount: payment.paidAmount,
    refundedAmount: payment.refundedAmount,
    retainedAmount: payment.retainedAmount,
    settledAmount: payment.settledAmount,
    writtenOffAmount: payment.writtenOffAmount,
    outstandingAmount: payment.outstandingAmount,
    paymentStatus: payment.paymentStatus,
    revision: payment.revision,
    eventRevision: payment.eventRevision,
    ...(providerEvent === undefined
      ? {}
      : {
          providerState: {
            ...(providerEvent.providerKind === undefined
              ? {}
              : { providerKind: providerEvent.providerKind }),
            ...(providerEvent.providerTransactionRef === undefined
              ? {}
              : { providerTransactionRef: providerEvent.providerTransactionRef }),
            latestEventId: providerEvent.eventId,
            recordedAt: providerEvent.recordedAt,
          },
        }),
    relatedIssues: relatedIssues.map(({ issue, financeActionAvailable }) => ({
      issueId: issue.issueId,
      kind: issue.kind,
      lifecycleStatus: issue.lifecycle.status,
      revision: issue.revision,
      financeActionAvailable,
    })),
    allowedActions: buildPaymentActions({ payment, relatedIssues, wallet }),
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    events: [...eventPage.events],
    hasMore: eventPage.hasMore,
    ...(eventPage.nextCursor === undefined ? {} : { nextCursor: eventPage.nextCursor }),
  };
  return result;
}

async function queryFinancialOverviewReadModel(
  firestore: Firestore,
  input: Extract<QueryAdminFinanceReadModelsInput, { scope: 'admin_financial_overview' }>
): Promise<AdminFinancialOverviewReadModel> {
  const window = adminFinancialOverviewWindow(input.localDate, input.period, input.timeZone);
  const pageSize = 200;
  const scanCap = 5_000;
  const events: MonetaryEvent[] = [];
  let truncated = false;
  let query: Query = firestore
    .collection('monetary_events')
    .where('occurredAt.seconds', '>=', window.startsAt.seconds)
    .where('occurredAt.seconds', '<=', window.endsAt.seconds)
    .orderBy('occurredAt.seconds', 'desc')
    .orderBy('occurredAt.nanoseconds', 'desc')
    .orderBy('eventId', 'asc');

  for (;;) {
    const snapshot = await query.limit(pageSize).get();
    for (const document of snapshot.docs) {
      const event = parseMonetaryEvent(document.data() as Record<string, unknown>);
      if (!event || event.eventId !== document.id) {
        throw new Error(
          `Canonical Admin finance read integrity failure: monetary_events/${document.id}`
        );
      }
      events.push(event);
    }
    if (snapshot.docs.length < pageSize) break;
    if (events.length >= scanCap) {
      truncated = true;
      break;
    }
    const lastEvent = events[events.length - 1];
    if (!lastEvent) break;
    query = firestore
      .collection('monetary_events')
      .where('occurredAt.seconds', '>=', window.startsAt.seconds)
      .where('occurredAt.seconds', '<=', window.endsAt.seconds)
      .orderBy('occurredAt.seconds', 'desc')
      .orderBy('occurredAt.nanoseconds', 'desc')
      .orderBy('eventId', 'asc')
      .startAfter(
        lastEvent.occurredAt.seconds,
        lastEvent.occurredAt.nanoseconds,
        lastEvent.eventId
      );
  }

  const totals = financialOverviewTotalsFromMonetaryEffects(events, window);
  return {
    currency: 'KZT',
    period: input.period,
    localDate: input.localDate,
    timeZone: input.timeZone,
    window,
    settledRevenueKzt: totals.settledRevenueKzt,
    refundedKzt: totals.refundedKzt,
    netSettledKzt: totals.netSettledKzt,
    truncated,
  };
}

export async function queryAdminFinanceReadModels(
  firestore: Firestore,
  actor: ReadModelAdministratorActor,
  input: QueryAdminFinanceReadModelsInput
): Promise<QueryAdminFinanceReadModelsResult> {
  let result: QueryAdminFinanceReadModelsResult;
  if (input.scope === 'admin_wallet') {
    result = { scope: input.scope, item: await queryWalletReadModel(firestore, input) };
  } else if (input.scope === 'admin_school_movement') {
    const eventPage = await queryEventPage(firestore, input);
    result = {
      scope: input.scope,
      item: {
        currency: 'KZT',
        events: [...eventPage.events],
        hasMore: eventPage.hasMore,
        ...(eventPage.nextCursor === undefined ? {} : { nextCursor: eventPage.nextCursor }),
      },
    };
  } else if (input.scope === 'admin_financial_overview') {
    result = {
      scope: input.scope,
      item: await queryFinancialOverviewReadModel(firestore, input),
    };
  } else if (input.scope === 'admin_guest_funds') {
    try {
      result = {
        scope: input.scope,
        item: await queryAdminGuestFundsReadModel(firestore, input),
      };
    } catch (error) {
      if (error instanceof InvalidAdminGuestFundsReadCursorError) {
        throw new InvalidAdminFinanceReadCursorError();
      }
      throw error;
    }
  } else {
    const item = await queryPaymentDetailReadModel(firestore, actor, input);
    result = {
      scope: input.scope,
      ...(item === undefined ? {} : { item }),
    };
  }
  return QueryAdminFinanceReadModelsResultSchema.parse(result);
}
