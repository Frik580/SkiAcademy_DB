import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import { InstructorIdSchema } from '../identifiers';
import { IanaTimeZoneSchema, TimeIntervalSchema } from '../primitives';
import {
  ADMIN_PLANNER_OCCUPANCY_HORIZON_DAYS_MAX,
  ADMIN_PLANNER_READ_MODEL_PAGE_SIZE_MAX,
  AdminPlannerOccupancyItemSchema,
} from './adminPlannerReadModel';

export const QueryInstructorOccupancyReadModelsInputSchema = z
  .object({
    scope: z.literal('public_instructor_day'),
    instructorId: InstructorIdSchema,
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: IanaTimeZoneSchema,
    windowDays: z.number().int().min(1).max(ADMIN_PLANNER_OCCUPANCY_HORIZON_DAYS_MAX).optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export type QueryInstructorOccupancyReadModelsInput = z.output<
  typeof QueryInstructorOccupancyReadModelsInputSchema
>;

export const InstructorOccupancyReadModelSchema = z
  .object({
    instructorId: InstructorIdSchema,
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: IanaTimeZoneSchema,
    window: TimeIntervalSchema,
    occupancy: z.array(AdminPlannerOccupancyItemSchema).max(ADMIN_PLANNER_READ_MODEL_PAGE_SIZE_MAX),
    truncated: z.boolean(),
  })
  .strict();

export type InstructorOccupancyReadModel = z.output<typeof InstructorOccupancyReadModelSchema>;

export const QueryInstructorOccupancyReadModelsResultSchema = z
  .object({
    scope: z.literal('public_instructor_day'),
    item: InstructorOccupancyReadModelSchema,
  })
  .strict();

export type QueryInstructorOccupancyReadModelsResult = z.output<
  typeof QueryInstructorOccupancyReadModelsResultSchema
>;
