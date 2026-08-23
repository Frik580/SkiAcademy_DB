import { z } from 'zod';
import { type AccountId } from './identifiers';
import { type KztMinorUnits } from './primitives';
export declare const PAYMENT_SUBJECT_TYPES: readonly ["booking", "course_enrollment"];
export type PaymentSubjectType = (typeof PAYMENT_SUBJECT_TYPES)[number];
export declare const PAYMENT_STATUSES: readonly ["unpaid", "partially_paid", "paid", "refunded", "partially_refunded"];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export declare const PaymentSubjectTypeSchema: z.ZodEnum<{
    booking: "booking";
    course_enrollment: "course_enrollment";
}>;
export declare const PaymentStatusSchema: z.ZodEnum<{
    unpaid: "unpaid";
    partially_paid: "partially_paid";
    paid: "paid";
    refunded: "refunded";
    partially_refunded: "partially_refunded";
}>;
export declare const PaymentSubjectRefSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    subjectType: z.ZodLiteral<"booking">;
    subjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
}, z.core.$strict>, z.ZodObject<{
    subjectType: z.ZodLiteral<"course_enrollment">;
    subjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
}, z.core.$strict>], "subjectType">;
export type PaymentSubjectRef = z.output<typeof PaymentSubjectRefSchema>;
export declare const IncrementalRequirementStateSchema: z.ZodEnum<{
    active: "active";
    fully_funded: "fully_funded";
    rolled_back: "rolled_back";
}>;
export declare const IncrementalRequirementSchema: z.ZodObject<{
    incrementalRequirementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"incremental_requirement">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
    requiredPriceDelta: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
    allocatedSettledAmount: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
    allocatedRetainedAmount: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
    state: z.ZodEnum<{
        active: "active";
        fully_funded: "fully_funded";
        rolled_back: "rolled_back";
    }>;
}, z.core.$strict>;
export type IncrementalRequirement = z.output<typeof IncrementalRequirementSchema>;
export interface PaymentAccountingFields {
    readonly originalPrice: KztMinorUnits;
    readonly price: KztMinorUnits;
    readonly paidAmount: KztMinorUnits;
    readonly refundedAmount: KztMinorUnits;
    readonly retainedAmount: KztMinorUnits;
    readonly settledAmount: KztMinorUnits;
    readonly writtenOffAmount: KztMinorUnits;
    readonly outstandingAmount: KztMinorUnits;
}
export declare function deriveRetainedAmount(paidAmount: KztMinorUnits, refundedAmount: KztMinorUnits): KztMinorUnits;
export declare function derivePaymentStatus(fields: PaymentAccountingFields): PaymentStatus;
export declare function isPaymentFullyFundedForService(fields: PaymentAccountingFields): boolean;
export declare function validatePaymentAccounting(fields: PaymentAccountingFields, context: z.RefinementCtx, basePath?: (string | number)[]): void;
export declare const PaymentSchema: z.ZodObject<{
    paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"payment">, string>>;
    subjectType: z.ZodEnum<{
        booking: "booking";
        course_enrollment: "course_enrollment";
    }>;
    subjectId: z.ZodUnion<readonly [z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>, z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>]>;
    currency: z.ZodLiteral<"KZT">;
    originalPrice: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
    price: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
    paidAmount: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
    refundedAmount: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
    retainedAmount: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
    settledAmount: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
    writtenOffAmount: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
    outstandingAmount: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
    paymentStatus: z.ZodEnum<{
        unpaid: "unpaid";
        partially_paid: "partially_paid";
        paid: "paid";
        refunded: "refunded";
        partially_refunded: "partially_refunded";
    }>;
    payerAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>>;
    incrementalRequirements: z.ZodArray<z.ZodObject<{
        incrementalRequirementId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"incremental_requirement">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
        createdAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        requiredPriceDelta: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
        allocatedSettledAmount: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
        allocatedRetainedAmount: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
        state: z.ZodEnum<{
            active: "active";
            fully_funded: "fully_funded";
            rolled_back: "rolled_back";
        }>;
    }, z.core.$strict>>;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    eventRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>;
export type Payment = Readonly<z.output<typeof PaymentSchema>>;
export declare const WalletSchema: z.ZodObject<{
    accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    currency: z.ZodLiteral<"KZT">;
    balance: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    eventRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>;
export type Wallet = Readonly<z.output<typeof WalletSchema>>;
export declare const MONETARY_EVENT_KINDS: readonly ["wallet_credit", "wallet_adjustment", "booking_charge", "course_charge", "external_payment", "manual_payment", "refund_to_wallet", "manual_external_refund", "admin_price_adjustment", "write_off", "correction"];
export type MonetaryEventKind = (typeof MONETARY_EVENT_KINDS)[number];
export declare const MONETARY_SOURCE_KINDS: readonly ["wallet", "provider", "cash", "bank_transfer", "manual_external", "admin_adjustment", "system"];
export type MonetarySourceKind = (typeof MONETARY_SOURCE_KINDS)[number];
export declare const REFUND_DESTINATION_KINDS: readonly ["wallet", "manual_external"];
export type RefundDestinationKind = (typeof REFUND_DESTINATION_KINDS)[number];
export declare const MonetaryPaymentEffectSchema: z.ZodObject<{
    priceDelta: z.ZodOptional<z.ZodNumber>;
    paidAmountDelta: z.ZodOptional<z.ZodNumber>;
    refundedAmountDelta: z.ZodOptional<z.ZodNumber>;
    settledAmountDelta: z.ZodOptional<z.ZodNumber>;
    writtenOffAmountDelta: z.ZodOptional<z.ZodNumber>;
    outstandingAmountDelta: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const MonetaryEventActorSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"account">;
    accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"guest">;
    guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"guest_subject">, string>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"system">;
    systemActorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"system_actor">, string>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"provider">;
    providerId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"provider">, string>>;
}, z.core.$strict>], "kind">;
export declare const MonetaryEventSchema: z.ZodObject<{
    eventId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"monetary_event">, string>>;
    eventKind: z.ZodEnum<{
        wallet_credit: "wallet_credit";
        wallet_adjustment: "wallet_adjustment";
        booking_charge: "booking_charge";
        course_charge: "course_charge";
        external_payment: "external_payment";
        manual_payment: "manual_payment";
        refund_to_wallet: "refund_to_wallet";
        manual_external_refund: "manual_external_refund";
        admin_price_adjustment: "admin_price_adjustment";
        write_off: "write_off";
        correction: "correction";
    }>;
    currency: z.ZodLiteral<"KZT">;
    paymentId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"payment">, string>>>;
    subjectType: z.ZodOptional<z.ZodEnum<{
        booking: "booking";
        course_enrollment: "course_enrollment";
    }>>;
    subjectId: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>, z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>]>>;
    walletAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>>;
    paymentEffect: z.ZodOptional<z.ZodObject<{
        priceDelta: z.ZodOptional<z.ZodNumber>;
        paidAmountDelta: z.ZodOptional<z.ZodNumber>;
        refundedAmountDelta: z.ZodOptional<z.ZodNumber>;
        settledAmountDelta: z.ZodOptional<z.ZodNumber>;
        writtenOffAmountDelta: z.ZodOptional<z.ZodNumber>;
        outstandingAmountDelta: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>;
    walletBalanceDelta: z.ZodOptional<z.ZodNumber>;
    sourceKind: z.ZodEnum<{
        admin_adjustment: "admin_adjustment";
        provider: "provider";
        system: "system";
        wallet: "wallet";
        cash: "cash";
        bank_transfer: "bank_transfer";
        manual_external: "manual_external";
    }>;
    payerAccountIdAtEvent: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>>;
    providerKind: z.ZodOptional<z.ZodString>;
    providerEventId: z.ZodOptional<z.ZodString>;
    providerTransactionRef: z.ZodOptional<z.ZodString>;
    manualReference: z.ZodOptional<z.ZodString>;
    refundDestinationKind: z.ZodOptional<z.ZodEnum<{
        wallet: "wallet";
        manual_external: "manual_external";
    }>>;
    refundAccountIdAtEvent: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>>;
    incrementalRequirementId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"incremental_requirement">, string>>>;
    actor: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"account">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"guest">;
        guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"guest_subject">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"system">;
        systemActorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"system_actor">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"provider">;
        providerId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"provider">, string>>;
    }, z.core.$strict>], "kind">;
    reasonCode: z.ZodOptional<z.ZodString>;
    commandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
    correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    causationId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"causation">, string>>>;
    correctsEventId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"monetary_event">, string>>>;
    paymentEventRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>>;
    walletEventRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>>;
    occurredAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    recordedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>;
