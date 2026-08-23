import { z } from 'zod';
import { AggregateRevisionSchema, type AggregateRevision } from './primitives';
import { CorrelationIdSchema, type CorrelationId } from './identifiers';

export const COMMAND_ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'validation',
  'insufficient_funds',
  'payment_required',
  'resource_conflict',
  'participant_conflict',
  'instructor_conflict',
  'course_full',
  'duplicate_active_enrollment',
  'stale_version',
  'concurrent_modification',
  'invalid_transition',
  'blocked_relationship',
  'expired',
  'unavailable',
  'idempotency_conflict',
  'operation_too_large',
  'audit_integrity_violation',
  'internal',
] as const;

export type CommandErrorCode = (typeof COMMAND_ERROR_CODES)[number];

export const CommandErrorCodeSchema = z.enum(COMMAND_ERROR_CODES);

interface CommandErrorPolicy {
  readonly message: string;
  readonly retryable: boolean;
}

export const COMMAND_ERROR_POLICY = {
  unauthorized: { message: 'Authentication is required.', retryable: false },
  forbidden: { message: 'This action is not permitted.', retryable: false },
  validation: { message: 'The request is invalid.', retryable: false },
  insufficient_funds: { message: 'There are insufficient funds.', retryable: false },
  payment_required: { message: 'Payment is required.', retryable: false },
  resource_conflict: { message: 'A required resource is unavailable.', retryable: false },
  participant_conflict: { message: 'The Participant has a scheduling conflict.', retryable: false },
  instructor_conflict: { message: 'The Instructor has a scheduling conflict.', retryable: false },
  course_full: { message: 'The Course has no available seats.', retryable: false },
  duplicate_active_enrollment: {
    message: 'An active Enrollment already exists.',
    retryable: false,
  },
  stale_version: {
    message: 'The record changed; refresh it before retrying.',
    retryable: false,
  },
  concurrent_modification: {
    message: 'The record is being modified; retry the operation.',
    retryable: true,
  },
  invalid_transition: { message: 'The requested state change is not allowed.', retryable: false },
  blocked_relationship: { message: 'The relationship blocks this action.', retryable: false },
  expired: { message: 'The request has expired.', retryable: false },
  unavailable: { message: 'The requested option is unavailable.', retryable: false },
  idempotency_conflict: { message: 'The request key was already used.', retryable: false },
  operation_too_large: { message: 'The operation is too large.', retryable: false },
  audit_integrity_violation: {
    message: 'The operation could not be completed.',
    retryable: false,
  },
  internal: { message: 'The operation could not be completed.', retryable: true },
} as const satisfies Record<CommandErrorCode, CommandErrorPolicy>;

export const CommandErrorDetailsSchema = z
  .object({
    field: z
      .string()
      .regex(/^[a-z][A-Za-z0-9_.]{0,63}$/)
      .optional(),
    reason: z.enum(['malformed', 'required', 'out_of_range', 'unsupported', 'conflict']).optional(),
    resourceKind: z
      .enum(['participant', 'instructor', 'course', 'booking', 'course_enrollment'])
      .optional(),
  })
  .strict();

export type CommandErrorDetails = z.output<typeof CommandErrorDetailsSchema>;

export const CommandErrorTransportSchema = z
  .object({
    code: CommandErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    correlationId: CorrelationIdSchema,
    currentRevision: AggregateRevisionSchema.optional(),
    details: CommandErrorDetailsSchema.optional(),
  })
  .strict()
  .superRefine((error, context) => {
    const policy = COMMAND_ERROR_POLICY[error.code];
    if (error.message !== policy.message) {
      context.addIssue({
        code: 'custom',
        path: ['message'],
        message: 'Message does not match policy',
      });
    }
    if (error.retryable !== policy.retryable) {
      context.addIssue({
        code: 'custom',
        path: ['retryable'],
        message: 'Retryability does not match policy',
      });
    }
  });

export type CommandErrorTransport = z.output<typeof CommandErrorTransportSchema>;

export interface CanonicalCommandErrorOptions {
  readonly correlationId: CorrelationId;
  readonly currentRevision?: AggregateRevision;
  readonly details?: CommandErrorDetails;
}

function internalErrorTransport(correlationId: CorrelationId): CommandErrorTransport {
  const policy = COMMAND_ERROR_POLICY.internal;
  return {
    code: 'internal',
    message: policy.message,
    retryable: policy.retryable,
    correlationId,
  };
}

export class CanonicalCommandError extends Error {
  readonly code: CommandErrorCode;
  readonly retryable: boolean;
  readonly correlationId: CorrelationId;
  readonly currentRevision?: AggregateRevision;
  readonly details?: CommandErrorDetails;

  constructor(code: CommandErrorCode, options: CanonicalCommandErrorOptions) {
    const policy = COMMAND_ERROR_POLICY[code];
    super(policy.message);
    this.name = 'CanonicalCommandError';
    this.code = code;
    this.retryable = policy.retryable;
    this.correlationId = options.correlationId;
    this.currentRevision = options.currentRevision;
    this.details = options.details;
  }

  toTransport(): CommandErrorTransport {
    if (this.code === 'audit_integrity_violation') {
      return internalErrorTransport(this.correlationId);
    }

    return CommandErrorTransportSchema.parse({
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      correlationId: this.correlationId,
      ...(this.currentRevision === undefined ? {} : { currentRevision: this.currentRevision }),
      ...(this.details === undefined ? {} : { details: this.details }),
    });
  }
}

export function toCommandErrorTransport(
  error: unknown,
  fallbackCorrelationId: CorrelationId
): CommandErrorTransport {
  if (error instanceof CanonicalCommandError) return error.toTransport();

  const parsed = CommandErrorTransportSchema.safeParse(error);
  if (parsed.success) {
    return parsed.data.code === 'audit_integrity_violation'
      ? internalErrorTransport(parsed.data.correlationId)
      : parsed.data;
  }

  return internalErrorTransport(fallbackCorrelationId);
}
