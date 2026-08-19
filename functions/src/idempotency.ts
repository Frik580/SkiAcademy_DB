import { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export const FUNCTION_IDEMPOTENCY_COLLECTION = 'function_idempotency';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

export type IdempotencySpec = {
  operation: string;
  key: string;
  requestSignature: string;
};

type StoredIdempotencyRecord<T> = {
  requestSignature: string;
  result: T;
  createdAt: string;
};

export function parseIdempotencyKey(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = (data as Record<string, unknown>).idempotencyKey;
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new HttpsError('invalid-argument', 'idempotencyKey has an invalid format.');
  }
  return value;
}

export function stableSignature(value: unknown): string {
  return JSON.stringify(value);
}

export function idempotencySpecFromRequest(
  data: unknown,
  operation: string,
  signature: unknown
): IdempotencySpec | undefined {
  const key = parseIdempotencyKey(data);
  if (!key) return undefined;
  return {
    operation,
    key,
    requestSignature: stableSignature(signature),
  };
}

export function idempotencyRef(
  db: Firestore,
  spec: Pick<IdempotencySpec, 'operation' | 'key'>
): DocumentReference {
  return db.collection(FUNCTION_IDEMPOTENCY_COLLECTION).doc(`${spec.operation}_${spec.key}`);
}

export function replayIdempotentResult<T>(
  snap: FirebaseFirestore.DocumentSnapshot,
  requestSignature: string
): T | undefined {
  if (!snap.exists) return undefined;
  const previous = snap.data() as StoredIdempotencyRecord<T>;
  if (previous.requestSignature !== requestSignature) {
    throw new HttpsError('already-exists', 'IDEMPOTENCY_KEY_CONFLICT');
  }
  return previous.result;
}

export function writeIdempotentResult<T>(
  transaction: Transaction,
  ref: DocumentReference,
  requestSignature: string,
  result: T
): void {
  transaction.set(ref, {
    requestSignature,
    result,
    createdAt: new Date().toISOString(),
  } satisfies StoredIdempotencyRecord<T>);
}

export async function loadIdempotencyReplay<T>(
  transaction: Transaction,
  db: Firestore,
  spec: IdempotencySpec | undefined
): Promise<{ ref: DocumentReference | null; replay?: T }> {
  if (!spec) return { ref: null };
  const ref = idempotencyRef(db, spec);
  const snap = await transaction.get(ref);
  const replay = replayIdempotentResult<T>(snap, spec.requestSignature);
  if (replay !== undefined) return { ref, replay };
  return { ref };
}

export async function withOptionalIdempotency<T>(
  db: Firestore,
  spec: IdempotencySpec | undefined,
  execute: (transaction: Transaction, commit: (result: T) => void) => Promise<T>
): Promise<T> {
  return db.runTransaction(async (transaction) => {
    const { ref, replay } = await loadIdempotencyReplay<T>(transaction, db, spec);
    if (replay !== undefined) return replay;

    const commit = (result: T) => {
      if (ref && spec) {
        writeIdempotentResult(transaction, ref, spec.requestSignature, result);
      }
    };

    return execute(transaction, commit);
  });
}
