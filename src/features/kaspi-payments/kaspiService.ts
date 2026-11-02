import { AggregateRevisionSchema, IdempotencyKeySchema } from '@ski-academy/shared-domain';
import { callFunction } from '../../lib/functions/functionsClient';
import {
  executeAuthenticatedCanonicalCommand,
  executeGuestCanonicalCommand,
} from '../../lib/canonical/canonicalCommandClient';
import { readGuestBookingCredential } from '../lesson-bookings/guestCredentialStorage';
import { readGuestCourseEnrollmentCredential } from '../course-enrollments/guestCourseEnrollmentCredentialStorage';
import type {
  KaspiConfigurationInput,
  KaspiCredentialInput,
  KaspiGuestInput,
  KaspiPage,
  KaspiPublicRequest,
} from './kaspiContracts';

export const queryKaspi = <T>(input: object) =>
  callFunction<object, T>('queryKaspiPayments', input, { idempotencyKey: crypto.randomUUID() });
export const kaspiConfiguration = () =>
  queryKaspi<KaspiConfigurationInput>({ scope: 'configuration' });
export function kaspiCredential(guest: KaspiGuestInput): KaspiCredentialInput {
  if (guest.type === 'guest_booking_payment') {
    const credential = readGuestBookingCredential(guest.subjectId).credential?.statusCredential;
    if (!credential) throw new Error('Guest credential unavailable');
    return {
      nonce: credential.nonce,
      signature: credential.signature,
      expiresAt: credential.expiresAt,
    };
  }
  const credential = readGuestCourseEnrollmentCredential(guest.subjectId).credential;
  if (!credential) throw new Error('Guest credential unavailable');
  return {
    nonce: credential.nonce,
    signature: credential.signature,
    expiresAt: credential.expiresAt,
  };
}
export async function loadKaspiRequests(guest?: KaspiGuestInput, cursor?: string) {
  return queryKaspi<KaspiPage<KaspiPublicRequest>>(
    guest
      ? { scope: 'guest', ...guest, ...kaspiCredential(guest) }
      : { scope: 'mine', ...(cursor ? { cursor } : {}) }
  );
}
function assertSuccess(result: { status: string }) {
  if (result.status !== 'success') throw new Error('Payment command failed');
}
export async function createKaspiRequest(
  requestId: string,
  accountId: string,
  amount: number,
  guest?: KaspiGuestInput
) {
  const intent = guest
    ? guest.type === 'guest_booking_payment'
      ? { type: guest.type, requestId, bookingId: guest.subjectId }
      : { type: guest.type, requestId, courseEnrollmentId: guest.subjectId }
    : { type: 'wallet_topup' as const, requestId, amount: amount as never };
  const base = {
    kind: 'create_kaspi_payment_request' as const,
    intent,
    idempotencyKey: IdempotencyKeySchema.parse(`kaspi_create_${requestId}`),
  };
  if (guest) {
    const credential = kaspiCredential(guest);
    assertSuccess(
      await executeGuestCanonicalCommand({
        ...base,
        guestActionNonce: credential.nonce,
        guestActionSignature: credential.signature,
        guestProfileExpiresAt: credential.expiresAt,
      })
    );
  } else assertSuccess(await executeAuthenticatedCanonicalCommand(accountId, base));
}
export async function claimKaspiRequest(
  request: KaspiPublicRequest,
  accountId: string,
  guest?: KaspiGuestInput
) {
  const intent = {
    requestId: request.requestId,
    ...(guest
      ? guest.type === 'guest_booking_payment'
        ? { bookingId: guest.subjectId }
        : { courseEnrollmentId: guest.subjectId }
      : {}),
  };
  const base = {
    kind: 'claim_kaspi_payment' as const,
    intent,
    expectedRevision: AggregateRevisionSchema.parse(request.revision),
    idempotencyKey: IdempotencyKeySchema.parse(`kaspi_claim_${request.requestId}`),
  };
  if (guest) {
    const credential = kaspiCredential(guest);
    assertSuccess(
      await executeGuestCanonicalCommand({
        ...base,
        guestActionNonce: credential.nonce,
        guestActionSignature: credential.signature,
        guestProfileExpiresAt: credential.expiresAt,
      })
    );
  } else assertSuccess(await executeAuthenticatedCanonicalCommand(accountId, base));
}
