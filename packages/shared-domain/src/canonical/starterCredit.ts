/** Default registration gift in KZT when `settings/starter_credit` is absent. */
export const DEFAULT_STARTER_CREDIT_KZT = 250;

export const MIN_STARTER_CREDIT_KZT = 0;
/** Upper bound matches Firestore Rules and admin UI (KZT units). */
export const MAX_STARTER_CREDIT_KZT = 10_000;

export function normalizeStarterCreditKzt(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_STARTER_CREDIT_KZT;
  return Math.min(MAX_STARTER_CREDIT_KZT, Math.max(MIN_STARTER_CREDIT_KZT, Math.round(num)));
}

/** Resolve gift amount from settings doc. Canonical field is `amountKzt`. */
export function resolveStarterCreditAmountKzt(
  data: { amountKzt?: unknown } | null | undefined
): number {
  if (data == null) return DEFAULT_STARTER_CREDIT_KZT;
  if (data.amountKzt !== undefined && data.amountKzt !== null) {
    return normalizeStarterCreditKzt(data.amountKzt);
  }
  return DEFAULT_STARTER_CREDIT_KZT;
}
