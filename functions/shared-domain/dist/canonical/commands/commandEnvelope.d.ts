import { z } from 'zod';
import { type CommandKind } from './commandKinds';
import { CommandContextSchema } from './commandContext';
import { CommandIntentSchemaByKind } from './commandIntents';
export declare const CommandKindSchema: z.ZodEnum<{
    create_confirmed_booking: "create_confirmed_booking";
    create_guest_booking_request: "create_guest_booking_request";
    confirm_guest_booking: "confirm_guest_booking";
    link_guest_booking_to_account: "link_guest_booking_to_account";
    request_booking_cancellation: "request_booking_cancellation";
    withdraw_booking_cancellation_request: "withdraw_booking_cancellation_request";
    resolve_booking_cancellation: "resolve_booking_cancellation";
    reschedule_booking: "reschedule_booking";
    change_booking_instructor: "change_booking_instructor";
    change_booking_duration: "change_booking_duration";
    change_booking_party: "change_booking_party";
    rollback_unpaid_booking_party_additions: "rollback_unpaid_booking_party_additions";
    record_booking_attendance: "record_booking_attendance";
    complete_booking: "complete_booking";
    record_booking_no_show: "record_booking_no_show";
    create_course_enrollments: "create_course_enrollments";
    transfer_course_enrollment: "transfer_course_enrollment";
    withdraw_course_enrollment: "withdraw_course_enrollment";
    request_course_enrollment_cancellation: "request_course_enrollment_cancellation";
    resolve_course_enrollment_cancellation: "resolve_course_enrollment_cancellation";
    create_booking_proposal: "create_booking_proposal";
    accept_booking_proposal: "accept_booking_proposal";
    cancel_booking_proposal: "cancel_booking_proposal";
    expire_booking_proposal: "expire_booking_proposal";
    create_booking_change_request: "create_booking_change_request";
    withdraw_booking_change_request: "withdraw_booking_change_request";
    resolve_booking_change_request: "resolve_booking_change_request";
    expire_guest_reservation: "expire_guest_reservation";
    enforce_payment_start_gate: "enforce_payment_start_gate";
    resolve_attendance_outcome: "resolve_attendance_outcome";
    create_participant: "create_participant";
    update_participant_profile: "update_participant_profile";
    assign_participant_management: "assign_participant_management";
    revoke_participant_management: "revoke_participant_management";
    create_instructor_relationship: "create_instructor_relationship";
    revoke_instructor_relationship: "revoke_instructor_relationship";
    block_participant: "block_participant";
    unblock_participant: "unblock_participant";
    record_provider_payment_event: "record_provider_payment_event";
    record_manual_wallet_funding: "record_manual_wallet_funding";
    adjust_service_price: "adjust_service_price";
    record_financial_correction: "record_financial_correction";
    record_audit_correction: "record_audit_correction";
    create_course_day: "create_course_day";
    reassign_course_day_instructor: "reassign_course_day_instructor";
}>;
export declare const CommandEnvelopeSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"create_confirmed_booking" | "create_guest_booking_request" | "confirm_guest_booking" | "link_guest_booking_to_account" | "request_booking_cancellation" | "withdraw_booking_cancellation_request" | "resolve_booking_cancellation" | "reschedule_booking" | "change_booking_instructor" | "change_booking_duration" | "change_booking_party" | "rollback_unpaid_booking_party_additions" | "record_booking_attendance" | "complete_booking" | "record_booking_no_show" | "create_course_enrollments" | "transfer_course_enrollment" | "withdraw_course_enrollment" | "request_course_enrollment_cancellation" | "resolve_course_enrollment_cancellation" | "create_booking_proposal" | "accept_booking_proposal" | "cancel_booking_proposal" | "expire_booking_proposal" | "create_booking_change_request" | "withdraw_booking_change_request" | "resolve_booking_change_request" | "expire_guest_reservation" | "enforce_payment_start_gate" | "resolve_attendance_outcome" | "create_participant" | "update_participant_profile" | "assign_participant_management" | "revoke_participant_management" | "create_instructor_relationship" | "revoke_instructor_relationship" | "block_participant" | "unblock_participant" | "record_provider_payment_event" | "record_manual_wallet_funding" | "adjust_service_price" | "record_financial_correction" | "record_audit_correction" | "create_course_day" | "reassign_course_day_instructor">;
    context: z.ZodObject<{
        actor: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"account">;
            accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"guest">;
            guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"guest_subject">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"system">;
            systemActorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"system_actor">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"provider">;
            providerId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"provider">, string>>;
        }, z.core.$strict>], "kind">;
        exercisedCapability: z.ZodEnum<{
            instructor: "instructor";
            guest: "guest";
            system: "system";
            account_owner: "account_owner";
            parent_guardian: "parent_guardian";
            administrator: "administrator";
            provider_callback: "provider_callback";
        }>;
        idempotencyKey: z.ZodString;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"correlation">, string>>;
        causationId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"causation">, string>>>;
        expectedRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        source: z.ZodEnum<{
            provider_callback: "provider_callback";
            client_callable: "client_callable";
            admin_callable: "admin_callable";
            guest_callable: "guest_callable";
            scheduler: "scheduler";
            system_reconciliation: "system_reconciliation";
        }>;
        transportMetadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        calendarInput: z.ZodOptional<z.ZodObject<{
            localDate: z.ZodString;
            localTime: z.ZodString;
            durationMinutes: z.ZodNumber;
        }, z.core.$strict>>;
        timezone: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    intent: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course_enrollment">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingProposalId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_proposal">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingChangeRequestId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_change_request">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        displayName: z.ZodOptional<z.ZodString>;
        age: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"birth_date">;
            birthDate: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"age_years">;
            years: z.ZodNumber;
        }, z.core.$strict>], "kind">>;
        skillLevel: z.ZodOptional<z.ZodString>;
        discipline: z.ZodOptional<z.ZodEnum<{
            ski: "ski";
            snowboard: "snowboard";
        }>>;
        instructorComment: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        sourceKind: z.ZodEnum<{
            provider: "provider";
            cash: "cash";
            bank_transfer: "bank_transfer";
            manual_external: "manual_external";
        }>;
        providerKind: z.ZodOptional<z.ZodString>;
        providerEventId: z.ZodOptional<z.ZodString>;
        providerTransactionRef: z.ZodOptional<z.ZodString>;
        manualReference: z.ZodOptional<z.ZodString>;
        payerAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
    }, z.core.$strict> | z.ZodObject<{
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        newPrice: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        fundingAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodDiscriminatedUnion<[z.ZodObject<{
        correctionKind: z.ZodLiteral<"admin_refund">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        expectedWalletRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        manualExternalReference: z.ZodOptional<z.ZodString>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        correctionKind: z.ZodLiteral<"write_off">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        correctionKind: z.ZodLiteral<"reverse_write_off">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        correctionKind: z.ZodLiteral<"compensating_event">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        correctsEventId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"monetary_event">, string>>;
        paymentEffect: z.ZodObject<{
            priceDelta: z.ZodOptional<z.ZodNumber>;
            paidAmountDelta: z.ZodOptional<z.ZodNumber>;
            refundedAmountDelta: z.ZodOptional<z.ZodNumber>;
            settledAmountDelta: z.ZodOptional<z.ZodNumber>;
            writtenOffAmountDelta: z.ZodOptional<z.ZodNumber>;
            outstandingAmountDelta: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        walletBalanceDelta: z.ZodOptional<z.ZodNumber>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        expectedWalletRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>], "correctionKind"> | z.ZodDiscriminatedUnion<[z.ZodObject<{
        operation: z.ZodLiteral<"reconcile_payment">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        operation: z.ZodLiteral<"reconcile_wallet">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        operation: z.ZodLiteral<"rebuild_payment_projection">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        operation: z.ZodLiteral<"rebuild_wallet_projection">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>;
        expectedWalletRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>], "operation"> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>;
        payerAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        decision: z.ZodEnum<{
            approve: "approve";
            reject: "reject";
            direct_cancel: "direct_cancel";
        }>;
        refundAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
        manualExternalReference: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        fundingAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        durationMinutes: z.ZodNumber;
        fundingAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        participantIdsToAdd: z.ZodOptional<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>>;
        participantIdsToRemove: z.ZodOptional<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>>;
        refundPercentBasisPoints: z.ZodOptional<z.ZodNumber>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        attendanceStatus: z.ZodEnum<{
            present: "present";
            absent: "absent";
        }>;
        expectedAttendanceRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course">, string>>;
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingProposalId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_proposal">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingChangeRequestId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_change_request">, string>>;
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        reason: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        bookingChangeRequestId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_change_request">, string>>;
        resolution: z.ZodEnum<{
            rescheduled: "rescheduled";
            booking_cancelled: "booking_cancelled";
            no_change: "no_change";
        }>;
        refundAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        subjectKind: z.ZodEnum<{
            booking: "booking";
            course_enrollment: "course_enrollment";
        }>;
        subjectId: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        subjectKind: z.ZodEnum<{
            booking: "booking";
            course_enrollment: "course_enrollment";
        }>;
        subjectId: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
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
    }, z.core.$strict> | z.ZodObject<{
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant_management">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        authority: z.ZodEnum<{
            parent_guardian: "parent_guardian";
            self: "self";
        }>;
    }, z.core.$strict> | z.ZodObject<{
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant_management">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor_relationship">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        basis: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"guardian_permission">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"administration_assignment">;
        }, z.core.$strict>], "kind">;
    }, z.core.$strict> | z.ZodObject<{
        instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor_relationship">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        participantBlockId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant_block">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        reason: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        participantBlockId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant_block">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course_day">, string>>;
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course">, string>>;
        courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course_day">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"create_confirmed_booking" | "create_guest_booking_request" | "confirm_guest_booking" | "link_guest_booking_to_account" | "request_booking_cancellation" | "withdraw_booking_cancellation_request" | "resolve_booking_cancellation" | "reschedule_booking" | "change_booking_instructor" | "change_booking_duration" | "change_booking_party" | "rollback_unpaid_booking_party_additions" | "record_booking_attendance" | "complete_booking" | "record_booking_no_show" | "create_course_enrollments" | "transfer_course_enrollment" | "withdraw_course_enrollment" | "request_course_enrollment_cancellation" | "resolve_course_enrollment_cancellation" | "create_booking_proposal" | "accept_booking_proposal" | "cancel_booking_proposal" | "expire_booking_proposal" | "create_booking_change_request" | "withdraw_booking_change_request" | "resolve_booking_change_request" | "expire_guest_reservation" | "enforce_payment_start_gate" | "resolve_attendance_outcome" | "create_participant" | "update_participant_profile" | "assign_participant_management" | "revoke_participant_management" | "create_instructor_relationship" | "revoke_instructor_relationship" | "block_participant" | "unblock_participant" | "record_provider_payment_event" | "record_manual_wallet_funding" | "adjust_service_price" | "record_financial_correction" | "record_audit_correction" | "create_course_day" | "reassign_course_day_instructor">;
    context: z.ZodObject<{
        actor: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"account">;
            accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"guest">;
            guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"guest_subject">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"system">;
            systemActorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"system_actor">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"provider">;
            providerId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"provider">, string>>;
        }, z.core.$strict>], "kind">;
        exercisedCapability: z.ZodEnum<{
            instructor: "instructor";
            guest: "guest";
            system: "system";
            account_owner: "account_owner";
            parent_guardian: "parent_guardian";
            administrator: "administrator";
            provider_callback: "provider_callback";
        }>;
        idempotencyKey: z.ZodString;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"correlation">, string>>;
        causationId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"causation">, string>>>;
        expectedRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        source: z.ZodEnum<{
            provider_callback: "provider_callback";
            client_callable: "client_callable";
            admin_callable: "admin_callable";
            guest_callable: "guest_callable";
            scheduler: "scheduler";
            system_reconciliation: "system_reconciliation";
        }>;
        transportMetadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        calendarInput: z.ZodOptional<z.ZodObject<{
            localDate: z.ZodString;
            localTime: z.ZodString;
            durationMinutes: z.ZodNumber;
        }, z.core.$strict>>;
        timezone: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    intent: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course_enrollment">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingProposalId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_proposal">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingChangeRequestId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_change_request">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        displayName: z.ZodOptional<z.ZodString>;
        age: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"birth_date">;
            birthDate: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"age_years">;
            years: z.ZodNumber;
        }, z.core.$strict>], "kind">>;
        skillLevel: z.ZodOptional<z.ZodString>;
        discipline: z.ZodOptional<z.ZodEnum<{
            ski: "ski";
            snowboard: "snowboard";
        }>>;
        instructorComment: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        sourceKind: z.ZodEnum<{
            provider: "provider";
            cash: "cash";
            bank_transfer: "bank_transfer";
            manual_external: "manual_external";
        }>;
        providerKind: z.ZodOptional<z.ZodString>;
        providerEventId: z.ZodOptional<z.ZodString>;
        providerTransactionRef: z.ZodOptional<z.ZodString>;
        manualReference: z.ZodOptional<z.ZodString>;
        payerAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
    }, z.core.$strict> | z.ZodObject<{
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        newPrice: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        fundingAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodDiscriminatedUnion<[z.ZodObject<{
        correctionKind: z.ZodLiteral<"admin_refund">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        expectedWalletRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        manualExternalReference: z.ZodOptional<z.ZodString>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        correctionKind: z.ZodLiteral<"write_off">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        correctionKind: z.ZodLiteral<"reverse_write_off">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        correctionKind: z.ZodLiteral<"compensating_event">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        correctsEventId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"monetary_event">, string>>;
        paymentEffect: z.ZodObject<{
            priceDelta: z.ZodOptional<z.ZodNumber>;
            paidAmountDelta: z.ZodOptional<z.ZodNumber>;
            refundedAmountDelta: z.ZodOptional<z.ZodNumber>;
            settledAmountDelta: z.ZodOptional<z.ZodNumber>;
            writtenOffAmountDelta: z.ZodOptional<z.ZodNumber>;
            outstandingAmountDelta: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        walletBalanceDelta: z.ZodOptional<z.ZodNumber>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        expectedWalletRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>], "correctionKind"> | z.ZodDiscriminatedUnion<[z.ZodObject<{
        operation: z.ZodLiteral<"reconcile_payment">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        operation: z.ZodLiteral<"reconcile_wallet">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        operation: z.ZodLiteral<"rebuild_payment_projection">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        operation: z.ZodLiteral<"rebuild_wallet_projection">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>;
        expectedWalletRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>], "operation"> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>;
        payerAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        decision: z.ZodEnum<{
            approve: "approve";
            reject: "reject";
            direct_cancel: "direct_cancel";
        }>;
        refundAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
        manualExternalReference: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        fundingAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        durationMinutes: z.ZodNumber;
        fundingAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        participantIdsToAdd: z.ZodOptional<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>>;
        participantIdsToRemove: z.ZodOptional<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>>;
        refundPercentBasisPoints: z.ZodOptional<z.ZodNumber>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        attendanceStatus: z.ZodEnum<{
            present: "present";
            absent: "absent";
        }>;
        expectedAttendanceRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course">, string>>;
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingProposalId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_proposal">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingChangeRequestId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_change_request">, string>>;
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        reason: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        bookingChangeRequestId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_change_request">, string>>;
        resolution: z.ZodEnum<{
            rescheduled: "rescheduled";
            booking_cancelled: "booking_cancelled";
            no_change: "no_change";
        }>;
        refundAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        subjectKind: z.ZodEnum<{
            booking: "booking";
            course_enrollment: "course_enrollment";
        }>;
        subjectId: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        subjectKind: z.ZodEnum<{
            booking: "booking";
            course_enrollment: "course_enrollment";
        }>;
        subjectId: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
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
    }, z.core.$strict> | z.ZodObject<{
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant_management">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        authority: z.ZodEnum<{
            parent_guardian: "parent_guardian";
            self: "self";
        }>;
    }, z.core.$strict> | z.ZodObject<{
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant_management">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor_relationship">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        basis: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"guardian_permission">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"administration_assignment">;
        }, z.core.$strict>], "kind">;
    }, z.core.$strict> | z.ZodObject<{
        instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor_relationship">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        participantBlockId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant_block">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        reason: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        participantBlockId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant_block">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course_day">, string>>;
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course">, string>>;
        courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course_day">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>, ...z.ZodObject<{
    kind: z.ZodLiteral<"create_confirmed_booking" | "create_guest_booking_request" | "confirm_guest_booking" | "link_guest_booking_to_account" | "request_booking_cancellation" | "withdraw_booking_cancellation_request" | "resolve_booking_cancellation" | "reschedule_booking" | "change_booking_instructor" | "change_booking_duration" | "change_booking_party" | "rollback_unpaid_booking_party_additions" | "record_booking_attendance" | "complete_booking" | "record_booking_no_show" | "create_course_enrollments" | "transfer_course_enrollment" | "withdraw_course_enrollment" | "request_course_enrollment_cancellation" | "resolve_course_enrollment_cancellation" | "create_booking_proposal" | "accept_booking_proposal" | "cancel_booking_proposal" | "expire_booking_proposal" | "create_booking_change_request" | "withdraw_booking_change_request" | "resolve_booking_change_request" | "expire_guest_reservation" | "enforce_payment_start_gate" | "resolve_attendance_outcome" | "create_participant" | "update_participant_profile" | "assign_participant_management" | "revoke_participant_management" | "create_instructor_relationship" | "revoke_instructor_relationship" | "block_participant" | "unblock_participant" | "record_provider_payment_event" | "record_manual_wallet_funding" | "adjust_service_price" | "record_financial_correction" | "record_audit_correction" | "create_course_day" | "reassign_course_day_instructor">;
    context: z.ZodObject<{
        actor: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"account">;
            accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"guest">;
            guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"guest_subject">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"system">;
            systemActorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"system_actor">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"provider">;
            providerId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"provider">, string>>;
        }, z.core.$strict>], "kind">;
        exercisedCapability: z.ZodEnum<{
            instructor: "instructor";
            guest: "guest";
            system: "system";
            account_owner: "account_owner";
            parent_guardian: "parent_guardian";
            administrator: "administrator";
            provider_callback: "provider_callback";
        }>;
        idempotencyKey: z.ZodString;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"correlation">, string>>;
        causationId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"causation">, string>>>;
        expectedRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        source: z.ZodEnum<{
            provider_callback: "provider_callback";
            client_callable: "client_callable";
            admin_callable: "admin_callable";
            guest_callable: "guest_callable";
            scheduler: "scheduler";
            system_reconciliation: "system_reconciliation";
        }>;
        transportMetadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        calendarInput: z.ZodOptional<z.ZodObject<{
            localDate: z.ZodString;
            localTime: z.ZodString;
            durationMinutes: z.ZodNumber;
        }, z.core.$strict>>;
        timezone: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    intent: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course_enrollment">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingProposalId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_proposal">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingChangeRequestId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_change_request">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        displayName: z.ZodOptional<z.ZodString>;
        age: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"birth_date">;
            birthDate: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"age_years">;
            years: z.ZodNumber;
        }, z.core.$strict>], "kind">>;
        skillLevel: z.ZodOptional<z.ZodString>;
        discipline: z.ZodOptional<z.ZodEnum<{
            ski: "ski";
            snowboard: "snowboard";
        }>>;
        instructorComment: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        sourceKind: z.ZodEnum<{
            provider: "provider";
            cash: "cash";
            bank_transfer: "bank_transfer";
            manual_external: "manual_external";
        }>;
        providerKind: z.ZodOptional<z.ZodString>;
        providerEventId: z.ZodOptional<z.ZodString>;
        providerTransactionRef: z.ZodOptional<z.ZodString>;
        manualReference: z.ZodOptional<z.ZodString>;
        payerAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
    }, z.core.$strict> | z.ZodObject<{
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        newPrice: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        fundingAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodDiscriminatedUnion<[z.ZodObject<{
        correctionKind: z.ZodLiteral<"admin_refund">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        expectedWalletRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        manualExternalReference: z.ZodOptional<z.ZodString>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        correctionKind: z.ZodLiteral<"write_off">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        correctionKind: z.ZodLiteral<"reverse_write_off">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        correctionKind: z.ZodLiteral<"compensating_event">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        correctsEventId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"monetary_event">, string>>;
        paymentEffect: z.ZodObject<{
            priceDelta: z.ZodOptional<z.ZodNumber>;
            paidAmountDelta: z.ZodOptional<z.ZodNumber>;
            refundedAmountDelta: z.ZodOptional<z.ZodNumber>;
            settledAmountDelta: z.ZodOptional<z.ZodNumber>;
            writtenOffAmountDelta: z.ZodOptional<z.ZodNumber>;
            outstandingAmountDelta: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        walletBalanceDelta: z.ZodOptional<z.ZodNumber>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        expectedWalletRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>], "correctionKind"> | z.ZodDiscriminatedUnion<[z.ZodObject<{
        operation: z.ZodLiteral<"reconcile_payment">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        operation: z.ZodLiteral<"reconcile_wallet">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        operation: z.ZodLiteral<"rebuild_payment_projection">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"payment">, string>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        operation: z.ZodLiteral<"rebuild_wallet_projection">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>;
        expectedWalletRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>], "operation"> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>;
        payerAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        decision: z.ZodEnum<{
            approve: "approve";
            reject: "reject";
            direct_cancel: "direct_cancel";
        }>;
        refundAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
        manualExternalReference: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        fundingAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        durationMinutes: z.ZodNumber;
        fundingAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        participantIdsToAdd: z.ZodOptional<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>>;
        participantIdsToRemove: z.ZodOptional<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>>;
        refundPercentBasisPoints: z.ZodOptional<z.ZodNumber>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        attendanceStatus: z.ZodEnum<{
            present: "present";
            absent: "absent";
        }>;
        expectedAttendanceRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").AggregateRevision, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course">, string>>;
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        bookingProposalId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_proposal">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        bookingChangeRequestId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_change_request">, string>>;
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking">, string>>;
        reason: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        bookingChangeRequestId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"booking_change_request">, string>>;
        resolution: z.ZodEnum<{
            rescheduled: "rescheduled";
            booking_cancelled: "booking_cancelled";
            no_change: "no_change";
        }>;
        refundAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("..").KztMinorUnits, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict> | z.ZodObject<{
        subjectKind: z.ZodEnum<{
            booking: "booking";
            course_enrollment: "course_enrollment";
        }>;
        subjectId: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        subjectKind: z.ZodEnum<{
            booking: "booking";
            course_enrollment: "course_enrollment";
        }>;
        subjectId: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
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
    }, z.core.$strict> | z.ZodObject<{
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant_management">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        authority: z.ZodEnum<{
            parent_guardian: "parent_guardian";
            self: "self";
        }>;
    }, z.core.$strict> | z.ZodObject<{
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant_management">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor_relationship">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        basis: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"guardian_permission">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"administration_assignment">;
        }, z.core.$strict>], "kind">;
    }, z.core.$strict> | z.ZodObject<{
        instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor_relationship">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        participantBlockId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant_block">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        reason: z.ZodString;
    }, z.core.$strict> | z.ZodObject<{
        participantBlockId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"participant_block">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course_day">, string>>;
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
    }, z.core.$strict> | z.ZodObject<{
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course">, string>>;
        courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"course_day">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("..").CanonicalId<"instructor">, string>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>[]], "kind">;
export type CommandEnvelope<Kind extends CommandKind = CommandKind> = Readonly<{
    kind: Kind;
    context: z.output<typeof CommandContextSchema>;
    intent: z.output<(typeof CommandIntentSchemaByKind)[Kind]>;
}>;
export declare function parseCommandEnvelope(input: unknown): z.ZodSafeParseResult<CommandEnvelope>;
