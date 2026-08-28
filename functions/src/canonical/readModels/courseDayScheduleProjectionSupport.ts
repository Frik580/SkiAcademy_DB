import {
  CourseDayScheduleItemSchema,
  CourseScheduleProjectionReadModelSchema,
  sortedCourseDays,
  type Course,
  type CourseDay,
  type CourseScheduleProjectionReadModel,
} from '@ski-academy/shared-domain';

export function buildCourseScheduleProjectionReadModel(
  course: Course,
  courseDays: readonly CourseDay[]
): CourseScheduleProjectionReadModel {
  const orderedDays = sortedCourseDays(courseDays);
  return CourseScheduleProjectionReadModelSchema.parse({
    courseId: course.courseId,
    courseScheduleRevision: course.scheduleProjection.courseScheduleRevision,
    courseDayCount: course.scheduleProjection.courseDayCount,
    startAt: course.startAt,
    finalCourseDayEndsAt: course.scheduleProjection.finalCourseDayEndsAt,
    courseDays: orderedDays.map((courseDay) =>
      CourseDayScheduleItemSchema.parse({
        courseDayId: courseDay.courseDayId,
        dayOrder: courseDay.dayOrder,
        interval: courseDay.interval,
        timeZone: courseDay.timeZone,
        revision: courseDay.revision,
      })
    ),
  });
}
