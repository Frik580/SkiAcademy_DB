import { z } from 'zod';
import { type AccountId, type ActorRef, type ParticipantId } from './identifiers';
export declare const BOOKING_ORIGINS: readonly ["account", "guest", "instructor", "admin"];
export type BookingOriginValue = (typeof BOOKING_ORIGINS)[number];
export declare const BOOKING_PARTY_KINDS: readonly ["individual", "family_group"];
export type BookingPartyKind = (typeof BOOKING_PARTY_KINDS)[number];
export declare const BOOKING_PARTY_MIN: 1;
export declare const BOOKING_PARTY_MAX: 8;
export declare const BOOKING_LIFECYCLE_STATUSES: readonly ["pending", "confirmed", "pending_cancellation", "cancelled", "completed", "no_show"];
export type BookingLifecycleStatus = (typeof BOOKING_LIFECYCLE_STATUSES)[number];
export declare const BOOKING_CANCELLATION_REASON_CODES: readonly ["reservation_expired", "guest_cancelled", "account_owner_cancelled", "administrator_cancelled", "incomplete_payment", "booking_change_request", "system_expired"];
export type BookingCancellationReasonCode = (typeof BOOKING_CANCELLATION_REASON_CODES)[number];
export declare const BOOKING_PROPOSAL_STATUSES: readonly ["open", "accepted", "declined", "expired", "unavailable", "cancelled"];
export type BookingProposalStatus = (typeof BOOKING_PROPOSAL_STATUSES)[number];
export declare const BOOKING_PROPOSAL_CANCELLATION_REASON_CODES: readonly ["instructor_withdrawn", "instructor_blocked_by_owner"];
export type BookingProposalCancellationReasonCode = (typeof BOOKING_PROPOSAL_CANCELLATION_REASON_CODES)[number];
export declare const BOOKING_CHANGE_REQUEST_STATUSES: readonly ["open", "resolved", "cancelled"];
export type BookingChangeRequestStatus = (typeof BOOKING_CHANGE_REQUEST_STATUSES)[number];
export declare const BOOKING_CHANGE_REQUEST_TYPES: readonly ["instructor_unavailable"];
export type BookingChangeRequestType = (typeof BOOKING_CHANGE_REQUEST_TYPES)[number];
export declare const BOOKING_CHANGE_REQUEST_RESOLUTIONS: readonly ["rescheduled", "booking_cancelled", "no_change"];
export type BookingChangeRequestResolution = (typeof BOOKING_CHANGE_REQUEST_RESOLUTIONS)[number];
export declare const BookingOriginSchema: z.ZodEnum<{
    admin: "admin";
    account: "account";
    instructor: "instructor";
    guest: "guest";
}>;
export declare const BookingPartyKindSchema: z.ZodEnum<{
    individual: "individual";
    family_group: "family_group";
}>;
export declare const BookingLifecycleStatusSchema: z.ZodEnum<{
    pending: "pending";
    confirmed: "confirmed";
    cancelled: "cancelled";
    completed: "completed";
    pending_cancellation: "pending_cancellation";
    no_show: "no_show";
}>;
export declare const BookingCancellationReasonCodeSchema: z.ZodEnum<{
    booking_change_request: "booking_change_request";
    reservation_expired: "reservation_expired";
    guest_cancelled: "guest_cancelled";
    account_owner_cancelled: "account_owner_cancelled";
    administrator_cancelled: "administrator_cancelled";
    incomplete_payment: "incomplete_payment";
    system_expired: "system_expired";
}>;
export declare const BookingProposalStatusSchema: z.ZodEnum<{
    cancelled: "cancelled";
    expired: "expired";
    open: "open";
    accepted: "accepted";
    declined: "declined";
    unavailable: "unavailable";
}>;
export declare const BookingProposalCancellationReasonCodeSchema: z.ZodEnum<{
    instructor_withdrawn: "instructor_withdrawn";
    instructor_blocked_by_owner: "instructor_blocked_by_owner";
}>;
export declare const BookingChangeRequestStatusSchema: z.ZodEnum<{
    cancelled: "cancelled";
    open: "open";
    resolved: "resolved";
}>;
export declare const BookingChangeRequestTypeSchema: z.ZodEnum<{
    instructor_unavailable: "instructor_unavailable";
}>;
export declare const BookingChangeRequestResolutionSchema: z.ZodEnum<{
    rescheduled: "rescheduled";
    booking_cancelled: "booking_cancelled";
    no_change: "no_change";
}>;
export declare const LEGACY_BOOKING_FIELD_NAMES: readonly ["userId", "isGuest", "date", "time", "durationHours", "duration", "courseId", "coursePrice", "instructorName", "instructorAvatar", "difficulty", "totalPrice", "enrollmentId", "availableSeats", "syntheticInstructorId", "booking_course"];
export declare const PROPOSAL_FORBIDDEN_RESERVATION_FIELD_NAMES: readonly ["resourceClaimId", "resourceClaimIds", "claimId", "claimIds", "reservationClaimId", "reservationExpiresAt", "availabilitySlotId", "hourLockId"];
export declare const CHANGE_REQUEST_FORBIDDEN_BOOKING_MUTATION_FIELD_NAMES: readonly ["bookingStatus", "targetBookingStatus", "nextBookingStatus", "lifecyclePatch", "patchBooking", "setStatus", "transitionTo"];
export declare function deriveBookingPartyKind(participantCount: number): BookingPartyKind;
export declare function isSyntheticCourseInstructorId(value: string): boolean;
export declare function containsLegacyBookingFields(input: unknown): boolean;
export declare function proposalCarriesNoReservationAuthority(input: unknown): boolean;
export declare function changeRequestCarriesNoDirectBookingMutation(input: unknown): boolean;
export declare function validateBookingAttribution(attribution: Readonly<{
    bookingOrigin: BookingOriginValue;
    bookedBy: ActorRef;
}>, context: z.RefinementCtx, basePath?: (string | number)[]): void;
export declare function validateBookingPartyParticipantIds(participantIds: readonly ParticipantId[], context: z.RefinementCtx, basePath?: (string | number)[]): void;
export declare function validateBookingPartyKindConsistency(party: Readonly<{
    kind: BookingPartyKind;
    participantIds: readonly ParticipantId[];
}>, context: z.RefinementCtx, basePath?: (string | number)[]): void;
export declare function validateServicePartySubset(partyParticipantIds: readonly ParticipantId[], serviceParticipantIds: readonly ParticipantId[], context: z.RefinementCtx, basePath?: (string | number)[]): void;
export declare function validateBookingOriginLifecycleConsistency(attribution: Readonly<{
    bookingOrigin: BookingOriginValue;
}>, lifecycle: Readonly<{
    status: BookingLifecycleStatus;
}>, context: z.RefinementCtx): void;
export declare const ImmutableBookingAttributionSchema: z.ZodObject<{
    bookingOrigin: z.ZodEnum<{
        admin: "admin";
        account: "account";
        instructor: "instructor";
        guest: "guest";
    }>;
    bookedBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"account">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"guest">;
        guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"guest_subject">, string>>;
    }, z.core.$strict>], "kind">;
}, z.core.$strict>;
export type ImmutableBookingAttribution = Readonly<z.output<typeof ImmutableBookingAttributionSchema>>;
export declare const BookingPartySchema: z.ZodObject<{
    kind: z.ZodEnum<{
        individual: "individual";
        family_group: "family_group";
    }>;
    participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>>;
}, z.core.$strict>;
export type BookingParty = Readonly<z.output<typeof BookingPartySchema>>;
export declare const BookingServicePartySchema: z.ZodObject<{
    participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>>;
    frozenAt: z.ZodOptional<z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type BookingServiceParty = Readonly<z.output<typeof BookingServicePartySchema>>;
export declare const BookingOccurrenceSchema: z.ZodObject<{
    occurrenceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>;
    instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
    interval: z.ZodObject<{
        startsAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        endsAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>;
    timeZone: z.ZodString;
    scheduleRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    serviceParty: z.ZodObject<{
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>>;
        frozenAt: z.ZodOptional<z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type BookingOccurrence = Readonly<z.output<typeof BookingOccurrenceSchema>>;
declare const BookingLifecycleSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    status: z.ZodLiteral<"pending">;
    reservationExpiresAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"confirmed">;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"pending_cancellation">;
    requestedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"cancelled">;
    cancelledAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    reasonCode: z.ZodEnum<{
        booking_change_request: "booking_change_request";
        reservation_expired: "reservation_expired";
        guest_cancelled: "guest_cancelled";
        account_owner_cancelled: "account_owner_cancelled";
        administrator_cancelled: "administrator_cancelled";
        incomplete_payment: "incomplete_payment";
        system_expired: "system_expired";
    }>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"completed">;
    completedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"no_show">;
    noShowAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>], "status">;
export type BookingLifecycle = Readonly<z.output<typeof BookingLifecycleSchema>>;
export declare const BookingSchema: z.ZodObject<{
    bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
    attribution: z.ZodObject<{
        bookingOrigin: z.ZodEnum<{
            admin: "admin";
            account: "account";
            instructor: "instructor";
            guest: "guest";
        }>;
        bookedBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"account">;
            accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"guest">;
            guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"guest_subject">, string>>;
        }, z.core.$strict>], "kind">;
    }, z.core.$strict>;
    party: z.ZodObject<{
        kind: z.ZodEnum<{
            individual: "individual";
            family_group: "family_group";
        }>;
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>>;
    }, z.core.$strict>;
    occurrence: z.ZodObject<{
        occurrenceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
        interval: z.ZodObject<{
            startsAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
            endsAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>;
        timeZone: z.ZodString;
        scheduleRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        serviceParty: z.ZodObject<{
            participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>>;
            frozenAt: z.ZodOptional<z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>;
    }, z.core.$strict>;
    lifecycle: z.ZodDiscriminatedUnion<[z.ZodObject<{
        status: z.ZodLiteral<"pending">;
        reservationExpiresAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"confirmed">;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"pending_cancellation">;
        requestedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"cancelled">;
        cancelledAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        reasonCode: z.ZodEnum<{
            booking_change_request: "booking_change_request";
            reservation_expired: "reservation_expired";
            guest_cancelled: "guest_cancelled";
            account_owner_cancelled: "account_owner_cancelled";
            administrator_cancelled: "administrator_cancelled";
            incomplete_payment: "incomplete_payment";
            system_expired: "system_expired";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"completed">;
        completedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"no_show">;
        noShowAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>], "status">;
    paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"payment">, string>>;
    payerAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>>;
    clientSelfServiceRescheduleConsumedAt: z.ZodOptional<z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>>;
    archival: z.ZodOptional<z.ZodObject<{
        isDeleted: z.ZodLiteral<true>;
        deletedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>>;
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
export type Booking = Readonly<z.output<typeof BookingSchema>>;
export declare const BookingProposalSchema: z.ZodObject<{
    proposalId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking_proposal">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
    proposedService: z.ZodObject<{
        interval: z.ZodObject<{
            startsAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
            endsAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>;
        timeZone: z.ZodString;
    }, z.core.$strict>;
    lifecycle: z.ZodDiscriminatedUnion<[z.ZodObject<{
        status: z.ZodLiteral<"open">;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"accepted">;
        acceptedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        resultingBookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"declined">;
        declinedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"expired">;
        expiredAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"unavailable">;
        unavailableAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"cancelled">;
        cancelledAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        reasonCode: z.ZodEnum<{
            instructor_withdrawn: "instructor_withdrawn";
            instructor_blocked_by_owner: "instructor_blocked_by_owner";
        }>;
    }, z.core.$strict>], "status">;
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
export type BookingProposal = Readonly<z.output<typeof BookingProposalSchema>>;
export declare const BookingChangeRequestSchema: z.ZodObject<{
    requestId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking_change_request">, string>>;
    bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
    requestType: z.ZodEnum<{
        instructor_unavailable: "instructor_unavailable";
    }>;
    reason: z.ZodString;
    lifecycle: z.ZodDiscriminatedUnion<[z.ZodObject<{
        status: z.ZodLiteral<"open">;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"resolved">;
        resolvedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        resolution: z.ZodEnum<{
            rescheduled: "rescheduled";
            booking_cancelled: "booking_cancelled";
            no_change: "no_change";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"cancelled">;
        cancelledAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>], "status">;
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
export type BookingChangeRequest = Readonly<z.output<typeof BookingChangeRequestSchema>>;
export declare function bookingOccurrenceIdentityIsPresent(occurrence: Pick<BookingOccurrence, 'occurrenceId'>): boolean;
export declare function proposalTargetsExactlyOneParticipant(proposal: Pick<BookingProposal, 'participantId'>): boolean;
export declare function changeRequestLifecycleSeparateFromBookingLifecycle(changeRequest: Pick<BookingChangeRequest, 'lifecycle'>, booking: Pick<Booking, 'lifecycle'>): boolean;
export declare function payerAccountDistinctFromParticipants(payerAccountId: AccountId | undefined, participantIds: readonly ParticipantId[]): boolean;
export declare const LegacyBookingShapeSchema: z.ZodObject<{
    userId: z.ZodOptional<z.ZodUnknown>;
    isGuest: z.ZodOptional<z.ZodUnknown>;
    date: z.ZodOptional<z.ZodUnknown>;
    time: z.ZodOptional<z.ZodUnknown>;
    durationHours: z.ZodOptional<z.ZodUnknown>;
    duration: z.ZodOptional<z.ZodUnknown>;
    courseId: z.ZodOptional<z.ZodUnknown>;
    coursePrice: z.ZodOptional<z.ZodUnknown>;
    instructorName: z.ZodOptional<z.ZodUnknown>;
    instructorAvatar: z.ZodOptional<z.ZodUnknown>;
    difficulty: z.ZodOptional<z.ZodUnknown>;
    totalPrice: z.ZodOptional<z.ZodUnknown>;
    enrollmentId: z.ZodOptional<z.ZodUnknown>;
    availableSeats: z.ZodOptional<z.ZodUnknown>;
    syntheticInstructorId: z.ZodOptional<z.ZodUnknown>;
    booking_course: z.ZodOptional<z.ZodUnknown>;
    status: z.ZodOptional<z.ZodUnknown>;
    instructorId: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strict>;
export declare const BookingProposalReservationShapeSchema: z.ZodObject<{
    resourceClaimId: z.ZodOptional<z.ZodUnknown>;
    resourceClaimIds: z.ZodOptional<z.ZodUnknown>;
    claimId: z.ZodOptional<z.ZodUnknown>;
    claimIds: z.ZodOptional<z.ZodUnknown>;
    reservationClaimId: z.ZodOptional<z.ZodUnknown>;
    reservationExpiresAt: z.ZodOptional<z.ZodUnknown>;
    availabilitySlotId: z.ZodOptional<z.ZodUnknown>;
    hourLockId: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strict>;
export declare const BookingChangeRequestMutationShapeSchema: z.ZodObject<{
    bookingStatus: z.ZodOptional<z.ZodUnknown>;
    targetBookingStatus: z.ZodOptional<z.ZodUnknown>;
    nextBookingStatus: z.ZodOptional<z.ZodUnknown>;
    lifecyclePatch: z.ZodOptional<z.ZodUnknown>;
    patchBooking: z.ZodOptional<z.ZodUnknown>;
    setStatus: z.ZodOptional<z.ZodUnknown>;
    transitionTo: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strict>;
export {};
