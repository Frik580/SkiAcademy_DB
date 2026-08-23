import { z } from 'zod';
declare const aggregateRevisionBrand: unique symbol;
declare const kztMinorUnitsBrand: unique symbol;
export type AggregateRevision = number & {
    readonly [aggregateRevisionBrand]: 'AggregateRevision';
};
export type KztMinorUnits = number & {
    readonly [kztMinorUnitsBrand]: 'KztMinorUnits';
};
export declare const AggregateRevisionSchema: z.ZodPipe<z.ZodNumber, z.ZodTransform<AggregateRevision, number>>;
export declare const KztMinorUnitsSchema: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
export declare const KztMoneySchema: z.ZodObject<{
    currency: z.ZodLiteral<"KZT">;
    minorUnits: z.ZodPipe<z.ZodNumber, z.ZodTransform<KztMinorUnits, number>>;
}, z.core.$strict>;
export type KztMoney = z.output<typeof KztMoneySchema>;
export declare const CanonicalTimestampSchema: z.ZodObject<{
    seconds: z.ZodNumber;
    nanoseconds: z.ZodNumber;
}, z.core.$strict>;
export type CanonicalTimestamp = Readonly<z.output<typeof CanonicalTimestampSchema>>;
export declare function compareCanonicalTimestamps(left: CanonicalTimestamp, right: CanonicalTimestamp): -1 | 0 | 1;
export declare function timestampFromDate(value: Date): CanonicalTimestamp;
export declare const TimeIntervalSchema: z.ZodObject<{
    startsAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    endsAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>;
export type TimeInterval = Readonly<z.output<typeof TimeIntervalSchema>>;
export declare function intervalsOverlap(left: TimeInterval, right: TimeInterval): boolean;
export declare const IanaTimeZoneSchema: z.ZodString;
export type IanaTimeZone = z.output<typeof IanaTimeZoneSchema>;
export {};
