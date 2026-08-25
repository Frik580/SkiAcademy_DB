"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertInstructorOnCourseRoster = assertInstructorOnCourseRoster;
exports.resolveNextCourseDayOrder = resolveNextCourseDayOrder;
exports.assertStrictlyIncreasingCourseDayStarts = assertStrictlyIncreasingCourseDayStarts;
exports.assertCourseDayCountWithinLimit = assertCourseDayCountWithinLimit;
exports.deriveCourseScheduleProjectionAfterDayAdded = deriveCourseScheduleProjectionAfterDayAdded;
exports.courseDayIntervalHasStarted = courseDayIntervalHasStarted;
exports.deriveCourseStartAtAfterFirstDay = deriveCourseStartAtAfterFirstDay;
const courseEnrollmentAttendanceAdminIssue_1 = require("./courseEnrollmentAttendanceAdminIssue");
const primitives_1 = require("./primitives");
function assertInstructorOnCourseRoster(course, instructorId) {
    return course.instructorRosterIds.includes(instructorId);
}
function resolveNextCourseDayOrder(existingDays) {
    if (existingDays.length === 0) {
        return 1;
    }
    const maxOrder = existingDays.reduce((max, day) => Math.max(max, day.dayOrder), 0);
    return maxOrder + 1;
}
function assertStrictlyIncreasingCourseDayStarts(existingDays, newInterval) {
    for (const existingDay of existingDays) {
        if ((0, primitives_1.compareCanonicalTimestamps)(newInterval.startsAt, existingDay.interval.startsAt) <= 0) {
            throw new Error('CourseDay startsAt must be strictly after existing CourseDay startsAt values');
        }
    }
}
function assertCourseDayCountWithinLimit(existingDayCount) {
    if (existingDayCount >= courseEnrollmentAttendanceAdminIssue_1.COURSE_DAY_MAX) {
        throw new Error('CourseDay count exceeds canonical maximum');
    }
}
function deriveCourseScheduleProjectionAfterDayAdded(course, newInterval, newDayCount) {
    const finalCourseDayEndsAt = (0, primitives_1.compareCanonicalTimestamps)(newInterval.endsAt, course.scheduleProjection.finalCourseDayEndsAt) > 0
        ? newInterval.endsAt
        : course.scheduleProjection.finalCourseDayEndsAt;
    return {
        courseDayCount: newDayCount,
        finalCourseDayEndsAt,
        courseScheduleRevision: primitives_1.AggregateRevisionSchema.parse(course.scheduleProjection.courseScheduleRevision + 1),
    };
}
function courseDayIntervalHasStarted(interval, decidedAt) {
    return (0, primitives_1.compareCanonicalTimestamps)(decidedAt, interval.startsAt) >= 0;
}
function deriveCourseStartAtAfterFirstDay(course, firstDayInterval, existingDayCount) {
    if (existingDayCount > 0) {
        return course.startAt;
    }
    return firstDayInterval.startsAt;
}
