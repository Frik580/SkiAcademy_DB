import type { Firestore } from 'firebase-admin/firestore';
import { createAuthoritativeCommandClock } from './commandClock';
import { createProductionCanonicalCommands, type CanonicalCommands } from './canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import type { CanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

export interface CanonicalCommandRuntimeOptions {
  readonly guestActionTokenSecret?: string;
}

export interface CanonicalCommandRuntime {
  readonly executor: CanonicalTransactionExecutor;
  createCommands(): CanonicalCommands;
}

export function createCanonicalCommandRuntime(
  firestore: Firestore,
  options: CanonicalCommandRuntimeOptions = {}
): CanonicalCommandRuntime {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return {
    executor,
    createCommands() {
      return createProductionCanonicalCommands(
        { clock: createAuthoritativeCommandClock(new Date()) },
        executor,
        {
          guestActionTokenSecret: options.guestActionTokenSecret,
        }
      );
    },
  };
}

export function readGuestActionTokenSecret(): string | undefined {
  const secret = process.env.GUEST_ACTION_TOKEN_SECRET;
  return typeof secret === 'string' && secret.trim().length > 0 ? secret.trim() : undefined;
}
