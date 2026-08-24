export const FORBIDDEN_AUTHORITATIVE_INTENT_FIELDS = [
  'bookingOrigin',
  'targetStatus',
  'targetLifecycleStatus',
  'lifecycleStatus',
  'capacityDelta',
  'balanceDelta',
  'walletDelta',
  'paymentDelta',
  'resourceClaims',
  'claimMutations',
  'activityLog',
  'outboxObligation',
  'decidedAt',
  'monetaryEvent',
  'monetaryEvents',
  'auditRecord',
] as const;

export type ForbiddenAuthoritativeIntentField = (typeof FORBIDDEN_AUTHORITATIVE_INTENT_FIELDS)[number];

export interface ForbiddenFieldPath {
  readonly path: string;
  readonly field: ForbiddenAuthoritativeIntentField;
}

function isForbiddenFieldName(field: string): field is ForbiddenAuthoritativeIntentField {
  return (FORBIDDEN_AUTHORITATIVE_INTENT_FIELDS as readonly string[]).includes(field);
}

export function findForbiddenAuthoritativeFields(
  input: unknown,
  pathPrefix = ''
): readonly ForbiddenFieldPath[] {
  if (!input || typeof input !== 'object') return [];

  const findings: ForbiddenFieldPath[] = [];
  const record = input as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    const path = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (isForbiddenFieldName(key)) {
      findings.push({ path, field: key });
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      findings.push(...findForbiddenAuthoritativeFields(value, path));
    }
  }

  return findings;
}

export function containsForbiddenAuthoritativeFields(input: unknown): boolean {
  return findForbiddenAuthoritativeFields(input).length > 0;
}
