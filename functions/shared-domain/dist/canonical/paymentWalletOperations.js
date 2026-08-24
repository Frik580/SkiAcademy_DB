"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsufficientWalletFundsError = exports.PaymentAccountingInvariantError = void 0;
exports.creditWalletBalance = creditWalletBalance;
exports.debitWalletBalance = debitWalletBalance;
exports.applyRefundDelta = applyRefundDelta;
exports.applyWriteOffAmount = applyWriteOffAmount;
exports.applyReplacementThenObligationFunding = applyReplacementThenObligationFunding;
exports.applyExternalPaymentFunding = applyExternalPaymentFunding;
exports.applyPriceIncrease = applyPriceIncrease;
exports.applyPriceDecrease = applyPriceDecrease;
exports.applyPriceIncreaseWithFunding = applyPriceIncreaseWithFunding;
exports.paymentEffectFromProjectionChange = paymentEffectFromProjectionChange;
exports.assertNonNegativeKzt = assertNonNegativeKzt;
const paymentWallet_1 = require("./paymentWallet");
const primitives_1 = require("./primitives");
const paymentWallet_2 = require("./paymentWallet");
class PaymentAccountingInvariantError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PaymentAccountingInvariantError';
    }
}
exports.PaymentAccountingInvariantError = PaymentAccountingInvariantError;
class InsufficientWalletFundsError extends Error {
    constructor(message = 'Wallet balance is insufficient') {
        super(message);
        this.name = 'InsufficientWalletFundsError';
    }
}
exports.InsufficientWalletFundsError = InsufficientWalletFundsError;
function projectPayment(fields) {
    const retainedAmount = (0, paymentWallet_1.deriveRetainedAmount)(fields.paidAmount, fields.refundedAmount);
    const accounting = { ...fields, retainedAmount };
    const issues = [];
    (0, paymentWallet_1.validatePaymentAccounting)(accounting, {
        addIssue: (issue) => {
            issues.push(issue);
        },
    });
    if (issues.length > 0) {
        throw new PaymentAccountingInvariantError(issues[0]?.message ?? 'Invalid payment accounting');
    }
    return {
        ...accounting,
        paymentStatus: (0, paymentWallet_1.derivePaymentStatus)(accounting),
    };
}
function applyDeltas(current, deltas) {
    return {
        originalPrice: current.originalPrice,
        price: primitives_1.KztMinorUnitsSchema.parse(current.price + (deltas.priceDelta ?? 0)),
        paidAmount: primitives_1.KztMinorUnitsSchema.parse(current.paidAmount + (deltas.paidAmountDelta ?? 0)),
        refundedAmount: primitives_1.KztMinorUnitsSchema.parse(current.refundedAmount + (deltas.refundedAmountDelta ?? 0)),
        retainedAmount: current.retainedAmount,
        settledAmount: primitives_1.KztMinorUnitsSchema.parse(current.settledAmount + (deltas.settledAmountDelta ?? 0)),
        writtenOffAmount: primitives_1.KztMinorUnitsSchema.parse(current.writtenOffAmount + (deltas.writtenOffAmountDelta ?? 0)),
        outstandingAmount: primitives_1.KztMinorUnitsSchema.parse(current.outstandingAmount + (deltas.outstandingAmountDelta ?? 0)),
    };
}
function creditWalletBalance(balance, amount) {
    if (amount <= 0) {
        throw new Error('Credit amount must be positive');
    }
    return primitives_1.KztMinorUnitsSchema.parse(balance + amount);
}
function debitWalletBalance(balance, amount) {
    if (amount <= 0) {
        throw new Error('Debit amount must be positive');
    }
    if (balance < amount) {
        throw new InsufficientWalletFundsError();
    }
    return primitives_1.KztMinorUnitsSchema.parse(balance - amount);
}
function applyRefundDelta(payment, refundDelta) {
    if (refundDelta <= 0) {
        throw new PaymentAccountingInvariantError('Refund delta must be positive');
    }
    if (refundDelta > payment.paidAmount - payment.refundedAmount) {
        throw new PaymentAccountingInvariantError('Refund exceeds available paid amount');
    }
    return projectPayment(applyDeltas(payment, {
        refundedAmountDelta: refundDelta,
    }));
}
function applyWriteOffAmount(payment, amount) {
    if (amount <= 0) {
        throw new PaymentAccountingInvariantError('Write-off amount must be positive');
    }
    if (amount > payment.outstandingAmount) {
        throw new PaymentAccountingInvariantError('Write-off exceeds outstanding obligation');
    }
    return projectPayment(applyDeltas(payment, {
        writtenOffAmountDelta: amount,
        outstandingAmountDelta: -amount,
    }));
}
function applyReplacementThenObligationFunding(payment, fundingAmount) {
    if (fundingAmount <= 0) {
        throw new PaymentAccountingInvariantError('Funding amount must be positive');
    }
    let remaining = fundingAmount;
    let paidAmount = payment.paidAmount;
    let settledAmount = payment.settledAmount;
    let outstandingAmount = payment.outstandingAmount;
    const retainedAmount = (0, paymentWallet_1.deriveRetainedAmount)(payment.paidAmount, payment.refundedAmount);
    const replacementFunding = Math.min(remaining, settledAmount - retainedAmount);
    paidAmount = primitives_1.KztMinorUnitsSchema.parse(paidAmount + replacementFunding);
    remaining = primitives_1.KztMinorUnitsSchema.parse(remaining - replacementFunding);
    const obligationFunding = Math.min(remaining, outstandingAmount);
    paidAmount = primitives_1.KztMinorUnitsSchema.parse(paidAmount + obligationFunding);
    settledAmount = primitives_1.KztMinorUnitsSchema.parse(settledAmount + obligationFunding);
    outstandingAmount = primitives_1.KztMinorUnitsSchema.parse(outstandingAmount - obligationFunding);
    remaining = primitives_1.KztMinorUnitsSchema.parse(remaining - obligationFunding);
    if (remaining > 0) {
        throw new PaymentAccountingInvariantError('Unallocated funding remainder');
    }
    const projection = projectPayment({
        ...payment,
        paidAmount,
        settledAmount,
        outstandingAmount,
        retainedAmount: (0, paymentWallet_1.deriveRetainedAmount)(paidAmount, payment.refundedAmount),
    });
    return {
        payment: projection,
        appliedAmount: fundingAmount,
        remainder: primitives_1.KztMinorUnitsSchema.parse(0),
    };
}
function applyExternalPaymentFunding(payment, amount) {
    return applyReplacementThenObligationFunding(payment, amount).payment;
}
function applyPriceIncrease(payment, delta) {
    if (delta <= 0) {
        throw new PaymentAccountingInvariantError('Price increase delta must be positive');
    }
    const increased = projectPayment(applyDeltas(payment, {
        priceDelta: delta,
        outstandingAmountDelta: delta,
    }));
    return { payment: increased, priceDelta: delta };
}
function applyPriceDecrease(payment, newPrice) {
    if (newPrice < 0) {
        throw new PaymentAccountingInvariantError('New price must be non-negative');
    }
    if (newPrice >= payment.price) {
        throw new PaymentAccountingInvariantError('New price must be lower than current price');
    }
    const retainedBefore = (0, paymentWallet_1.deriveRetainedAmount)(payment.paidAmount, payment.refundedAmount);
    let reduction = payment.price - newPrice;
    let outstandingAmount = payment.outstandingAmount;
    let writtenOffAmount = payment.writtenOffAmount;
    let settledAmount = payment.settledAmount;
    let cut = Math.min(reduction, outstandingAmount);
    outstandingAmount = primitives_1.KztMinorUnitsSchema.parse(outstandingAmount - cut);
    reduction = primitives_1.KztMinorUnitsSchema.parse(reduction - cut);
    cut = Math.min(reduction, writtenOffAmount);
    writtenOffAmount = primitives_1.KztMinorUnitsSchema.parse(writtenOffAmount - cut);
    reduction = primitives_1.KztMinorUnitsSchema.parse(reduction - cut);
    settledAmount = primitives_1.KztMinorUnitsSchema.parse(settledAmount - reduction);
    let refundedAmount = payment.refundedAmount;
    let paidAmount = payment.paidAmount;
    const additionalRefund = Math.max(0, retainedBefore - settledAmount);
    if (additionalRefund > 0) {
        refundedAmount = primitives_1.KztMinorUnitsSchema.parse(refundedAmount + additionalRefund);
        paidAmount = payment.paidAmount;
    }
    const projection = projectPayment({
        originalPrice: payment.originalPrice,
        price: newPrice,
        paidAmount,
        refundedAmount,
        retainedAmount: (0, paymentWallet_1.deriveRetainedAmount)(paidAmount, refundedAmount),
        settledAmount,
        writtenOffAmount,
        outstandingAmount,
    });
    return { payment: projection, refundDelta: primitives_1.KztMinorUnitsSchema.parse(additionalRefund) };
}
function applyPriceIncreaseWithFunding(payment, delta, fundingAmount) {
    const increased = applyPriceIncrease(payment, delta);
    if (fundingAmount === 0) {
        return increased.payment;
    }
    return applyReplacementThenObligationFunding(increased.payment, fundingAmount).payment;
}
function paymentEffectFromProjectionChange(before, after) {
    const effect = {};
    if (after.price !== before.price)
        effect.priceDelta = after.price - before.price;
    if (after.paidAmount !== before.paidAmount)
        effect.paidAmountDelta = after.paidAmount - before.paidAmount;
    if (after.refundedAmount !== before.refundedAmount) {
        effect.refundedAmountDelta = after.refundedAmount - before.refundedAmount;
    }
    if (after.settledAmount !== before.settledAmount) {
        effect.settledAmountDelta = after.settledAmount - before.settledAmount;
    }
    if (after.writtenOffAmount !== before.writtenOffAmount) {
        effect.writtenOffAmountDelta = after.writtenOffAmount - before.writtenOffAmount;
    }
    if (after.outstandingAmount !== before.outstandingAmount) {
        effect.outstandingAmountDelta = after.outstandingAmount - before.outstandingAmount;
    }
    return paymentWallet_2.MonetaryPaymentEffectSchema.parse(effect);
}
function assertNonNegativeKzt(value, field) {
    if (value < 0) {
        throw new PaymentAccountingInvariantError(`${field} must be non-negative`);
    }
}
