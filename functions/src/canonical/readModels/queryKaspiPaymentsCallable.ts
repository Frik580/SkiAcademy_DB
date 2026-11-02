import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  KASPI_CONFIGURATION_PATH,
  KaspiRequestIdSchema,
  KaspiRequestStatusSchema,
  CanonicalTimestampSchema,
  readEnabledKaspiConfiguration,
  KaspiConfigurationSchema,
  AggregateRevisionSchema,
  normalizeFirestoreDocument,
  timestampFromDate,
  kaspiRequestExpired,
  type KaspiPaymentRequest,
} from '@ski-academy/shared-domain';
import { readGuestActionTokenSecret } from '../commands/canonicalCommandRuntime';
import {
  kaspiRequestPath,
  parseKaspiRequest,
  verifyKaspiGuestCredential,
} from '../finance/kaspiPaymentStore';
import { parseAccount, parsePayment } from '../finance/financeStore';
import { parseBooking } from '../bookings/bookingStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import { resolveAdministratorCanonicalRead } from './resolveAdministratorCanonicalRead';

const InputSchema = z
  .object({
    idempotencyKey: z.string().min(1).max(256).optional(),
    scope: z.enum(['configuration', 'admin_configuration', 'mine', 'guest', 'admin', 'history']),
    requestId: KaspiRequestIdSchema.optional(),
    status: KaspiRequestStatusSchema.optional(),
    cursor: z.string().max(128).optional(),
    type: z.enum(['guest_booking_payment', 'guest_course_payment']).optional(),
    subjectId: z.string().min(1).max(128).optional(),
    nonce: z.string().min(1).max(64).optional(),
    signature: z.string().max(128).optional(),
    expiresAt: CanonicalTimestampSchema.optional(),
  })
  .strict();

export function publicKaspiRequest(
  request: KaspiPaymentRequest,
  now = timestampFromDate(new Date())
) {
  return {
    requestId: request.requestId,
    type: request.type,
    amount: request.amount,
    currency: request.currency,
    status:
      request.status === 'awaiting_payment' && kaspiRequestExpired(request, now)
        ? ('expired' as const)
        : request.status,
    revision: request.revision,
    merchantKey: request.merchantKey,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    ...(request.subjectId ? { subjectId: request.subjectId } : {}),
    ...(request.claimedAt ? { claimedAt: request.claimedAt } : {}),
  };
}

