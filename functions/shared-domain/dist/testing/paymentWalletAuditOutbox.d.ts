import { type ActivityLog, type DomainOutboxObligation, type MonetaryEvent, type Payment, type ResourceClaim, type ResourceClaimGuard, type Wallet } from '../canonical';
export interface CanonicalPaymentWalletAuditFixtures {
    readonly payment: Payment;
    readonly underpaidPayment: Payment;
    readonly wallet: Wallet;
    readonly monetaryEvent: MonetaryEvent;
    readonly resourceClaim: ResourceClaim;
    readonly resourceClaimGuard: ResourceClaimGuard;
    readonly activityLog: ActivityLog;
    readonly outboxObligation: DomainOutboxObligation;
}
export declare const canonicalPaymentWalletAuditFixtures: CanonicalPaymentWalletAuditFixtures;
