"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalJsonStringify = canonicalJsonStringify;
function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}
/**
 * Stable JSON encoding with sorted object keys for deterministic fingerprints.
 */
function canonicalJsonStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => canonicalJsonStringify(entry)).join(',')}]`;
    }
    if (!isPlainObject(value)) {
        return JSON.stringify(value);
    }
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(value[key])}`);
    return `{${entries.join(',')}}`;
}
