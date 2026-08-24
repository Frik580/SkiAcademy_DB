"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NormalizedCanonicalTimestampSchema = void 0;
exports.normalizeCanonicalTimestamp = normalizeCanonicalTimestamp;
exports.normalizeFirestoreRecord = normalizeFirestoreRecord;
exports.normalizeFirestoreDocument = normalizeFirestoreDocument;
const zod_1 = require("zod");
const primitives_1 = require("./primitives");
function isFirestoreTimestampLike(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value;
    return (typeof candidate.seconds === 'number' &&
        Number.isFinite(candidate.seconds) &&
        typeof candidate.nanoseconds === 'number' &&
        Number.isFinite(candidate.nanoseconds));
}
function normalizeCanonicalTimestamp(value) {
    if (!isFirestoreTimestampLike(value)) {
        return undefined;
    }
    const parsed = primitives_1.CanonicalTimestampSchema.safeParse({
        seconds: value.seconds,
        nanoseconds: value.nanoseconds,
    });
    return parsed.success ? parsed.data : undefined;
}
function normalizeFirestoreRecord(value) {
    const timestamp = normalizeCanonicalTimestamp(value);
    if (timestamp) {
        return timestamp;
    }
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeFirestoreRecord(entry));
    }
    if (typeof value === 'object' && value !== null) {
        const normalized = {};
        for (const [key, child] of Object.entries(value)) {
            normalized[key] = normalizeFirestoreRecord(child);
        }
        return normalized;
    }
    return value;
}
function normalizeFirestoreDocument(value) {
    if (!value) {
        return undefined;
    }
    const normalized = normalizeFirestoreRecord(value);
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
        return undefined;
    }
    return normalized;
}
exports.NormalizedCanonicalTimestampSchema = zod_1.z.preprocess((value) => normalizeCanonicalTimestamp(value) ?? value, primitives_1.CanonicalTimestampSchema);
