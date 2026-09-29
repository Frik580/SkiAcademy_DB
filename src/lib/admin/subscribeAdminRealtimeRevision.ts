import type { z } from 'zod';
import type { FirestoreError } from 'firebase/firestore';
import { db, doc, onSnapshot } from '../../infrastructure/firebase';
import { logger } from '../../shared';

const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

// Mirrors Firestore's retryable non-write status codes. Errors delivered to
// onSnapshot's error callback are terminal for that listener, so the client
// must create a new listener to recover.
const RETRYABLE_FIRESTORE_ERROR_CODES: ReadonlySet<string> = new Set([
  'cancelled',
  'unknown',
  'deadline-exceeded',
  'resource-exhausted',
  'internal',
  'unavailable',
  'unauthenticated',
]);

export function subscribeAdminRealtimeRevision(input: {
  readonly collection: string;
  readonly documentId: string;
  readonly schema: z.ZodType<{ revision: number }>;
  readonly onRevision: (nextRevision: number) => void;
}): () => void {
  const ref = doc(db, input.collection, input.documentId);
  const signal = `${input.collection}/${input.documentId}`;
  let active = true;
  let listenerGeneration = 0;
  let retryAttempt = 0;
  let unsubscribeActive: (() => void) | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const startListening = (): void => {
    if (!active || unsubscribeActive || retryTimer !== undefined) return;

    const generation = ++listenerGeneration;
    let terminated = false;
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (!active || generation !== listenerGeneration) return;
        retryAttempt = 0;
        const parsed = snapshot.exists() ? input.schema.safeParse(snapshot.data()) : undefined;
        input.onRevision(parsed?.success ? parsed.data.revision : 0);
      },
      (error: FirestoreError) => {
        if (!active || generation !== listenerGeneration) return;
        terminated = true;
        listenerGeneration += 1;
        unsubscribeActive = undefined;

        const code = error.code;
        if (!RETRYABLE_FIRESTORE_ERROR_CODES.has(code)) {
          logger.warn('Admin realtime revision listener recovery stopped.', {
            signal,
            code,
            recovery: 'stopped',
          });
          return;
        }

        const delayMs = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** retryAttempt, MAX_RETRY_DELAY_MS);
        retryAttempt += 1;
        logger.warn('Admin realtime revision listener retry scheduled.', {
          signal,
          code,
          delayMs,
          recovery: 'scheduled',
        });
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          startListening();
        }, delayMs);
      }
    );

    if (!active || generation !== listenerGeneration) {
      if (!terminated) unsubscribe();
      return;
    }
    unsubscribeActive = unsubscribe;
  };

  startListening();

  return () => {
    if (!active) return;
    active = false;
    listenerGeneration += 1;
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
    const unsubscribe = unsubscribeActive;
    unsubscribeActive = undefined;
    unsubscribe?.();
  };
}
