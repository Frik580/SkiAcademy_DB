import type { Firestore } from 'firebase-admin/firestore';
import { createAuthoritativeCommandClock } from './commandClock';
import { createProductionCanonicalCommands, type CanonicalCommands } from './canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import type { CanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import type { GuestReservationAdmissionPolicy } from './guestReservationAdmission';
import {
  withCanonicalExecutionScope,
  type CanonicalExecutionScope,
} from '@ski-academy/shared-domain';

export interface CanonicalCommandRuntimeOptions {
  readonly guestActionTokenSecret?: string;
  readonly guestReservationAdmission?: GuestReservationAdmissionPolicy;
}

export interface CanonicalCommandRuntime {
  readonly executor: CanonicalTransactionExecutor;
  createCommands(scope: CanonicalExecutionScope): CanonicalCommands;
}

export function createCanonicalCommandRuntime(
  firestore: Firestore,
  options: CanonicalCommandRuntimeOptions = {}
): CanonicalCommandRuntime {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return {
    executor,
    createCommands(scope: CanonicalExecutionScope) {
      return createProductionCanonicalCommands(
        withCanonicalExecutionScope({ clock: createAuthoritativeCommandClock(new Date()) }, scope),
        executor,
        {
          guestActionTokenSecret: options.guestActionTokenSecret,
          guestReservationAdmission: options.guestReservationAdmission,
        }
      );
    },
  };
}

export function readGuestActionTokenSecret(): string | undefined {
  const secret = process.env.GUEST_ACTION_TOKEN_SECRET;
  return typeof secret === 'string' && secret.trim().length > 0 ? secret.trim() : undefined;
}
