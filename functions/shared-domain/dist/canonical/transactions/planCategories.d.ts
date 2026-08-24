export declare const TRANSACTION_PLAN_CATEGORIES: readonly ["aggregate", "resource_claim", "resource_guard", "payment_wallet", "idempotency", "activity_log", "outbox_obligation", "capacity_projection", "authorization_check", "enrollment_guard", "other"];
export type TransactionPlanCategory = (typeof TRANSACTION_PLAN_CATEGORIES)[number];
