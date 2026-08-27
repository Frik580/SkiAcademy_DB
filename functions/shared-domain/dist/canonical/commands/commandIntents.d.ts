import { z } from 'zod';
import type { CommandKind } from './commandKinds';
export declare const CommandIntentSchemaByKind: {
    create_confirmed_booking: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"instructor">, string>>;
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant">, string>>>;
        payerAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    create_guest_booking_request: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"instructor">, string>>;
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant">, string>>>;
    }, z.core.$strict>;
    confirm_guest_booking: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
    }, z.core.$strict>;
    link_guest_booking_to_account: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant">, string>>;
    }, z.core.$strict>;
    request_booking_cancellation: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
    }, z.core.$strict>;
    withdraw_booking_cancellation_request: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
    }, z.core.$strict>;
    resolve_booking_cancellation: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
        decision: z.ZodEnum<{
            approve: "approve";
            reject: "reject";
            direct_cancel: "direct_cancel";
        }>;
        refundAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").KztMinorUnits, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
        manualExternalReference: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    reschedule_booking: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    change_booking_instructor: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"instructor">, string>>;
        fundingAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").KztMinorUnits, number>>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    change_booking_duration: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
        durationMinutes: z.ZodNumber;
        fundingAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").KztMinorUnits, number>>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    change_booking_party: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
        participantIdsToAdd: z.ZodOptional<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant">, string>>>>;
        participantIdsToRemove: z.ZodOptional<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant">, string>>>>;
        refundPercentBasisPoints: z.ZodOptional<z.ZodNumber>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    rollback_unpaid_booking_party_additions: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
    }, z.core.$strict>;
    record_booking_attendance: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant">, string>>;
        attendanceStatus: z.ZodEnum<{
            present: "present";
            absent: "absent";
        }>;
        expectedAttendanceRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    record_course_day_attendance: z.ZodObject<{
        courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course_enrollment">, string>>;
        courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course_day">, string>>;
        attendanceStatus: z.ZodEnum<{
            present: "present";
            absent: "absent";
        }>;
        expectedAttendanceRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>>;
        expectedEnrollmentRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    complete_booking: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
    }, z.core.$strict>;
    record_booking_no_show: z.ZodObject<{
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
    }, z.core.$strict>;
    create_course_enrollments: z.ZodObject<{
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course">, string>>;
        participantIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    transfer_course_enrollment: z.ZodObject<{
        courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course_enrollment">, string>>;
        targetCourseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course">, string>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    withdraw_course_enrollment: z.ZodObject<{
        courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course_enrollment">, string>>;
    }, z.core.$strict>;
    request_course_enrollment_cancellation: z.ZodObject<{
        courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course_enrollment">, string>>;
    }, z.core.$strict>;
    resolve_course_enrollment_cancellation: z.ZodObject<{
        courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course_enrollment">, string>>;
        decision: z.ZodEnum<{
            approve: "approve";
            reject: "reject";
            direct_cancel: "direct_cancel";
        }>;
        refundAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").KztMinorUnits, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
        manualExternalReference: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    create_booking_proposal: z.ZodObject<{
        bookingProposalId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking_proposal">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"instructor">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant">, string>>;
    }, z.core.$strict>;
    accept_booking_proposal: z.ZodObject<{
        bookingProposalId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking_proposal">, string>>;
    }, z.core.$strict>;
    cancel_booking_proposal: z.ZodObject<{
        bookingProposalId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking_proposal">, string>>;
    }, z.core.$strict>;
    expire_booking_proposal: z.ZodObject<{
        bookingProposalId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking_proposal">, string>>;
    }, z.core.$strict>;
    create_booking_change_request: z.ZodObject<{
        bookingChangeRequestId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking_change_request">, string>>;
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>;
        reason: z.ZodString;
    }, z.core.$strict>;
    withdraw_booking_change_request: z.ZodObject<{
        bookingChangeRequestId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking_change_request">, string>>;
    }, z.core.$strict>;
    resolve_booking_change_request: z.ZodObject<{
        bookingChangeRequestId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking_change_request">, string>>;
        resolution: z.ZodEnum<{
            rescheduled: "rescheduled";
            booking_cancelled: "booking_cancelled";
            no_change: "no_change";
        }>;
        refundAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").KztMinorUnits, number>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    expire_guest_reservation: z.ZodObject<{
        bookingId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"booking">, string>>>;
        courseEnrollmentId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course_enrollment">, string>>>;
    }, z.core.$strict>;
    enforce_payment_start_gate: z.ZodObject<{
        subjectKind: z.ZodEnum<{
            booking: "booking";
            course_enrollment: "course_enrollment";
        }>;
        subjectId: z.ZodString;
    }, z.core.$strict>;
    resolve_attendance_outcome: z.ZodObject<{
        subjectKind: z.ZodEnum<{
            booking: "booking";
            course_enrollment: "course_enrollment";
        }>;
        subjectId: z.ZodString;
    }, z.core.$strict>;
    create_participant: z.ZodObject<{
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant">, string>>;
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
    }, z.core.$strict>;
    update_participant_profile: z.ZodObject<{
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant">, string>>;
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
    }, z.core.$strict>;
    assign_participant_management: z.ZodObject<{
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant_management">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant">, string>>;
        authority: z.ZodEnum<{
            parent_guardian: "parent_guardian";
            self: "self";
        }>;
    }, z.core.$strict>;
    revoke_participant_management: z.ZodObject<{
        participantManagementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant_management">, string>>;
    }, z.core.$strict>;
    create_instructor_relationship: z.ZodObject<{
        instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"instructor_relationship">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"instructor">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant">, string>>;
        basis: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"guardian_permission">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"administration_assignment">;
        }, z.core.$strict>], "kind">;
    }, z.core.$strict>;
    revoke_instructor_relationship: z.ZodObject<{
        instructorRelationshipId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"instructor_relationship">, string>>;
    }, z.core.$strict>;
    block_participant: z.ZodObject<{
        participantBlockId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant_block">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"instructor">, string>>;
        reason: z.ZodString;
    }, z.core.$strict>;
    unblock_participant: z.ZodObject<{
        participantBlockId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"participant_block">, string>>;
    }, z.core.$strict>;
    record_provider_payment_event: z.ZodObject<{
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").KztMinorUnits, number>>;
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
        payerAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"account">, string>>>;
    }, z.core.$strict>;
    record_manual_wallet_funding: z.ZodObject<{
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"account">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").KztMinorUnits, number>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>;
    adjust_service_price: z.ZodObject<{
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"payment">, string>>;
        newPrice: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").KztMinorUnits, number>>;
        fundingAmount: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").KztMinorUnits, number>>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"account">, string>>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    record_financial_correction: z.ZodDiscriminatedUnion<[z.ZodObject<{
        correctionKind: z.ZodLiteral<"admin_refund">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").KztMinorUnits, number>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"account">, string>>>;
        expectedWalletRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>>;
        manualExternalReference: z.ZodOptional<z.ZodString>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        correctionKind: z.ZodLiteral<"write_off">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").KztMinorUnits, number>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        correctionKind: z.ZodLiteral<"reverse_write_off">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"payment">, string>>;
        amount: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").KztMinorUnits, number>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        correctionKind: z.ZodLiteral<"compensating_event">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"payment">, string>>;
        correctsEventId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"monetary_event">, string>>;
        paymentEffect: z.ZodObject<{
            priceDelta: z.ZodOptional<z.ZodNumber>;
            paidAmountDelta: z.ZodOptional<z.ZodNumber>;
            refundedAmountDelta: z.ZodOptional<z.ZodNumber>;
            settledAmountDelta: z.ZodOptional<z.ZodNumber>;
            writtenOffAmountDelta: z.ZodOptional<z.ZodNumber>;
            outstandingAmountDelta: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>;
        walletBalanceDelta: z.ZodOptional<z.ZodNumber>;
        walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"account">, string>>>;
        expectedWalletRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>>;
        adminIssueId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"admin_issue">, string>>>;
        expectedAdminIssueRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>], "correctionKind">;
    record_audit_correction: z.ZodDiscriminatedUnion<[z.ZodObject<{
        operation: z.ZodLiteral<"reconcile_payment">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"payment">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        operation: z.ZodLiteral<"reconcile_wallet">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        operation: z.ZodLiteral<"rebuild_payment_projection">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"payment">, string>>;
        expectedPaymentRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        operation: z.ZodLiteral<"rebuild_wallet_projection">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"account">, string>>;
        expectedWalletRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>;
        reasonExplanation: z.ZodString;
    }, z.core.$strict>], "operation">;
    create_course_day: z.ZodObject<{
        courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course_day">, string>>;
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"instructor">, string>>;
    }, z.core.$strict>;
    reassign_course_day_instructor: z.ZodObject<{
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course">, string>>;
        courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course_day">, string>>;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"instructor">, string>>;
        reasonExplanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
};
export type CommandIntentForKind<Kind extends CommandKind> = z.output<(typeof CommandIntentSchemaByKind)[Kind]>;
export type CommandIntentMap = {
    [Kind in CommandKind]: CommandIntentForKind<Kind>;
};
export declare function parseCommandIntent<Kind extends CommandKind>(kind: Kind, input: unknown): z.ZodSafeParseResult<CommandIntentForKind<Kind>>;
