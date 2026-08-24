"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORBIDDEN_AUTHORITATIVE_INTENT_FIELDS = void 0;
exports.findForbiddenAuthoritativeFields = findForbiddenAuthoritativeFields;
exports.containsForbiddenAuthoritativeFields = containsForbiddenAuthoritativeFields;
exports.FORBIDDEN_AUTHORITATIVE_INTENT_FIELDS = [
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
];
function isForbiddenFieldName(field) {
    return exports.FORBIDDEN_AUTHORITATIVE_INTENT_FIELDS.includes(field);
}
function findForbiddenAuthoritativeFields(input, pathPrefix = '') {
    if (!input || typeof input !== 'object')
        return [];
    const findings = [];
    const record = input;
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
function containsForbiddenAuthoritativeFields(input) {
    return findForbiddenAuthoritativeFields(input).length > 0;
}
