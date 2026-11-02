import type { CanonicalTimestamp, KaspiPaymentRequest } from '@ski-academy/shared-domain';
export type KaspiPublicRequest = Pick<
  KaspiPaymentRequest,
  | 'requestId'
  | 'type'
  | 'amount'
  | 'currency'
  | 'status'
  | 'revision'
  | 'createdAt'
  | 'expiresAt'
  | 'claimedAt'
  | 'subjectId'
  | 'merchantKey'
>;
export interface KaspiGuestInput {
  type: 'guest_booking_payment' | 'guest_course_payment';
  subjectId: string;
}
export interface KaspiCredentialInput {
  nonce: string;
  signature: string;
  expiresAt: CanonicalTimestamp;
}
export interface KaspiConfigurationInput {
  enabled: boolean;
  qrImageUrl?: string;
  merchantName?: string;
  merchantKey?: string;
}
export interface KaspiAdminConfigurationInput {
  enabled: boolean;
  revision: number;
  ready: boolean;
  merchantName?: string;
  merchantKey?: string;
  qrImageUrl?: string;
  qrStoragePath?: string;
  walletRequestTtlSeconds?: number;
  qrVerifiedAt?: CanonicalTimestamp;
  qrVerifiedBy?: string;
}
export interface KaspiPage<T> {
  items: T[];
  hasMore: boolean;
  nextCursor?: string;
}
