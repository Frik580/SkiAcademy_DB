import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import { ParticipantIdSchema } from '../identifiers';
import { IanaTimeZoneSchema, TimeIntervalSchema } from '../primitives';
import {
  ADMIN_PLANNER_OCCUPANCY_HORIZON_DAYS_MAX,
  ADMIN_PLANNER_READ_MODEL_PAGE_SIZE_MAX,
  AdminPlannerOccupancyItemSchema,
} from './adminPlannerReadModel';

export const QueryParticipantOccupancyReadModelsInputSchema = z
  .object({
    scope: z.literal('account_participant_day'),
    participantIds: z.array(ParticipantIdSchema).min(1).max(8),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: IanaTimeZoneSchema,
    windowDays: z.number().int().min(1).max(ADMIN_PLANNER_OCCUPANCY_HORIZON_DAYS_MAX).optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export type QueryParticipantOccupancyReadModelsInput = z.output<
  typeof QueryParticipantOccupancyReadModelsInputSchema
>;

export const ParticipantOccupancySliceSchema = z
  .object({
    participantId: ParticipantIdSchema,
    occupancy: z.array(AdminPlannerOccupancyItemSchema).max(ADMIN_PLANNER_READ_MODEL_PAGE_SIZE_MAX),
    truncated: z.boolean(),
  })
  .strict();

export type ParticipantOccupancySlice = z.output<typeof ParticipantOccupancySliceSchema>;

export const ParticipantOccupancyReadModelSchema = z
  .object({
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: IanaTimeZoneSchema,
    window: TimeIntervalSchema,
    items: z.array(ParticipantOccupancySliceSchema).max(8),
  })
  .strict();

export type ParticipantOccupancyReadModel = z.output<typeof ParticipantOccupancyReadModelSchema>;

export const QueryParticipantOccupancyReadModelsResultSchema = z
  .object({
    scope: z.literal('account_participant_day'),
    item: ParticipantOccupancyReadModelSchema,
  })
  .strict();

export type QueryParticipantOccupancyReadModelsResult = z.output<
  typeof QueryParticipantOccupancyReadModelsResultSchema
>;
