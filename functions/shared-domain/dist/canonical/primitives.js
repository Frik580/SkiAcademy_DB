"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IanaTimeZoneSchema = exports.TimeIntervalSchema = exports.CanonicalTimestampSchema = exports.KztMoneySchema = exports.KztMinorUnitsSchema = exports.AggregateRevisionSchema = void 0;
exports.compareCanonicalTimestamps = compareCanonicalTimestamps;
exports.timestampFromDate = timestampFromDate;
exports.intervalsOverlap = intervalsOverlap;
const zod_1 = require("zod");
const SafeNonNegativeIntegerSchema = zod_1.z
    .number()
    .finite()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER);
exports.AggregateRevisionSchema = SafeNonNegativeIntegerSchema.transform((value) => value);
exports.KztMinorUnitsSchema = SafeNonNegativeIntegerSchema.transform((value) => value);
exports.KztMoneySchema = zod_1.z
    .object({
    currency: zod_1.z.literal('KZT'),
    minorUnits: exports.KztMinorUnitsSchema,
})
    .strict();
// Firestore Timestamp's documented UTC range: year 0001 through year 9999.
const MIN_FIRESTORE_SECONDS = -62_135_596_800;
const MAX_FIRESTORE_SECONDS = 253_402_300_799;
exports.CanonicalTimestampSchema = zod_1.z
    .object({
    seconds: zod_1.z.number().finite().int().min(MIN_FIRESTORE_SECONDS).max(MAX_FIRESTORE_SECONDS),
    nanoseconds: zod_1.z.number().finite().int().min(0).max(999_999_999),
})
    .strict();
function compareCanonicalTimestamps(left, right) {
    if (left.seconds < right.seconds)
        return -1;
    if (left.seconds > right.seconds)
        return 1;
    if (left.nanoseconds < right.nanoseconds)
        return -1;
    if (left.nanoseconds > right.nanoseconds)
        return 1;
    return 0;
}
function timestampFromDate(value) {
    const epochMilliseconds = value.getTime();
    if (!Number.isFinite(epochMilliseconds)) {
        throw new RangeError('Date must represent a valid UTC instant');
    }
    const seconds = Math.floor(epochMilliseconds / 1_000);
    return exports.CanonicalTimestampSchema.parse({
        seconds,
        nanoseconds: (epochMilliseconds - seconds * 1_000) * 1_000_000,
    });
}
exports.TimeIntervalSchema = zod_1.z
    .object({
    startsAt: exports.CanonicalTimestampSchema,
    endsAt: exports.CanonicalTimestampSchema,
})
    .strict()
    .superRefine((interval, context) => {
    if (compareCanonicalTimestamps(interval.startsAt, interval.endsAt) >= 0) {
        context.addIssue({
            code: 'custom',
            path: ['endsAt'],
            message: 'endsAt must be later than startsAt',
        });
    }
});
function intervalsOverlap(left, right) {
    return (compareCanonicalTimestamps(left.startsAt, right.endsAt) < 0 &&
        compareCanonicalTimestamps(right.startsAt, left.endsAt) < 0);
}
function isIanaTimeZone(value) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
        return true;
    }
    catch {
        return false;
    }
}
exports.IanaTimeZoneSchema = zod_1.z
    .string()
    .min(1)
    .max(255)
    .refine(isIanaTimeZone, 'Timezone must be a valid IANA identifier');
