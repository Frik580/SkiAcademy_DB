import { timingSafeEqual } from 'node:crypto';
import {
  decodeHmacSha256HexSignature,
  verifyGuestActionCredentialParts,
  verifyGuestActionToken,
  verifyGuestCourseEnrollmentActionCredentialParts,
  type CompareHmacSha256Signatures,
  type GuestActionTokenVerificationResult,
  type GuestCourseEnrollmentActionTokenVerificationResult,
} from '@ski-academy/shared-domain';

export const timingSafeCompareHmacSha256HexSignatures: CompareHmacSha256Signatures = (
  expectedHex,
  providedSignature
) => {
  const expectedBytes = decodeHmacSha256HexSignature(expectedHex);
  const providedBytes = decodeHmacSha256HexSignature(providedSignature);
  if (expectedBytes === undefined || providedBytes === undefined) {
    return false;
  }
  if (expectedBytes.length !== providedBytes.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expectedBytes), Buffer.from(providedBytes));
};

type VerifyGuestActionCredentialPartsInput = Parameters<typeof verifyGuestActionCredentialParts>[0];
type VerifyGuestActionTokenInput = Parameters<typeof verifyGuestActionToken>[0];

export function verifyGuestActionCredentialPartsAuthoritative(
  input: Omit<VerifyGuestActionCredentialPartsInput, 'compareSignatures'>
): GuestActionTokenVerificationResult {
  return verifyGuestActionCredentialParts({
    ...input,
    compareSignatures: timingSafeCompareHmacSha256HexSignatures,
  });
}

export function verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative(
  input: Omit<
    Parameters<typeof verifyGuestCourseEnrollmentActionCredentialParts>[0],
    'compareSignatures'
  >
): GuestCourseEnrollmentActionTokenVerificationResult {
  return verifyGuestCourseEnrollmentActionCredentialParts({
    ...input,
    compareSignatures: timingSafeCompareHmacSha256HexSignatures,
  });
}

export function verifyGuestActionTokenAuthoritative(
  input: Omit<VerifyGuestActionTokenInput, 'compareSignatures'>
): GuestActionTokenVerificationResult {
  return verifyGuestActionToken({
    ...input,
    compareSignatures: timingSafeCompareHmacSha256HexSignatures,
  });
}