export type MonetaryEvent = Readonly<z.output<typeof MonetaryEventSchema>>;
export declare const LEGACY_FINANCIAL_FIELD_NAMES: readonly ["balanceUSD", "walletBalance", "totalPrice", "wallet_ledger", "schoolGuestWallet", "guestWallet", "ledgerEntryType", "starter_credit"];
export declare const LegacyFinancialShapeSchema: z.ZodObject<{
    balanceUSD: z.ZodOptional<z.ZodUnknown>;
    walletBalance: z.ZodOptional<z.ZodUnknown>;
    totalPrice: z.ZodOptional<z.ZodUnknown>;
    wallet_ledger: z.ZodOptional<z.ZodUnknown>;
    schoolGuestWallet: z.ZodOptional<z.ZodUnknown>;
    guestWallet: z.ZodOptional<z.ZodUnknown>;
    ledgerEntryType: z.ZodOptional<z.ZodUnknown>;
    starter_credit: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strict>;
export declare function containsLegacyFinancialFields(input: unknown): boolean;
export declare function paymentIdMatchesSubject(payment: Pick<Payment, 'paymentId' | 'subjectType' | 'subjectId'>, subject: PaymentSubjectRef): boolean;
export declare function writeOffDoesNotAuthorizeService(fields: PaymentAccountingFields): boolean;
export declare function monetaryEventRecordsProvenanceAtEvent(event: Pick<MonetaryEvent, 'payerAccountIdAtEvent' | 'sourceKind' | 'providerTransactionRef' | 'manualReference'>, currentPayerAccountId?: AccountId): boolean;