export function createQueryKaspiPaymentsHandler(
  firestore: Firestore,
  secret = readGuestActionTokenSecret()
) {
  return async (call: CallableRequest<unknown>) => {
    const parsed = InputSchema.safeParse(call.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid payment query.');
    const input = parsed.data;
    if (input.scope === 'admin_configuration') {
      const { readScope } = await resolveAdministratorCanonicalRead(firestore, call.auth?.uid);
      if (readScope.dataScope !== 'live')
        throw new HttpsError(
          'failed-precondition',
          'Manual payments are not available in test sessions.'
        );
      const data = normalizeFirestoreDocument(
        (await firestore.doc(KASPI_CONFIGURATION_PATH).get()).data()
      );
      const revision = AggregateRevisionSchema.safeParse(data?.revision ?? 0);
      if (!revision.success)
        throw new HttpsError('failed-precondition', 'Invalid configuration revision.');
      return {
        enabled: data?.enabled === true,
        revision: revision.data,
        ready: KaspiConfigurationSchema.safeParse({ ...data, enabled: true }).success,
        ...(typeof data?.merchantName === 'string' ? { merchantName: data.merchantName } : {}),
        ...(typeof data?.merchantKey === 'string' ? { merchantKey: data.merchantKey } : {}),
        ...(KaspiConfigurationSchema.shape.qrImageUrl.safeParse(data?.qrImageUrl).success
          ? { qrImageUrl: data?.qrImageUrl }
          : {}),
        ...(typeof data?.qrStoragePath === 'string' ? { qrStoragePath: data.qrStoragePath } : {}),
        ...(typeof data?.walletRequestTtlSeconds === 'number'
          ? { walletRequestTtlSeconds: data.walletRequestTtlSeconds }
          : {}),
        ...(data?.qrVerifiedAt ? { qrVerifiedAt: data.qrVerifiedAt } : {}),
        ...(typeof data?.qrVerifiedBy === 'string' ? { qrVerifiedBy: data.qrVerifiedBy } : {}),
      };
    }
    if (input.scope === 'configuration') {
      const snapshot = await firestore.doc(KASPI_CONFIGURATION_PATH).get();
      const config = readEnabledKaspiConfiguration(normalizeFirestoreDocument(snapshot.data()));
      return config
        ? {
            enabled: true,
            qrImageUrl: config.qrImageUrl,
            merchantName: config.merchantName,
            merchantKey: config.merchantKey,
          }
        : { enabled: false };
    }
    if (input.scope === 'guest') {
      if (
        !input.type ||
        !input.subjectId ||
        !input.nonce ||
        !input.signature ||
        !input.expiresAt ||
        !verifyKaspiGuestCredential({
          type: input.type,
          subjectId: input.subjectId,
          nonce: input.nonce,
          signature: input.signature,
          expiresAt: input.expiresAt,
          now: timestampFromDate(new Date()),
          secret,
        })
      )
        throw new HttpsError('permission-denied', 'Payment access denied.');
      const subjectSnapshot = await firestore
        .doc(
          `${input.type === 'guest_booking_payment' ? 'bookings' : 'course_enrollments'}/${input.subjectId}`
        )
        .get();
      const subject =
        input.type === 'guest_booking_payment'
          ? parseBooking(subjectSnapshot.data())
          : parseCourseEnrollment(subjectSnapshot.data());
      if (!subject || subject.attribution.bookingOrigin !== 'guest')
        throw new HttpsError('permission-denied', 'Payment access denied.');
      const paymentSnapshot = await firestore.doc(`payments/${subject.paymentId}`).get();
      const payment = parsePayment(paymentSnapshot.data());
      if (!payment?.manualPaymentRequestId) return { items: [], hasMore: false };
      const request = parseKaspiRequest(
        (await firestore.doc(kaspiRequestPath(payment.manualPaymentRequestId)).get()).data()
      );
      if (
        !request ||
        request.subjectId !== input.subjectId ||
        request.type !== input.type ||
        request.dataScope === 'test'
      )
        throw new HttpsError('permission-denied', 'Payment access denied.');
      return { items: [publicKaspiRequest(request)], hasMore: false };
    }
    if (!call.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    const admin = input.scope === 'admin' || input.scope === 'history';
    if (admin) {
      const { readScope } = await resolveAdministratorCanonicalRead(firestore, call.auth.uid);
      if (readScope.dataScope !== 'live')
        throw new HttpsError(
          'failed-precondition',
          'Manual payments are not available in test sessions.'
        );
    } else {
      const account = parseAccount((await firestore.doc(`users/${call.auth.uid}`).get()).data());
      if (!account || account.lifecycle.status !== 'active')
        throw new HttpsError('permission-denied', 'Payment access denied.');
    }
    if (input.scope === 'mine' && input.requestId) {
      const request = parseKaspiRequest(
        (await firestore.doc(kaspiRequestPath(input.requestId)).get()).data()
      );
      if (!request || request.accountId !== call.auth.uid || request.dataScope === 'test')
        throw new HttpsError('permission-denied', 'Payment access denied.');
      return { items: [publicKaspiRequest(request)], hasMore: false };
    }
    if (input.scope === 'history') {
      if (!input.requestId) throw new HttpsError('invalid-argument', 'Request required.');
      let query = firestore
        .collection(`${kaspiRequestPath(input.requestId)}/actions`)
        .orderBy(FieldPath.documentId())
        .limit(21);
      if (input.cursor) query = query.startAfter(input.cursor);
      const snapshots = await query.get();
      return {
        items: snapshots.docs
          .slice(0, 20)
          .map((doc) => ({ id: doc.id, ...normalizeFirestoreDocument(doc.data()) })),
        hasMore: snapshots.size > 20,
        nextCursor: snapshots.docs[19]?.id,
      };
    }
    let query: Query = firestore.collection('payment_requests');
    if (!admin) query = query.where('accountId', '==', call.auth.uid);
    if (admin && input.status) query = query.where('status', '==', input.status);
    query = query.orderBy(FieldPath.documentId()).limit(21);
    if (input.cursor) query = query.startAfter(input.cursor);
    const snapshots = await query.get();
    const items = snapshots.docs
      .slice(0, 20)
      .map((doc) => parseKaspiRequest(doc.data()))
      .filter((request): request is KaspiPaymentRequest =>
        Boolean(request && request.dataScope !== 'test')
      );
    return {
      items: admin ? items : items.map((request) => publicKaspiRequest(request)),
      hasMore: snapshots.size > 20,
      ...(snapshots.size > 20 ? { nextCursor: snapshots.docs[19]!.id } : {}),
    };
  };
}
