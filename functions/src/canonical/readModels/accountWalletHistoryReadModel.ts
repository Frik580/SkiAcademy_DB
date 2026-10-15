import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  documentMatchesReadScope,
  type CanonicalReadScope,
  type MonetaryEvent,
} from '@ski-academy/shared-domain';
import {
  AccountWalletOperationSchema,
  type AccountWalletOperation,
  type AccountWalletHistoryResult,
} from '@ski-academy/shared-domain';
import { parseMonetaryEvent } from '../finance/financeStore';

const PAGE_SIZE = 30;
const CursorSchema = z
  .object({
    accountId: z.string(),
    scope: z.string(),
    event: z.tuple([z.number().int(), z.number().int(), z.string()]).optional(),
    ledger: z.tuple([z.string(), z.string()]).optional(),
  })
  .strict();
type Cursor = z.infer<typeof CursorSchema>;

function eventType(event: MonetaryEvent): AccountWalletOperation['type'] {
  if (event.eventKind === 'refund_to_wallet') return 'refund';
  if (event.eventKind === 'wallet_credit')
    return event.sourceKind === 'system' ? 'starter_credit' : 'top_up';
  if (
    event.eventKind === 'correction' ||
    event.eventKind === 'wallet_adjustment' ||
    event.eventKind === 'admin_price_adjustment'
  )
    return 'admin_adjustment';
  if ((event.walletBalanceDelta ?? 0) < 0) {
    return event.eventKind === 'course_charge' || event.subjectType === 'course_enrollment'
      ? 'course_payment'
      : 'lesson_payment';
  }
  return event.reasonCode === 'starter_credit' ? 'starter_credit' : 'top_up';
}

/** Two bounded streams, merged BEFORE cutting the page. No payment/booking hydration. */
export async function queryAccountWalletHistory(
  firestore: Firestore,
  accountId: string,
  readScope: CanonicalReadScope,
  encodedCursor?: string
): Promise<AccountWalletHistoryResult> {
  const scope = JSON.stringify(readScope);
  let cursor: Cursor = { accountId, scope };
  if (encodedCursor) {
    try {
      cursor = CursorSchema.parse(
        JSON.parse(Buffer.from(encodedCursor, 'base64url').toString('utf8'))
      );
      if (cursor.accountId !== accountId || cursor.scope !== scope) throw new Error();
    } catch {
      throw new HttpsError('invalid-argument', 'The cursor is invalid for this account.');
    }
  }
  let events = firestore
    .collection('monetary_events')
    .where('walletAccountId', '==', accountId)
    .orderBy('occurredAt.seconds', 'desc')
    .orderBy('occurredAt.nanoseconds', 'desc')
    .orderBy('eventId', 'asc');
  let ledger = firestore
    .collection('wallet_ledger')
    .where('userId', '==', accountId)
    .orderBy('createdAt', 'desc')
    .orderBy(FieldPath.documentId(), 'desc');
  if (cursor.event) events = events.startAfter(...cursor.event);
  if (cursor.ledger) ledger = ledger.startAfter(...cursor.ledger);
  const [eventPage, ledgerPage] = await Promise.all([
    events.limit(PAGE_SIZE + 1).get(),
    ledger.limit(PAGE_SIZE + 1).get(),
  ]);
  type Candidate = {
    seconds: number;
    nanos: number;
    id: string;
    operation?: AccountWalletOperation;
    event?: Cursor['event'];
    ledger?: Cursor['ledger'];
  };
  const candidates: Candidate[] = eventPage.docs.map((doc) => {
    const raw = doc.data();
    const event = parseMonetaryEvent(raw);
    if (!event || event.eventId !== doc.id || event.walletAccountId !== accountId) {
      throw new Error('Wallet history event integrity failure.');
    }
    const { seconds, nanoseconds: nanos } = event.occurredAt;
    const visible = documentMatchesReadScope(readScope, raw) && !!event.walletBalanceDelta;
    return {
      seconds,
      nanos,
      id: `event:${doc.id}`,
      event: [seconds, nanos, doc.id],
      ...(visible
        ? {
            operation: {
              id: `event:${doc.id}`,
              amount: event.walletBalanceDelta!,
              currency: 'KZT' as const,
              createdAt: new Date(seconds * 1000 + nanos / 1e6).toISOString(),
              type: eventType(event),
              source: 'monetary_event' as const,
              ...(event.subjectType === 'booking' ? { bookingId: event.subjectId } : {}),
            },
          }
        : {}),
    };
  });
  // Legacy rows and canonical commands have separate persistence paths. Deduplicate
  // only explicit event references; amount/booking/status similarity is not proof.
  const linkedIds = [
    ...new Set(
      ledgerPage.docs.flatMap((doc) => {
        const raw = doc.data();
        return typeof raw.monetaryEventId === 'string' && /^[^/]{1,200}$/.test(raw.monetaryEventId)
          ? [raw.monetaryEventId]
          : [];
      })
    ),
  ];
  const linked = linkedIds.length
    ? await firestore.getAll(
        ...linkedIds.map((id) => firestore.collection('monetary_events').doc(id))
      )
    : [];
  const duplicateIds = new Set(
    linked.flatMap((doc) => {
      const event = parseMonetaryEvent(doc.data());
      return event &&
        event.walletAccountId === accountId &&
        event.walletBalanceDelta &&
        documentMatchesReadScope(readScope, doc.data())
        ? [doc.id]
        : [];
    })
  );
  for (const doc of ledgerPage.docs) {
    const raw = doc.data();
    const operation = AccountWalletOperationSchema.parse({
      id: `ledger:${doc.id}`,
      amount: raw.amount,
      currency: raw.currency ?? 'KZT',
      createdAt: raw.createdAt,
      type: raw.type,
      source: 'ledger',
      ...(raw.balanceAfter === undefined ? {} : { balanceAfter: raw.balanceAfter }),
      ...(raw.subjectName === undefined ? {} : { subjectName: raw.subjectName }),
      ...(raw.bookingId === undefined ? {} : { bookingId: raw.bookingId }),
    });
    if (raw.userId !== accountId) throw new Error('Wallet history ledger integrity failure.');
    const milliseconds = Date.parse(operation.createdAt);
    candidates.push({
      seconds: Math.floor(milliseconds / 1000),
      nanos: (milliseconds % 1000) * 1e6,
      id: operation.id,
      ledger: [raw.createdAt, doc.id],
      ...(documentMatchesReadScope(readScope, raw) && !duplicateIds.has(raw.monetaryEventId)
        ? { operation }
        : {}),
    });
  }
  const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  candidates.sort(
    (a, b) =>
      b.seconds - a.seconds ||
      b.nanos - a.nanos ||
      (a.ledger && b.ledger ? compareId(b.id, a.id) : compareId(a.id, b.id))
  );
  const page = candidates.slice(0, PAGE_SIZE);
  for (const item of page) {
    if (item.event) cursor.event = item.event;
    if (item.ledger) cursor.ledger = item.ledger;
  }
  return {
    operations: page.flatMap((item) => (item.operation ? [item.operation] : [])),
    ...(candidates.length > PAGE_SIZE
      ? {
          nextCursor: Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url'),
        }
      : {}),
  };
}
