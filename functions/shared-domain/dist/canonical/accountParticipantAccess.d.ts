import { z } from 'zod';
import { type AccountId, type InstructorId, type ParticipantId, type ParticipantManagementId } from './identifiers';
import { type CanonicalTimestamp } from './primitives';
export declare const CanonicalRecordMetadataSchema: z.ZodObject<{
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type CanonicalRecordMetadata = z.output<typeof CanonicalRecordMetadataSchema>;
export declare const AccountSchema: z.ZodObject<{
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
    accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    lifecycle: z.ZodDiscriminatedUnion<[z.ZodObject<{
        status: z.ZodLiteral<"active">;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"disabled">;
        disabledAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>], "status">;
}, z.core.$strict>;
export type Account = Readonly<z.output<typeof AccountSchema>>;
export declare const ParticipantSchema: z.ZodObject<{
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    displayName: z.ZodString;
    age: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"birth_date">;
        birthDate: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"age_years">;
        years: z.ZodNumber;
    }, z.core.$strict>], "kind">;
    skillLevel: z.ZodString;
    discipline: z.ZodEnum<{
        ski: "ski";
        snowboard: "snowboard";
    }>;
    instructorComment: z.ZodOptional<z.ZodString>;
    management: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"unmanaged_guest">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"managed">;
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
    }, z.core.$strict>], "kind">;
    lifecycle: z.ZodDiscriminatedUnion<[z.ZodObject<{
        status: z.ZodLiteral<"active">;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"archived">;
        archivedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>], "status">;
}, z.core.$strict>;
export type Participant = Readonly<z.output<typeof ParticipantSchema>>;
export declare const ParticipantManagementSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    status: z.ZodLiteral<"active">;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
    participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
    accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    role: z.ZodLiteral<"owner">;
    authority: z.ZodEnum<{
        parent_guardian: "parent_guardian";
        self: "self";
    }>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"ended">;
    endedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
    participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
    accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    role: z.ZodLiteral<"owner">;
    authority: z.ZodEnum<{
        parent_guardian: "parent_guardian";
        self: "self";
    }>;
}, z.core.$strict>], "status">;
export type ParticipantManagement = Readonly<z.output<typeof ParticipantManagementSchema>>;
export declare const ParticipantManagementActiveOwnerGuardSchema: z.ZodObject<{
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
    managementRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
    correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
}, z.core.$strict>;
export type ParticipantManagementActiveOwnerGuard = Readonly<z.output<typeof ParticipantManagementActiveOwnerGuardSchema>>;
export declare const InstructorRelationshipSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    status: z.ZodLiteral<"active">;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
    instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor_relationship">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
    basis: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"confirmed_booking">;
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"confirmed_course_enrollment">;
        courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"administration_assignment">;
        assignedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"guardian_permission">;
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
        grantedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>], "kind">;
    validFrom: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    expiresAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"revoked">;
    revokedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    revokedBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"participant_manager">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"administrator">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>], "kind">;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
    instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor_relationship">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
    basis: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"confirmed_booking">;
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"confirmed_course_enrollment">;
        courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"administration_assignment">;
        assignedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"guardian_permission">;
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
        grantedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>], "kind">;
    validFrom: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    expiresAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"expired">;
    expiredAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
    instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor_relationship">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
    basis: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"confirmed_booking">;
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"confirmed_course_enrollment">;
        courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"administration_assignment">;
        assignedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"guardian_permission">;
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
        grantedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>], "kind">;
    validFrom: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    expiresAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>], "status">;
export type InstructorRelationship = Readonly<z.output<typeof InstructorRelationshipSchema>>;
export declare const ParticipantBlockSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    status: z.ZodLiteral<"active">;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
    participantBlockId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_block">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
    createdBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"participant_manager">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"instructor">;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
    }, z.core.$strict>], "kind">;
    reason: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"removed">;
    removedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    removedBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"participant_manager">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"instructor">;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
    }, z.core.$strict>], "kind">;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
    participantBlockId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_block">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
    createdBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"participant_manager">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"instructor">;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
    }, z.core.$strict>], "kind">;
    reason: z.ZodString;
}, z.core.$strict>], "status">;
export type ParticipantBlock = Readonly<z.output<typeof ParticipantBlockSchema>>;
export declare const BookingScopedParticipantAccessEvidenceSchema: z.ZodObject<{
    source: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"booking">;
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"course_day">;
        courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
        courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_day">, string>>;
    }, z.core.$strict>], "kind">;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
    validFrom: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    validUntil: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>;
