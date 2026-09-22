import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import { InstructorIdSchema } from '../identifiers';

export const BOOKING_INSTRUCTOR_CATALOGUE_READ_LIMIT = 100;

const BookingInstructorSpecialtySchema = z.enum(['ski', 'snowboard', 'both']);

export const BookingInstructorCatalogueItemSchema = z
  .object({
    instructorId: InstructorIdSchema,
    name: z.string().trim().min(1).max(200),
    specialty: BookingInstructorSpecialtySchema.optional(),
    languages: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
    experienceYears: z.number().int().min(0).max(80).optional(),
    bio: z.string().max(4000).optional(),
    avatarUrl: z.string().max(2000).optional(),
    pricePerHour: z.number().finite().optional(),
    pricePerHourKZT: z.number().finite().int().min(0).optional(),
    phoneNumber: z.string().trim().min(1).max(40).optional(),
    isAvailable: z.boolean(),
  })
  .strict()
  .refine((item) => item.pricePerHour !== undefined || item.pricePerHourKZT !== undefined, {
    message: 'A booking instructor needs a price.',
  });

export type BookingInstructorCatalogueItem = z.output<typeof BookingInstructorCatalogueItemSchema>;

export const QueryBookingInstructorCatalogueReadModelsInputSchema = z
  .object({
    // Transport dedupe only. The `:rs:` suffix is not CanonicalReadScope.
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export type QueryBookingInstructorCatalogueReadModelsInput = z.output<
  typeof QueryBookingInstructorCatalogueReadModelsInputSchema
>;

export const QueryBookingInstructorCatalogueReadModelsResultSchema = z
  .object({
    scope: z.literal('booking_catalogue'),
    items: z.array(BookingInstructorCatalogueItemSchema).max(BOOKING_INSTRUCTOR_CATALOGUE_READ_LIMIT),
  })
  .strict();

export type QueryBookingInstructorCatalogueReadModelsResult = z.output<
  typeof QueryBookingInstructorCatalogueReadModelsResultSchema
>;
