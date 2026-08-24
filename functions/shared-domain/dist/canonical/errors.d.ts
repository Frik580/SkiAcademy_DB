import { z } from 'zod';
import { type AggregateRevision } from './primitives';
import { type CorrelationId } from './identifiers';
export declare const COMMAND_ERROR_CODES: readonly ["unauthorized", "forbidden", "validation", "insufficient_funds", "payment_required", "resource_conflict", "participant_conflict", "instructor_conflict", "course_full", "duplicate_active_enrollment", "stale_version", "concurrent_modification", "invalid_transition", "blocked_relationship", "expired", "unavailable", "idempotency_conflict", "operation_too_large", "audit_integrity_violation", "internal"];
export type CommandErrorCode = (typeof COMMAND_ERROR_CODES)[number];
export declare const CommandErrorCodeSchema: z.ZodEnum<{
    unauthorized: "unauthorized";
    forbidden: "forbidden";
    validation: "validation";
    insufficient_funds: "insufficient_funds";
    payment_required: "payment_required";
    resource_conflict: "resource_conflict";
    participant_conflict: "participant_conflict";
    instructor_conflict: "instructor_conflict";
    course_full: "course_full";
    duplicate_active_enrollment: "duplicate_active_enrollment";
    stale_version: "stale_version";
    concurrent_modification: "concurrent_modification";
    invalid_transition: "invalid_transition";
    blocked_relationship: "blocked_relationship";
    expired: "expired";
    unavailable: "unavailable";
    idempotency_conflict: "idempotency_conflict";
    operation_too_large: "operation_too_large";
    audit_integrity_violation: "audit_integrity_violation";
    internal: "internal";
}>;
export declare const COMMAND_ERROR_POLICY: {
    readonly unauthorized: {
        readonly message: "Authentication is required.";
        readonly retryable: false;
    };
    readonly forbidden: {
        readonly message: "This action is not permitted.";
        readonly retryable: false;
    };
    readonly validation: {
        readonly message: "The request is invalid.";
        readonly retryable: false;
    };
    readonly insufficient_funds: {
        readonly message: "There are insufficient funds.";
        readonly retryable: false;
    };
    readonly payment_required: {
        readonly message: "Payment is required.";
        readonly retryable: false;
    };
    readonly resource_conflict: {
        readonly message: "A required resource is unavailable.";
        readonly retryable: false;
    };
    readonly participant_conflict: {
        readonly message: "The Participant has a scheduling conflict.";
        readonly retryable: false;
    };
    readonly instructor_conflict: {
        readonly message: "The Instructor has a scheduling conflict.";
        readonly retryable: false;
    };
    readonly course_full: {
        readonly message: "The Course has no available seats.";
        readonly retryable: false;
    };
    readonly duplicate_active_enrollment: {
        readonly message: "An active Enrollment already exists.";
        readonly retryable: false;
    };
    readonly stale_version: {
        readonly message: "The record changed; refresh it before retrying.";
        readonly retryable: false;
    };
    readonly concurrent_modification: {
        readonly message: "The record is being modified; retry the operation.";
        readonly retryable: true;
    };
    readonly invalid_transition: {
        readonly message: "The requested state change is not allowed.";
        readonly retryable: false;
    };
    readonly blocked_relationship: {
        readonly message: "The relationship blocks this action.";
        readonly retryable: false;
    };
    readonly expired: {
        readonly message: "The request has expired.";
        readonly retryable: false;
    };
    readonly unavailable: {
        readonly message: "The requested option is unavailable.";
        readonly retryable: false;
    };
    readonly idempotency_conflict: {
        readonly message: "The request key was already used.";
        readonly retryable: false;
    };
    readonly operation_too_large: {
        readonly message: "The operation is too large.";
        readonly retryable: false;
    };
    readonly audit_integrity_violation: {
        readonly message: "The operation could not be completed.";
        readonly retryable: false;
    };
    readonly internal: {
        readonly message: "The operation could not be completed.";
        readonly retryable: true;
    };
};
export declare const CommandErrorDetailsSchema: z.ZodObject<{
    field: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodEnum<{
        malformed: "malformed";
        required: "required";
        out_of_range: "out_of_range";
        unsupported: "unsupported";
        conflict: "conflict";
    }>>;
    resourceKind: z.ZodOptional<z.ZodEnum<{
        instructor: "instructor";
        participant: "participant";
        booking: "booking";
        course: "course";
        course_enrollment: "course_enrollment";
    }>>;
}, z.core.$strict>;
export type CommandErrorDetails = z.output<typeof CommandErrorDetailsSchema>;
export declare const CommandErrorTransportSchema: z.ZodObject<{
    code: z.ZodEnum<{
        unauthorized: "unauthorized";
        forbidden: "forbidden";
        validation: "validation";
        insufficient_funds: "insufficient_funds";
        payment_required: "payment_required";
        resource_conflict: "resource_conflict";
        participant_conflict: "participant_conflict";
        instructor_conflict: "instructor_conflict";
        course_full: "course_full";
        duplicate_active_enrollment: "duplicate_active_enrollment";
        stale_version: "stale_version";
        concurrent_modification: "concurrent_modification";
        invalid_transition: "invalid_transition";
        blocked_relationship: "blocked_relationship";
        expired: "expired";
        unavailable: "unavailable";
        idempotency_conflict: "idempotency_conflict";
        operation_too_large: "operation_too_large";
        audit_integrity_violation: "audit_integrity_violation";
        internal: "internal";
    }>;
    message: z.ZodString;
    retryable: z.ZodBoolean;
    correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    currentRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<AggregateRevision, number>>>;
    details: z.ZodOptional<z.ZodObject<{
        field: z.ZodOptional<z.ZodString>;
        reason: z.ZodOptional<z.ZodEnum<{
            malformed: "malformed";
            required: "required";
            out_of_range: "out_of_range";
            unsupported: "unsupported";
            conflict: "conflict";
        }>>;
        resourceKind: z.ZodOptional<z.ZodEnum<{
            instructor: "instructor";
            participant: "participant";
            booking: "booking";
            course: "course";
            course_enrollment: "course_enrollment";
        }>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type CommandErrorTransport = z.output<typeof CommandErrorTransportSchema>;
export interface CanonicalCommandErrorOptions {
    readonly correlationId: CorrelationId;
    readonly currentRevision?: AggregateRevision;
    readonly details?: CommandErrorDetails;
}
export declare class CanonicalCommandError extends Error {
    readonly code: CommandErrorCode;
    readonly retryable: boolean;
    readonly correlationId: CorrelationId;
    readonly currentRevision?: AggregateRevision;
    readonly details?: CommandErrorDetails;
    constructor(code: CommandErrorCode, options: CanonicalCommandErrorOptions);
    toTransport(): CommandErrorTransport;
}
export declare function toCommandErrorTransport(error: unknown, fallbackCorrelationId: CorrelationId): CommandErrorTransport;
