import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import type { CommandKind, CommandResult } from '@ski-academy/shared-domain';
import {
  buildCommandEnvelopeFromCallable,
  type CallableCommandTransportInput,
} from './callableTransportAdapter';
import {
  createCanonicalCommandRuntime,
  readGuestActionTokenSecret,
} from './canonicalCommandRuntime';
import {
  mapCommandErrorTransportToHttpsError,
  rethrowCanonicalCommandErrorAsHttps,
} from './mapCommandError';
import { parseAuthenticatedCallableCommandTransportInput } from './guestCallableTransportAdapter';
import {
  isAdministratorProfile,
  resolveCallableAccountContext,
  type CallableAccountProfile,
} from './resolveCallableAccountContext';
import { parseAccount } from '../participantAccess/participantAccessStore';

function readCallableAccountProfile(
  data: Record<string, unknown> | undefined
): CallableAccountProfile {
  if (!data) return {};
  return {
    ...(typeof data.role === 'string' ? { role: data.role } : {}),
    ...(typeof data.systemRole === 'string' ? { systemRole: data.systemRole } : {}),
    ...(typeof data.instructorId === 'string' ? { instructorId: data.instructorId } : {}),
    ...(typeof data.isInstructor === 'boolean' ? { isInstructor: data.isInstructor } : {}),
  };
}

function mapCallableContextError(error: unknown): never {
  if (error instanceof Error) {
    if (error.message === 'unauthenticated') {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    if (error.message === 'forbidden' || error.message === 'forbidden_capability') {
      throw new HttpsError('permission-denied', 'This action is not permitted.');
    }
  }
  throw error;
}

export function createExecuteCanonicalCommandHandler(firestore: Firestore) {
  const runtime = createCanonicalCommandRuntime(firestore, {
    guestActionTokenSecret: readGuestActionTokenSecret(),
  });

  return async (
    request: CallableRequest<
      CallableCommandTransportInput<CommandKind> & {
        readonly exercisedCapability?: unknown;
        readonly administratorContext?: unknown;
      }
    >
  ): Promise<CommandResult<CommandKind>> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const transportInput = parseAuthenticatedCallableCommandTransportInput(request);
    const userSnap = await firestore.collection('users').doc(request.auth.uid).get();
    const userData = userSnap.data() as Record<string, unknown> | undefined;
    const profile = readCallableAccountProfile(userData);

    let accountContext;
    try {
      accountContext = resolveCallableAccountContext(profile, {
        authUid: request.auth.uid,
        commandKind: transportInput.kind,
        exercisedCapability: transportInput.exercisedCapability,
        administratorContext: transportInput.administratorContext,
      });
    } catch (error) {
      mapCallableContextError(error);
    }

    if (accountContext.capability === 'administrator' && !isAdministratorProfile(profile)) {
      throw new HttpsError('permission-denied', 'This action is not permitted.');
    }
    if (accountContext.capability === 'administrator') {
      const account = parseAccount(userData);
      if (!account || account.lifecycle.status !== 'active') {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
    } else if (accountContext.source === 'client_callable') {
      const account = parseAccount(userData);
      if (account?.lifecycle.status === 'disabled') {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
    }

    const envelope = buildCommandEnvelopeFromCallable(accountContext, transportInput);
    const commands = runtime.createCommands();

    try {
      const result = await commands.execute(envelope);
      if (result.status === 'error') {
        throw mapCommandErrorTransportToHttpsError(result.error);
      }
      return result;
    } catch (error) {
      rethrowCanonicalCommandErrorAsHttps(error, envelope.context.correlationId);
    }
  };
}
