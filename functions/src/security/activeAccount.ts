import { parseAccountDocument, type Account } from '@ski-academy/shared-domain';
import { HttpsError } from 'firebase-functions/v2/https';

/** Authority fields and canonical metadata must describe the current Firebase UID. */
export function requireActiveAccount(
  uid: string,
  profile: Record<string, unknown> | undefined
): Account {
  const account = parseAccountDocument(profile);
  if (
    !account ||
    account.accountId !== uid ||
    account.lifecycle.status !== 'active' ||
    (profile?.role !== 'user' && profile?.role !== 'admin')
  ) {
    throw new HttpsError('permission-denied', 'An active canonical Account is required.');
  }
  return account;
}
