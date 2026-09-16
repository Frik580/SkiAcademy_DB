import {
  GuestBookingActionCredentialSchema,
  type GuestBookingActionCredential,
} from '@ski-academy/shared-domain';

const STORAGE_KEY_PREFIX = 'ski_academy_guest_booking_credential:';

export type GuestCredentialStorageError = 'missing' | 'expired' | 'malformed';

export function guestCredentialStorageKey(bookingId: string): string {
  return `${STORAGE_KEY_PREFIX}${bookingId}`;
}

export type GuestCredentialPersistResult =
  { readonly ok: true } | { readonly ok: false; readonly error: 'storage_unavailable' };

export function persistGuestBookingCredential(
  credential: GuestBookingActionCredential
): GuestCredentialPersistResult {
  try {
    const key = guestCredentialStorageKey(credential.bookingId);
    localStorage.setItem(key, JSON.stringify(credential));
    return { ok: true };
  } catch {
    return { ok: false, error: 'storage_unavailable' };
  }
}

export function readGuestBookingCredential(bookingId: string): {
  readonly credential?: GuestBookingActionCredential;
  readonly error?: GuestCredentialStorageError;
} {
  const raw = localStorage.getItem(guestCredentialStorageKey(bookingId));
  if (!raw) {
    return { error: 'missing' };
  }
  try {
    const parsed = JSON.parse(raw);
    const result = GuestBookingActionCredentialSchema.safeParse(parsed);
    if (!result.success) {
      return { error: 'malformed' };
    }
    const nowMs = Date.now();
    const expiresMs =
      result.data.expiresAt.seconds * 1000 + result.data.expiresAt.nanoseconds / 1_000_000;
    if (expiresMs <= nowMs) {
      return { error: 'expired' };
    }
    return { credential: result.data };
  } catch {
    return { error: 'malformed' };
  }
}

export function removeGuestBookingCredential(bookingId: string): void {
  localStorage.removeItem(guestCredentialStorageKey(bookingId));
}
