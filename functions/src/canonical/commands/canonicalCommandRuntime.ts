import type { Firestore } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { requireAdministratorAccountSessionPolicy } from '../../security/administratorSession';
import { createAuthoritativeCommandClock } from './commandClock';
import { createProductionCanonicalCommands, type CanonicalCommands } from './canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import type { CanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import type { GuestReservationAdmissionPolicy } from './guestReservationAdmission';
import { accountPath, parseAccount } from '../participantAccess/participantAccessStore';
import { isAdministratorProfile } from './resolveCallableAccountContext';
import {
  withCanonicalExecutionScope,
  type AccountId,
  type CanonicalExecutionScope,
} from '@ski-academy/shared-domain';

export interface CanonicalCommandRuntimeOptions {
  readonly guestActionTokenSecret?: string;
  readonly guestReservationAdmission?: GuestReservationAdmissionPolicy;
}

export interface CanonicalCommandRuntime {
  readonly executor: CanonicalTransactionExecutor;
  createCommands(
    scope: CanonicalExecutionScope, administratorId?: AccountId, liveAdministratorToken?: DecodedIdToken
  ): CanonicalCommands;
}

export function createCanonicalCommandRuntime(
  firestore: Firestore,
  options: CanonicalCommandRuntimeOptions = {}
): CanonicalCommandRuntime {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return {
    executor,
    createCommands(scope, administratorId, liveAdministratorToken) {
      const commandExecutor = administratorId
        ? createFirestoreCanonicalTransactionExecutor(firestore, {
            path: accountPath(administratorId),
            allows(data) {
              const account = parseAccount(data);
              if (!isAdministratorProfile(data) || account?.accountId !== administratorId ||
                  account.lifecycle.status !== 'active') return false;
              if (scope.dataScope === 'live') {
                try {
                  requireAdministratorAccountSessionPolicy(data, liveAdministratorToken);
                } catch {
                  return false;
                }
              }
              return true;
            },
          })
        : executor;
      return createProductionCanonicalCommands(
        withCanonicalExecutionScope({ clock: createAuthoritativeCommandClock(new Date()) }, scope),
        commandExecutor,
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
