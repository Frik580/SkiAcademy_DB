import { z } from 'zod';
import { type CanonicalTimestamp } from './primitives';
export declare function normalizeCanonicalTimestamp(value: unknown): CanonicalTimestamp | undefined;
export declare function normalizeFirestoreRecord(value: unknown): unknown;
export declare function normalizeFirestoreDocument(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined;
export declare const NormalizedCanonicalTimestampSchema: z.ZodPreprocess<z.ZodObject<{
    seconds: z.ZodNumber;
    nanoseconds: z.ZodNumber;
}, z.core.$strict>>;
