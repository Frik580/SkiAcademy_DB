import {
  CommandErrorTransportSchema,
  type CommandErrorCode,
  type CommandErrorTransport,
  type CommandKind,
  type CommandResult,
} from '@ski-academy/shared-domain';

export interface CanonicalCommandClientErrorOptions {
  readonly correlationId: string;
  readonly currentRevision?: number;
  readonly details?: CommandErrorTransport['details'];
  readonly retryable?: boolean;
  readonly cause?: unknown;
}

export class CanonicalCommandClientError extends Error {
  readonly code: CommandErrorCode;
  readonly correlationId: string;
  readonly currentRevision?: number;
  readonly details?: CommandErrorTransport['details'];
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(code: CommandErrorCode, options: CanonicalCommandClientErrorOptions) {
    super(options.cause instanceof Error ? options.cause.message : mapCanonicalErrorMessage(code));
    this.name = 'CanonicalCommandClientError';
    this.code = code;
    this.correlationId = options.correlationId;
    this.currentRevision = options.currentRevision;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
  }
}

export function mapCanonicalErrorMessage(code: CommandErrorCode): string {
  switch (code) {
    case 'unauthorized':
      return 'Authentication is required.';
    case 'forbidden':
      return 'This action is not permitted.';
    case 'validation':
      return 'The request is invalid.';
    case 'stale_version':
      return 'The record changed; refresh it before retrying.';
    case 'idempotency_conflict':
      return 'The request key was already used.';
    case 'concurrent_modification':
      return 'The record is being modified; retry the operation.';
    case 'invalid_transition':
      return 'The requested state change is not allowed.';
    case 'resource_conflict':
    case 'participant_conflict':
    case 'instructor_conflict':
      return 'A scheduling conflict occurred.';
    case 'insufficient_funds':
      return 'There are insufficient funds.';
    case 'payment_required':
      return 'Payment is required.';
    case 'expired':
      return 'The request has expired.';
    case 'unavailable':
      return 'The requested option is unavailable.';
    case 'internal':
      return 'The operation could not be completed.';
    default:
      return 'The operation could not be completed.';
  }
}

function readHttpsErrorDetails(error: unknown): Record<string, unknown> | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'details' in error &&
    typeof (error as { details?: unknown }).details === 'object' &&
    (error as { details?: unknown }).details !== null
  ) {
    return (error as { details: Record<string, unknown> }).details;
  }
  return undefined;
}

function readFirebaseFunctionsCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function mapFunctionsCodeToCanonical(code: string | undefined): CommandErrorCode {
  switch (code) {
    case 'functions/unauthenticated':
      return 'unauthorized';
    case 'functions/permission-denied':
      return 'forbidden';
    case 'functions/invalid-argument':
      return 'validation';
    case 'functions/failed-precondition':
      return 'stale_version';
    case 'functions/already-exists':
      return 'idempotency_conflict';
    case 'functions/aborted':
      return 'concurrent_modification';
    case 'functions/not-found':
      return 'unavailable';
    default:
      return 'internal';
  }
}

export function mapCanonicalCommandTransportError(
  transport: CommandErrorTransport
): CanonicalCommandClientError {
  return new CanonicalCommandClientError(transport.code, {
    correlationId: transport.correlationId,
    currentRevision: transport.currentRevision,
    details: transport.details,
    retryable: transport.retryable,
  });
}

export function toCanonicalCommandClientError(
  error: unknown,
  fallbackCorrelationId: string
): CanonicalCommandClientError {
  const details = readHttpsErrorDetails(error);
  const parsedTransport = CommandErrorTransportSchema.safeParse(details);
  if (parsedTransport.success) {
    return mapCanonicalCommandTransportError(parsedTransport.data);
  }

  const functionsCode = readFirebaseFunctionsCode(error);
  const code = mapFunctionsCodeToCanonical(functionsCode);
  const correlationId =
    typeof details?.correlationId === 'string' ? details.correlationId : fallbackCorrelationId;
  const currentRevision =
    typeof details?.currentRevision === 'number' ? details.currentRevision : undefined;

  return new CanonicalCommandClientError(code, {
    correlationId,
    currentRevision,
    cause: error,
    retryable: code === 'internal' || code === 'concurrent_modification',
  });
}

export function mapCanonicalCommandResultError<Kind extends CommandKind>(
  result: CommandResult<Kind>
): CanonicalCommandClientError | undefined {
  if (result.status !== 'error') {
    return undefined;
  }
  return mapCanonicalCommandTransportError(result.error);
}

export function isRetryableCanonicalCommandError(error: unknown): boolean {
  if (error instanceof CanonicalCommandClientError) {
    return error.retryable;
  }
  const normalized = toCanonicalCommandClientError(error, 'correlation_unknown');
  return normalized.retryable;
}
