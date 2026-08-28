import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  CorrelationIdSchema,
  type CommandKind,
  type CommandResult,
} from '@ski-academy/shared-domain';
import {
  buildGuestCommandEnvelopeFromCallable,
  deriveGuestSubjectIdForIntent,
  parseCallableGuestCommandTransportInput,
  type CallableGuestCommandTransportInput,
} from './guestCallableTransportAdapter';
import {
  createCanonicalCommandRuntime,
  readGuestActionTokenSecret,
} from './canonicalCommandRuntime';
import {
  mapCommandErrorTransportToHttpsError,
  rethrowCanonicalCommandErrorAsHttps,
} from './mapCommandError';

const MALFORMED_CORRELATION_ID = CorrelationIdSchema.parse('correlation_malformed_guest_callable');

export function createExecuteGuestCanonicalCommandHandler(firestore: Firestore) {
  const runtime = createCanonicalCommandRuntime(firestore, {
    guestActionTokenSecret: readGuestActionTokenSecret(),
  });

  return async (
    request: CallableRequest<CallableGuestCommandTransportInput<CommandKind>>
  ): Promise<CommandResult<CommandKind>> => {
    const transportInput = parseCallableGuestCommandTransportInput(request);
    const guestSubjectId = deriveGuestSubjectIdForIntent(transportInput.intent, transportInput.idempotencyKey);
    if (!guestSubjectId) {
      throw new HttpsError('invalid-argument', 'Guest subject could not be derived from intent.');
    }

    const envelope = buildGuestCommandEnvelopeFromCallable(guestSubjectId, transportInput);
    const commands = runtime.createCommands();

    try {
      const result = await commands.execute(envelope);
      if (result.status === 'error') {
        throw mapCommandErrorTransportToHttpsError(result.error);
      }
      return result;
    } catch (error) {
      rethrowCanonicalCommandErrorAsHttps(
        error,
        envelope.context.correlationId ?? MALFORMED_CORRELATION_ID
      );
    }
  };
}
