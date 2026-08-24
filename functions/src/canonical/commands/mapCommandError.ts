import {
  CanonicalCommandError,
  type CommandErrorCode,
  type CommandErrorTransport,
  toCommandErrorTransport,
} from '@ski-academy/shared-domain';
import { HttpsError } from 'firebase-functions/v2/https';

const COMMAND_ERROR_TO_HTTPS: Record<
  CommandErrorCode,
  ConstructorParameters<typeof HttpsError>[0]
> = {
  unauthorized: 'unauthenticated',
  forbidden: 'permission-denied',
  validation: 'invalid-argument',
  insufficient_funds: 'failed-precondition',
  payment_required: 'failed-precondition',
  resource_conflict: 'aborted',
  participant_conflict: 'aborted',
  instructor_conflict: 'aborted',
  course_full: 'failed-precondition',
  duplicate_active_enrollment: 'failed-precondition',
  stale_version: 'failed-precondition',
  concurrent_modification: 'aborted',
  invalid_transition: 'failed-precondition',
  blocked_relationship: 'permission-denied',
  expired: 'failed-precondition',
  unavailable: 'failed-precondition',
  idempotency_conflict: 'already-exists',
  operation_too_large: 'failed-precondition',
  audit_integrity_violation: 'internal',
  internal: 'internal',
};

export function mapCommandErrorTransportToHttpsError(
  transport: CommandErrorTransport
): HttpsError {
  const httpsCode = COMMAND_ERROR_TO_HTTPS[transport.code];
  return new HttpsError(httpsCode, transport.message, {
    code: transport.code,
    retryable: transport.retryable,
    correlationId: transport.correlationId,
    ...(transport.currentRevision === undefined
      ? {}
      : { currentRevision: transport.currentRevision }),
    ...(transport.details === undefined ? {} : { details: transport.details }),
  });
}

export function rethrowCanonicalCommandErrorAsHttps(
  error: unknown,
  fallbackCorrelationId: CommandErrorTransport['correlationId']
): never {
  if (error instanceof HttpsError) {
    throw error;
  }

  const transport = toCommandErrorTransport(error, fallbackCorrelationId);
  throw mapCommandErrorTransportToHttpsError(transport);
}

export function canonicalCommandError(
  code: CommandErrorCode,
  options: ConstructorParameters<typeof CanonicalCommandError>[1]
): CanonicalCommandError {
  return new CanonicalCommandError(code, options);
}
