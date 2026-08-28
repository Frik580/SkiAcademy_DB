import { z } from 'zod';
import { CourseDayIdSchema, CourseIdSchema } from '../identifiers';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  IanaTimeZoneSchema,
  TimeIntervalSchema,
} from '../primitives';

export const CourseDayScheduleItemSchema = z
  .object({
    courseDayId: CourseDayIdSchema,
    dayOrder: z.number().finite().int().min(1).max(64),
    interval: TimeIntervalSchema,
    timeZone: IanaTimeZoneSchema,
    revision: AggregateRevisionSchema,
  })
  .strict();

export type CourseDayScheduleItem = Readonly<z.output<typeof CourseDayScheduleItemSchema>>;

export const CourseScheduleProjectionReadModelSchema = z
  .object({
    courseId: CourseIdSchema,
    courseScheduleRevision: AggregateRevisionSchema,
    courseDayCount: z.number().finite().int().min(1).max(64),
    startAt: CanonicalTimestampSchema,
    finalCourseDayEndsAt: CanonicalTimestampSchema,
    courseDays: z.array(CourseDayScheduleItemSchema).min(1).max(64),
  })
  .strict();

export type CourseScheduleProjectionReadModel = Readonly<
  z.output<typeof CourseScheduleProjectionReadModelSchema>
>;
