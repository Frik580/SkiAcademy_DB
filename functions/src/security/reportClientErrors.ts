import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { admitRequest, requestPrincipalKey } from './requestAdmission';

export function sanitizeClientError(entry: unknown) {
  if (!entry || typeof entry !== 'object')
    throw new HttpsError('invalid-argument', 'Invalid log entry.');
  const data = entry as Record<string, unknown>;
  if (
    typeof data.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(data.id) ||
    typeof data.message !== 'string' ||
    data.message.length > 5000 ||
    (data.stack !== undefined && (typeof data.stack !== 'string' || data.stack.length > 20_000))
  ) {
    throw new HttpsError('invalid-argument', 'Invalid log entry.');
  }
  // Arbitrary error text, URLs, paths, emails and stack traces may contain secrets
  // or personal data. Retain a fingerprint, never the raw client-controlled text.
  return {
    id: data.id,
    message: 'Client runtime error (details redacted)',
    stack: '',
    fingerprint: createHash('sha256').update(data.message).digest('hex'),
    source: ['global_error', 'unhandled_rejection', 'firestore', 'custom'].includes(
      String(data.source)
    )
      ? String(data.source)
      : 'custom',
    operation: ['get', 'list', 'write', 'create', 'update', 'delete'].includes(
      String(data.operation)
    )
      ? String(data.operation)
      : '',
  };
}

export function createReportClientErrorsHandler(firestore: Firestore, secret: string) {
  return async (request: CallableRequest<{ entries?: unknown[] }>) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
    await admitRequest(firestore, `errors_${requestPrincipalKey(request, secret)}`, 5);
    if (
      !Array.isArray(request.data?.entries) ||
      request.data.entries.length < 1 ||
      request.data.entries.length > 10
    ) {
      throw new HttpsError('invalid-argument', 'Expected up to ten entries.');
    }
    const entries = request.data.entries.map(sanitizeClientError);
    const uid = request.auth.uid;
    await firestore.runTransaction(async (tx) => {
      const refs = entries.map((entry) =>
        firestore.doc(
          `error_logs/${createHash('sha256').update(`${uid}:${entry.id}`).digest('hex')}`
        )
      );
      const snaps = await tx.getAll(...refs);
      entries.forEach((entry, i) => {
        if (!snaps[i].exists)
          tx.set(refs[i], { ...entry, userId: uid, timestamp: new Date().toISOString() });
      });
    });
    return { accepted: entries.length };
  };
}
