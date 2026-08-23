"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanonicalCommandError = exports.CommandErrorTransportSchema = exports.CommandErrorDetailsSchema = exports.COMMAND_ERROR_POLICY = exports.CommandErrorCodeSchema = exports.COMMAND_ERROR_CODES = void 0;
exports.toCommandErrorTransport = toCommandErrorTransport;
const zod_1 = require("zod");
const primitives_1 = require("./primitives");
const identifiers_1 = require("./identifiers");
exports.COMMAND_ERROR_CODES = [
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
];
exports.CommandErrorCodeSchema = zod_1.z.enum(exports.COMMAND_ERROR_CODES);
exports.COMMAND_ERROR_POLICY = {
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
};
exports.CommandErrorDetailsSchema = zod_1.z
    .object({
    field: zod_1.z
        .string()
        .regex(/^[a-z][A-Za-z0-9_.]{0,63}$/)
        .optional(),
    reason: zod_1.z.enum(['malformed', 'required', 'out_of_range', 'unsupported', 'conflict']).optional(),
    resourceKind: zod_1.z
        .enum(['participant', 'instructor', 'course', 'booking', 'course_enrollment'])
        .optional(),
})
    .strict();
exports.CommandErrorTransportSchema = zod_1.z
    .object({
    code: exports.CommandErrorCodeSchema,
    message: zod_1.z.string(),
    retryable: zod_1.z.boolean(),
    correlationId: identifiers_1.CorrelationIdSchema,
    currentRevision: primitives_1.AggregateRevisionSchema.optional(),
    details: exports.CommandErrorDetailsSchema.optional(),
})
    .strict()
    .superRefine((error, context) => {
    const policy = exports.COMMAND_ERROR_POLICY[error.code];
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
function internalErrorTransport(correlationId) {
    const policy = exports.COMMAND_ERROR_POLICY.internal;
    return {
        code: 'internal',
        message: policy.message,
        retryable: policy.retryable,
        correlationId,
    };
}
class CanonicalCommandError extends Error {
    code;
    retryable;
    correlationId;
    currentRevision;
    details;
    constructor(code, options) {
        const policy = exports.COMMAND_ERROR_POLICY[code];
        super(policy.message);
        this.name = 'CanonicalCommandError';
        this.code = code;
        this.retryable = policy.retryable;
        this.correlationId = options.correlationId;
        this.currentRevision = options.currentRevision;
        this.details = options.details;
    }
    toTransport() {
        if (this.code === 'audit_integrity_violation') {
            return internalErrorTransport(this.correlationId);
        }
        return exports.CommandErrorTransportSchema.parse({
            code: this.code,
            message: this.message,
            retryable: this.retryable,
            correlationId: this.correlationId,
            ...(this.currentRevision === undefined ? {} : { currentRevision: this.currentRevision }),
            ...(this.details === undefined ? {} : { details: this.details }),
        });
    }
}
exports.CanonicalCommandError = CanonicalCommandError;
function toCommandErrorTransport(error, fallbackCorrelationId) {
    if (error instanceof CanonicalCommandError)
        return error.toTransport();
    const parsed = exports.CommandErrorTransportSchema.safeParse(error);
    if (parsed.success) {
        return parsed.data.code === 'audit_integrity_violation'
            ? internalErrorTransport(parsed.data.correlationId)
            : parsed.data;
    }
    return internalErrorTransport(fallbackCorrelationId);
}
