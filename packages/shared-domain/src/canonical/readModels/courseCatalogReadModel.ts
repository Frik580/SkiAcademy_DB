import { z } from 'zod';
import { CourseIdSchema } from '../identifiers';
import { CourseScheduleProjectionReadModelSchema } from './courseDayScheduleProjection';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  KztMinorUnitsSchema,
} from '../primitives';

export const COURSE_CATALOG_READ_SCOPES = ['public', 'authenticated'] as const;
export type CourseCatalogReadScope = (typeof COURSE_CATALOG_READ_SCOPES)[number];

export const CourseCatalogReadScopeSchema = z.enum(COURSE_CATALOG_READ_SCOPES);

export const CourseCatalogCapacityPresentationSchema = z
  .object({
    totalSeats: z.number().finite().int().min(1).max(64),
    availableSeats: z.number().finite().int().min(0).max(64),
    isCapacityFrozen: z.boolean(),
    isEnrollmentEligible: z.boolean(),
    isFull: z.boolean(),
  })
  .strict();

export type CourseCatalogCapacityPresentation = z.output<
  typeof CourseCatalogCapacityPresentationSchema
>;

export const CourseCatalogReadModelSchema = z
  .object({
    courseId: CourseIdSchema,
    revision: AggregateRevisionSchema,
    title: z.string().trim().min(1).max(200),
    price: KztMinorUnitsSchema,
    capacity: CourseCatalogCapacityPresentationSchema,
    scheduleSummary: z
      .object({
        startAt: CanonicalTimestampSchema,
        finalCourseDayEndsAt: CanonicalTimestampSchema,
        courseDayCount: z.number().finite().int().min(1).max(64),
      })
      .strict(),
    courseSchedule: CourseScheduleProjectionReadModelSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type CourseCatalogReadModel = z.output<typeof CourseCatalogReadModelSchema>;

export const QueryCourseCatalogReadModelsInputSchema = z
  .object({
    scope: CourseCatalogReadScopeSchema,
    courseId: CourseIdSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.scope === 'authenticated' && !input.courseId) {
      context.addIssue({
        code: 'custom',
        path: ['courseId'],
        message: 'courseId is required for authenticated catalog scope',
      });
    }
  });

export type QueryCourseCatalogReadModelsInput = z.output<
  typeof QueryCourseCatalogReadModelsInputSchema
>;

export const QueryCourseCatalogReadModelsResultSchema = z
  .object({
    scope: CourseCatalogReadScopeSchema,
    items: z.array(CourseCatalogReadModelSchema),
  })
  .strict();

export type QueryCourseCatalogReadModelsResult = z.output<
  typeof QueryCourseCatalogReadModelsResultSchema
>;
