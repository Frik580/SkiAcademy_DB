import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  CorrelationIdSchema,
  LIVE_CANONICAL_EXECUTION_SCOPE,
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
  deriveGuestReservationActorKey,
  type GuestReservationAdmissionPolicy,
} from './guestReservationAdmission';
import {
  mapCommandErrorTransportToHttpsError,
  rethrowCanonicalCommandErrorAsHttps,
} from './mapCommandError';

const MALFORMED_CORRELATION_ID = CorrelationIdSchema.parse('correlation_malformed_guest_callable');

export function createExecuteGuestCanonicalCommandHandler(
  firestore: Firestore,
  limits?: Pick<GuestReservationAdmissionPolicy, 'maxActiveLesson' | 'maxActiveCourse'>
) {
  const guestActionTokenSecret = readGuestActionTokenSecret();

  return async (
    request: CallableRequest<CallableGuestCommandTransportInput<CommandKind>>
  ): Promise<CommandResult<CommandKind>> => {
    const transportInput = parseCallableGuestCommandTransportInput(request);
    const guestSubjectId = deriveGuestSubjectIdForIntent(transportInput.intent);
    if (!guestSubjectId) {
      throw new HttpsError('invalid-argument', 'Guest subject could not be derived from intent.');
    }

    const envelope = buildGuestCommandEnvelopeFromCallable(guestSubjectId, transportInput);
    const isReservationCreation =
      transportInput.kind === 'create_guest_booking_request' ||
      transportInput.kind === 'create_course_enrollments';
    let guestReservationAdmission: GuestReservationAdmissionPolicy | undefined;
    if (isReservationCreation && limits) {
      const forwardedFor = request.rawRequest.headers['x-forwarded-for'];
      const actorKey = guestActionTokenSecret
        ? deriveGuestReservationActorKey(forwardedFor, guestActionTokenSecret)
        : undefined;
      if (!actorKey) {
        const xffEntryCount = !forwardedFor
          ? 0
          : Array.isArray(forwardedFor)
            ? forwardedFor.reduce((count, entry) => count + entry.split(',').length, 0)
            : forwardedFor.split(',').length;
        console.warn(
          JSON.stringify({
            event: 'guest_reservation_network_source_unavailable',
            failureReason: !guestActionTokenSecret
              ? 'key_unavailable'
              : typeof forwardedFor === 'undefined' || forwardedFor === ''
                ? 'missing_source'
                : xffEntryCount !== 1
                  ? 'unsupported_chain'
                  : 'malformed_source',
            xffEntryCount,
          })
        );
        throw new HttpsError('failed-precondition', 'Guest reservation admission is unavailable.');
      }
      guestReservationAdmission = { actorKey, ...limits };
    }
    const runtime = createCanonicalCommandRuntime(firestore, {
      guestActionTokenSecret,
      guestReservationAdmission,
    });
    const commands = runtime.createCommands(LIVE_CANONICAL_EXECUTION_SCOPE);

    try {
      const result = await commands.execute(envelope);
      if (result.status === 'error') {
        if (result.error.code === 'guest_reservation_limit') {
          console.warn(JSON.stringify({
            event: 'guest_active_reservation_limit_exceeded',
            reservationType:
              transportInput.kind === 'create_guest_booking_request' ? 'lesson' : 'course',
          }));
        }
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
