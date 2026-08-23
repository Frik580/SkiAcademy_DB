import { z } from 'zod';

declare const aggregateRevisionBrand: unique symbol;
declare const kztMinorUnitsBrand: unique symbol;

export type AggregateRevision = number & {
  readonly [aggregateRevisionBrand]: 'AggregateRevision';
};

export type KztMinorUnits = number & {
  readonly [kztMinorUnitsBrand]: 'KztMinorUnits';
};

const SafeNonNegativeIntegerSchema = z
  .number()
  .finite()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

export const AggregateRevisionSchema = SafeNonNegativeIntegerSchema.transform(
  (value) => value as AggregateRevision
);

export const KztMinorUnitsSchema = SafeNonNegativeIntegerSchema.transform(
  (value) => value as KztMinorUnits
);

export const KztMoneySchema = z
  .object({
    currency: z.literal('KZT'),
    minorUnits: KztMinorUnitsSchema,
  })
  .strict();

export type KztMoney = z.output<typeof KztMoneySchema>;

// Firestore Timestamp's documented UTC range: year 0001 through year 9999.
const MIN_FIRESTORE_SECONDS = -62_135_596_800;
const MAX_FIRESTORE_SECONDS = 253_402_300_799;

export const CanonicalTimestampSchema = z
  .object({
    seconds: z.number().finite().int().min(MIN_FIRESTORE_SECONDS).max(MAX_FIRESTORE_SECONDS),
    nanoseconds: z.number().finite().int().min(0).max(999_999_999),
  })
  .strict();

export type CanonicalTimestamp = Readonly<z.output<typeof CanonicalTimestampSchema>>;

export function compareCanonicalTimestamps(
  left: CanonicalTimestamp,
  right: CanonicalTimestamp
): -1 | 0 | 1 {
  if (left.seconds < right.seconds) return -1;
  if (left.seconds > right.seconds) return 1;
  if (left.nanoseconds < right.nanoseconds) return -1;
  if (left.nanoseconds > right.nanoseconds) return 1;
  return 0;
}

export function timestampFromDate(value: Date): CanonicalTimestamp {
  const epochMilliseconds = value.getTime();
  if (!Number.isFinite(epochMilliseconds)) {
    throw new RangeError('Date must represent a valid UTC instant');
  }

  const seconds = Math.floor(epochMilliseconds / 1_000);
  return CanonicalTimestampSchema.parse({
    seconds,
    nanoseconds: (epochMilliseconds - seconds * 1_000) * 1_000_000,
  });
}

export const TimeIntervalSchema = z
  .object({
    startsAt: CanonicalTimestampSchema,
    endsAt: CanonicalTimestampSchema,
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

export type TimeInterval = Readonly<z.output<typeof TimeIntervalSchema>>;

export function intervalsOverlap(left: TimeInterval, right: TimeInterval): boolean {
  return (
    compareCanonicalTimestamps(left.startsAt, right.endsAt) < 0 &&
    compareCanonicalTimestamps(right.startsAt, left.endsAt) < 0
  );
}

function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const IanaTimeZoneSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(isIanaTimeZone, 'Timezone must be a valid IANA identifier');

export type IanaTimeZone = z.output<typeof IanaTimeZoneSchema>;
