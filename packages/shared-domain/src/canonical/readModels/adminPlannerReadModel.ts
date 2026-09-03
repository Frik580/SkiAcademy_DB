import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import { AdministrativeAvailabilityBlockKindSchema } from '../administrativeAvailabilityBlock';
import {
  AdministrativeAvailabilityBlockIdSchema,
  AccountIdSchema,
  BookingIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
} from '../identifiers';
import { BookingLifecycleStatusSchema, LessonDifficultySchema } from '../bookingOccurrenceProposalChange';
import { AggregateRevisionSchema, IanaTimeZoneSchema, TimeIntervalSchema } from '../primitives';

export const ADMIN_PLANNER_READ_MODEL_PAGE_SIZE_MAX = 500;
export const ADMIN_PLANNER_OCCUPANCY_HORIZON_DAYS_MAX = 62;

export const AdminPlannerOccupancyKindSchema = z.enum([
  'lesson_booking',
  'course_day',
  'availability_block',
]);

export type AdminPlannerOccupancyKind = z.output<typeof AdminPlannerOccupancyKindSchema>;

export const AdminPlannerInstructorPresentationSchema = z
  .object({
    instructorId: InstructorIdSchema,
    name: z.string().trim().min(1).max(200),
    avatarUrl: z.string().trim().min(1).max(2_000).optional(),
    specialty: z.enum(['ski', 'snowboard', 'both']).optional(),
    pricePerHourKZT: z.number().finite().int().nonnegative().optional(),
    isAvailable: z.boolean(),
    revision: AggregateRevisionSchema.optional(),
  })
  .strict();

export type AdminPlannerInstructorPresentation = z.output<
  typeof AdminPlannerInstructorPresentationSchema
>;

export const AdminPlannerOccupancyItemSchema = z
  .object({
    occupancyKind: AdminPlannerOccupancyKindSchema,
    occupancyId: z.string().trim().min(1).max(260),
    instructorId: InstructorIdSchema,
    interval: TimeIntervalSchema,
    timeZone: IanaTimeZoneSchema,
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    localTime: z.string().regex(/^\d{2}:\d{2}$/),
    durationMinutes: z
      .number()
      .finite()
      .int()
      .positive()
      .max(24 * 60),
    displayTitle: z.string().trim().min(1).max(200),
    lifecycleStatus: BookingLifecycleStatusSchema.optional(),
    revision: AggregateRevisionSchema.optional(),
    bookingId: BookingIdSchema.optional(),
    participantId: ParticipantIdSchema.optional(),
    payerAccountId: AccountIdSchema.optional(),
    isGuest: z.boolean().optional(),
    courseId: CourseIdSchema.optional(),
    courseDayId: CourseDayIdSchema.optional(),
    courseRevision: AggregateRevisionSchema.optional(),
    blockId: AdministrativeAvailabilityBlockIdSchema.optional(),
    blockKind: AdministrativeAvailabilityBlockKindSchema.optional(),
    difficulty: LessonDifficultySchema.optional(),
    notes: z.string().trim().max(1_000).optional(),
  })
  .strict();

export type AdminPlannerOccupancyItem = z.output<typeof AdminPlannerOccupancyItemSchema>;

export const AdminPlannerReadModelSchema = z
  .object({
    view: z.enum(['day', 'week']),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: IanaTimeZoneSchema,
    window: TimeIntervalSchema,
    instructors: z.array(AdminPlannerInstructorPresentationSchema).max(64),
    occupancy: z.array(AdminPlannerOccupancyItemSchema).max(ADMIN_PLANNER_READ_MODEL_PAGE_SIZE_MAX),
    truncated: z.boolean(),
  })
  .strict();

export type AdminPlannerReadModel = z.output<typeof AdminPlannerReadModelSchema>;

export const QueryAdminPlannerReadModelsInputSchema = z
  .object({
    scope: z.literal('admin_planner'),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    view: z.enum(['day', 'week']).default('day'),
    timeZone: IanaTimeZoneSchema,
    windowDays: z.number().int().min(1).max(ADMIN_PLANNER_OCCUPANCY_HORIZON_DAYS_MAX).optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export type QueryAdminPlannerReadModelsInput = z.output<
  typeof QueryAdminPlannerReadModelsInputSchema
>;

export const QueryAdminPlannerReadModelsResultSchema = z
  .object({
    scope: z.literal('admin_planner'),
    item: AdminPlannerReadModelSchema,
  })
  .strict();

export type QueryAdminPlannerReadModelsResult = z.output<
  typeof QueryAdminPlannerReadModelsResultSchema
>;
