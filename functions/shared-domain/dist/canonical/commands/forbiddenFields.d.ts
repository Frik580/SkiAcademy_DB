export declare const FORBIDDEN_AUTHORITATIVE_INTENT_FIELDS: readonly ["bookingOrigin", "targetStatus", "targetLifecycleStatus", "lifecycleStatus", "capacityDelta", "balanceDelta", "walletDelta", "paymentDelta", "resourceClaims", "claimMutations", "activityLog", "outboxObligation", "decidedAt", "monetaryEvent", "monetaryEvents", "auditRecord"];
export type ForbiddenAuthoritativeIntentField = (typeof FORBIDDEN_AUTHORITATIVE_INTENT_FIELDS)[number];
export interface ForbiddenFieldPath {
    readonly path: string;
    readonly field: ForbiddenAuthoritativeIntentField;
}
export declare function findForbiddenAuthoritativeFields(input: unknown, pathPrefix?: string): readonly ForbiddenFieldPath[];
export declare function containsForbiddenAuthoritativeFields(input: unknown): boolean;
