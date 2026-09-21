import { z } from 'zod';
import {
  AdministrativeAvailabilityBlockIdSchema,
  InstructorIdSchema,
  TestSessionIdSchema,
} from './identifiers';
import { DataScopeSchema } from './canonicalScope';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  IanaTimeZoneSchema,
  TimeIntervalSchema,
} from './primitives';

export const ADMINISTRATIVE_AVAILABILITY_BLOCK_KINDS = ['break', 'day_off', 'unavailable'] as const;
export type AdministrativeAvailabilityBlockKind =
  (typeof ADMINISTRATIVE_AVAILABILITY_BLOCK_KINDS)[number];

export const AdministrativeAvailabilityBlockKindSchema = z.enum(
  ADMINISTRATIVE_AVAILABILITY_BLOCK_KINDS
);

export const AdministrativeAvailabilityBlockSchema = z
  .object({
    blockId: AdministrativeAvailabilityBlockIdSchema,
    dataScope: DataScopeSchema.optional(),
    testSessionId: TestSessionIdSchema.optional(),
    instructorId: InstructorIdSchema,
    kind: AdministrativeAvailabilityBlockKindSchema,
    interval: TimeIntervalSchema,
    timeZone: IanaTimeZoneSchema,
    notes: z.string().trim().max(1_000).optional(),
    lifecycle: z.enum(['active', 'released']),
    scheduleRevision: AggregateRevisionSchema,
    revision: AggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdministrativeAvailabilityBlock = Readonly<
  z.output<typeof AdministrativeAvailabilityBlockSchema>
>;
