import { z } from 'zod';
import { CourseCatalogContentSchema } from '../courseCatalogContent';
import {
  CourseDaySchema,
  CourseLifecycleStatusSchema,
  CourseSchema,
} from '../courseEnrollmentAttendanceAdminIssue';
import { CourseIdSchema, InstructorIdSchema } from '../identifiers';
import { AggregateRevisionSchema, KztMinorUnitsSchema } from '../primitives';

export const ADMIN_COURSE_READ_MODEL_PAGE_SIZE_DEFAULT = 25;
export const ADMIN_COURSE_READ_MODEL_PAGE_SIZE_MAX = 50;

export const AdminCourseInstructorPresentationSchema = z
  .object({
    instructorId: InstructorIdSchema,
    name: z.string().trim().min(1).max(200),
    avatarUrl: z.string().trim().min(1).max(2_000).optional(),
    isAvailable: z.boolean().optional(),
  })
  .strict();

export const ADMIN_COURSE_ACTION_KINDS = [
  'change_course_title',
  'change_course_price',
  'change_course_capacity',
  'archive_course',
  'reactivate_course',
  'add_course_roster_instructor',
  'remove_course_roster_instructor',
  'create_course_day',
  'reassign_course_day_instructor',
  'reschedule_course_day',
  'remove_course_day',
  'update_course_catalog_content',
] as const;

export const AdminCourseAuthorizedActionSchema = z
  .object({
    kind: z.enum(ADMIN_COURSE_ACTION_KINDS),
    expectedRevision: AggregateRevisionSchema,
  })
  .strict();

export const AdminCourseReadModelSchema = z
  .object({
    courseId: CourseIdSchema,
    title: z.string().trim().min(1).max(200),
    lifecycle: CourseLifecycleStatusSchema,
    price: KztMinorUnitsSchema,
    capacity: z
      .object({
        totalSeats: z.number().finite().int().min(1).max(64),
        availableSeats: z.number().finite().int().min(0).max(64),
        occupiedConfirmedSeats: z.number().finite().int().min(0).max(64),
      })
      .strict(),
    revision: AggregateRevisionSchema,
    scheduleRevision: AggregateRevisionSchema,
    instructorRosterIds: z.array(InstructorIdSchema).min(1).max(16),
    instructors: z.array(AdminCourseInstructorPresentationSchema).max(16),
    courseDays: z.array(CourseDaySchema).max(64),
    activeEnrollmentCount: z.number().finite().int().nonnegative(),
    totalEnrollmentCount: z.number().finite().int().nonnegative(),
    provisioning: z
      .object({
        status: z.enum(['complete', 'incomplete', 'operationally_amended']),
        fingerprint: z.string().min(1).max(128).optional(),
      })
      .strict(),
    catalogContent: z
      .object({
        status: z.enum(['present', 'missing']),
        content: CourseCatalogContentSchema.optional(),
      })
      .strict(),
    authorizedActions: z.array(AdminCourseAuthorizedActionSchema).max(16),
    createdAt: CourseSchema.shape.createdAt,
    updatedAt: CourseSchema.shape.updatedAt,
  })
  .strict();

export type AdminCourseReadModel = z.output<typeof AdminCourseReadModelSchema>;

const AdminCourseListInputSchema = z
  .object({
    scope: z.literal('admin_course_list'),
    pageSize: z.number().int().positive().max(ADMIN_COURSE_READ_MODEL_PAGE_SIZE_MAX).optional(),
  })
  .strict();

const AdminCourseDetailInputSchema = z
  .object({
    scope: z.literal('admin_course_detail'),
    courseId: CourseIdSchema,
  })
  .strict();

export const QueryAdminCourseReadModelsInputSchema = z.discriminatedUnion('scope', [
  AdminCourseListInputSchema,
  AdminCourseDetailInputSchema,
]);

export type QueryAdminCourseReadModelsInput = z.output<
  typeof QueryAdminCourseReadModelsInputSchema
>;

export const QueryAdminCourseReadModelsResultSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('admin_course_list'),
      items: z.array(AdminCourseReadModelSchema).max(ADMIN_COURSE_READ_MODEL_PAGE_SIZE_MAX),
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_course_detail'),
      item: AdminCourseReadModelSchema.optional(),
    })
    .strict(),
]);

export type QueryAdminCourseReadModelsResult = z.output<
  typeof QueryAdminCourseReadModelsResultSchema
>;
