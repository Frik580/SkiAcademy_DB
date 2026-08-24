"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandFingerprintSchema = void 0;
exports.buildCommandFingerprintInput = buildCommandFingerprintInput;
exports.canonicalizeCommandFingerprintInput = canonicalizeCommandFingerprintInput;
exports.computeCommandFingerprint = computeCommandFingerprint;
exports.computeCommandFingerprintFromEnvelope = computeCommandFingerprintFromEnvelope;
const zod_1 = require("zod");
const canonicalJson_1 = require("./canonicalJson");
const deterministicIdentity_1 = require("./deterministicIdentity");
const FINGERPRINT_PREFIX = 'command-fingerprint:v1';
exports.CommandFingerprintSchema = zod_1.z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'fingerprint must be a SHA-256 hex digest');
function buildCommandFingerprintInput(envelope) {
    const { kind, context, intent } = envelope;
    return {
        kind,
        exercisedCapability: context.exercisedCapability,
        intent,
        ...(context.calendarInput === undefined ? {} : { calendarInput: context.calendarInput }),
        ...(context.timezone === undefined ? {} : { timezone: context.timezone }),
    };
}
function canonicalizeCommandFingerprintInput(input) {
    return {
        calendarInput: input.calendarInput ?? null,
        exercisedCapability: input.exercisedCapability,
        intent: input.intent,
        kind: input.kind,
        timezone: input.timezone ?? null,
    };
}
function computeCommandFingerprint(input) {
    const canonicalPayload = (0, canonicalJson_1.canonicalJsonStringify)(canonicalizeCommandFingerprintInput(input));
    return exports.CommandFingerprintSchema.parse((0, deterministicIdentity_1.canonicalDeterministicHash)([FINGERPRINT_PREFIX, canonicalPayload]));
}
function computeCommandFingerprintFromEnvelope(envelope) {
    return computeCommandFingerprint(buildCommandFingerprintInput(envelope));
}
