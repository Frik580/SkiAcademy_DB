import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

/**
 * Platform enforcement for the public guest command callable.
 * `consumeAppCheckToken` marks limited-use tokens as used. The platform does not
 * reject an already-consumed token by itself; the handler must.
 */
export const GUEST_CALLABLE_APP_CHECK_OPTIONS = {
  enforceAppCheck: true,
  consumeAppCheckToken: true,
} as const;

/** The Functions emulator does not enforce App Check. Production does. */
export function guestCallableAppCheckEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FUNCTIONS_EMULATOR !== 'true';
}

export function assertGuestCallableAppCheck(
  request: Pick<CallableRequest<unknown>, 'app'>,
  enforce = guestCallableAppCheckEnforced()
): void {
  if (!enforce) {
    return;
  }
  if (!request.app || request.app.alreadyConsumed === true) {
    throw new HttpsError('unauthenticated', 'App Check is required for guest commands.');
  }
}