export type BookingScopedParticipantAccessEvidence = Readonly<z.output<typeof BookingScopedParticipantAccessEvidenceSchema>>;
export declare const ParticipantAccessTopologySchema: z.ZodObject<{
    accounts: z.ZodArray<z.ZodObject<{
        revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        createdAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        updatedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        audit: z.ZodObject<{
            createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
        }, z.core.$strict>;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        lifecycle: z.ZodDiscriminatedUnion<[z.ZodObject<{
            status: z.ZodLiteral<"active">;
        }, z.core.$strict>, z.ZodObject<{
            status: z.ZodLiteral<"disabled">;
            disabledAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>], "status">;
    }, z.core.$strict>>;
    participants: z.ZodArray<z.ZodObject<{
        revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        createdAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        updatedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        audit: z.ZodObject<{
            createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
        }, z.core.$strict>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
        displayName: z.ZodString;
        age: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"birth_date">;
            birthDate: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"age_years">;
            years: z.ZodNumber;
        }, z.core.$strict>], "kind">;
        skillLevel: z.ZodString;
        discipline: z.ZodEnum<{
            ski: "ski";
            snowboard: "snowboard";
        }>;
        instructorComment: z.ZodOptional<z.ZodString>;
        management: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"unmanaged_guest">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"managed">;
            participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
        }, z.core.$strict>], "kind">;
        lifecycle: z.ZodDiscriminatedUnion<[z.ZodObject<{
            status: z.ZodLiteral<"active">;
        }, z.core.$strict>, z.ZodObject<{
            status: z.ZodLiteral<"archived">;
            archivedAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>], "status">;
    }, z.core.$strict>>;
    participantManagement: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        status: z.ZodLiteral<"active">;
        revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        createdAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        updatedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        audit: z.ZodObject<{
            createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
        }, z.core.$strict>;
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
        role: z.ZodLiteral<"owner">;
        authority: z.ZodEnum<{
            parent_guardian: "parent_guardian";
            self: "self";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"ended">;
        endedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        createdAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        updatedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        audit: z.ZodObject<{
            createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
        }, z.core.$strict>;
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
        role: z.ZodLiteral<"owner">;
        authority: z.ZodEnum<{
            parent_guardian: "parent_guardian";
            self: "self";
        }>;
    }, z.core.$strict>], "status">>;
    activeOwnerGuards: z.ZodArray<z.ZodObject<{
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
        managementRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        updatedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>>;
    instructorRelationships: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        status: z.ZodLiteral<"active">;
        revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        createdAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        updatedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        audit: z.ZodObject<{
            createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
        }, z.core.$strict>;
        instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor_relationship">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
        basis: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"confirmed_booking">;
            bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"confirmed_course_enrollment">;
            courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"administration_assignment">;
            assignedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"guardian_permission">;
            participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
            grantedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        }, z.core.$strict>], "kind">;
        validFrom: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        expiresAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"revoked">;
        revokedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        revokedBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"participant_manager">;
            accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
            participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"administrator">;
            accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        }, z.core.$strict>], "kind">;
        revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        createdAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        updatedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        audit: z.ZodObject<{
            createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
        }, z.core.$strict>;
        instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor_relationship">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
        basis: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"confirmed_booking">;
            bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"confirmed_course_enrollment">;
            courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"administration_assignment">;
            assignedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"guardian_permission">;
            participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
            grantedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        }, z.core.$strict>], "kind">;
        validFrom: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        expiresAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"expired">;
        expiredAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        createdAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        updatedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        audit: z.ZodObject<{
            createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
        }, z.core.$strict>;
        instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor_relationship">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
        basis: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"confirmed_booking">;
            bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"confirmed_course_enrollment">;
            courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"administration_assignment">;
            assignedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"guardian_permission">;
            participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
            grantedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        }, z.core.$strict>], "kind">;
        validFrom: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        expiresAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>], "status">>;
    participantBlocks: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        status: z.ZodLiteral<"active">;
        revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        createdAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        updatedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        audit: z.ZodObject<{
            createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
        }, z.core.$strict>;
        participantBlockId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_block">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
        createdBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"participant_manager">;
            accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
            participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"instructor">;
            instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
        }, z.core.$strict>], "kind">;
        reason: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"removed">;
        removedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        removedBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"participant_manager">;
            accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
            participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"instructor">;
            instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
        }, z.core.$strict>], "kind">;
        revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        createdAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        updatedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        audit: z.ZodObject<{
            createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
        }, z.core.$strict>;
        participantBlockId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_block">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
        createdBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"participant_manager">;
            accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
            participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant_management">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"instructor">;
            instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
        }, z.core.$strict>], "kind">;
        reason: z.ZodString;
    }, z.core.$strict>], "status">>;
}, z.core.$strict>;
export type ParticipantAccessTopology = Readonly<z.output<typeof ParticipantAccessTopologySchema>>;
export type ParticipantManagementAccessDecision = Readonly<{
    allowed: true;
    authority: 'self' | 'parent_guardian';
    participantManagementId: ParticipantManagementId;
}> | Readonly<{
    allowed: false;
    reason: 'unauthorized' | 'account_inactive' | 'participant_inactive';
}>;
export declare function evaluateParticipantManagementAccess(topology: ParticipantAccessTopology, request: Readonly<{
    accountId: AccountId;
    participantId: ParticipantId;
}>): ParticipantManagementAccessDecision;
export type InstructorParticipantAccessDecision = Readonly<{
    allowed: true;
    scope: 'relationship';
}> | Readonly<{
    allowed: true;
    scope: 'booking_scoped';
    blockedForNewActivity: boolean;
    source: BookingScopedParticipantAccessEvidence['source'];
}> | Readonly<{
    allowed: false;
    reason: 'unauthorized' | 'participant_inactive' | 'blocked';
}>;
export declare function evaluateInstructorParticipantAccess(topology: ParticipantAccessTopology, request: Readonly<{
    instructorId: InstructorId;
    participantId: ParticipantId;
    at: CanonicalTimestamp;
    bookingScopedEvidence: readonly BookingScopedParticipantAccessEvidence[];
}>): InstructorParticipantAccessDecision;
