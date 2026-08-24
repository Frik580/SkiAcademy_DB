import { z } from 'zod';
import { type PaymentAccountingFields, type PaymentStatus } from './paymentWallet';
import { type KztMinorUnits } from './primitives';
import { MonetaryPaymentEffectSchema } from './paymentWallet';
export interface PaymentAccountingProjection extends PaymentAccountingFields {
    readonly paymentStatus: PaymentStatus;
}
export declare class PaymentAccountingInvariantError extends Error {
    constructor(message: string);
}
export declare class InsufficientWalletFundsError extends Error {
    constructor(message?: string);
}
export declare function creditWalletBalance(balance: KztMinorUnits, amount: KztMinorUnits): KztMinorUnits;
export declare function debitWalletBalance(balance: KztMinorUnits, amount: KztMinorUnits): KztMinorUnits;
export declare function applyRefundDelta(payment: PaymentAccountingFields, refundDelta: KztMinorUnits): PaymentAccountingProjection;
export declare function applyWriteOffAmount(payment: PaymentAccountingFields, amount: KztMinorUnits): PaymentAccountingProjection;
export interface ReplacementObligationFundingResult {
    readonly payment: PaymentAccountingProjection;
    readonly appliedAmount: KztMinorUnits;
    readonly remainder: KztMinorUnits;
}
export declare function applyReplacementThenObligationFunding(payment: PaymentAccountingFields, fundingAmount: KztMinorUnits): ReplacementObligationFundingResult;
export declare function applyExternalPaymentFunding(payment: PaymentAccountingFields, amount: KztMinorUnits): PaymentAccountingProjection;
export interface PriceIncreaseResult {
    readonly payment: PaymentAccountingProjection;
    readonly priceDelta: KztMinorUnits;
}
export declare function applyPriceIncrease(payment: PaymentAccountingFields, delta: KztMinorUnits): PriceIncreaseResult;
export interface PriceDecreaseResult {
    readonly payment: PaymentAccountingProjection;
    readonly refundDelta: KztMinorUnits;
}
export declare function applyPriceDecrease(payment: PaymentAccountingFields, newPrice: KztMinorUnits): PriceDecreaseResult;
export declare function applyPriceIncreaseWithFunding(payment: PaymentAccountingFields, delta: KztMinorUnits, fundingAmount: KztMinorUnits): PaymentAccountingProjection;
export declare function paymentEffectFromProjectionChange(before: PaymentAccountingFields, after: PaymentAccountingProjection): z.output<typeof MonetaryPaymentEffectSchema>;
export declare function assertNonNegativeKzt(value: KztMinorUnits, field: string): void;
