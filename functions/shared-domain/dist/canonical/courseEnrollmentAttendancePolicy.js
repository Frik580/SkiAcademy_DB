"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instructorMayCorrectAttendance = exports.COURSE_DAY_INSTRUCTOR_ATTENDANCE_WINDOW_MS = void 0;
exports.courseDayInstructorAttendanceWindowEnd = courseDayInstructorAttendanceWindowEnd;
exports.evaluateCourseEnrollmentOutcomeEligibility = evaluateCourseEnrollmentOutcomeEligibility;
exports.evaluateCourseEnrollmentAutomationEligibility = evaluateCourseEnrollmentAutomationEligibility;
exports.deriveCourseEnrollmentAttendanceSufficiency = deriveCourseEnrollmentAttendanceSufficiency;
exports.missingCourseDayAttendanceIssueIdentity = missingCourseDayAttendanceIssueIdentity;
exports.courseDayOccurrenceId = courseDayOccurrenceId;
exports.findCourseDayForEnrollment = findCourseDayForEnrollment;
exports.instructorAssignedToCourseDay = instructorAssignedToCourseDay;
exports.applyAttendanceSummaryDelta = applyAttendanceSummaryDelta;
exports.courseDayAttendanceMatchesCurrentOccurrence = courseDayAttendanceMatchesCurrentOccurrence;
exports.buildCourseEnrollmentAttendanceSummaryFromCurrentEvidence = buildCourseEnrollmentAttendanceSummaryFromCurrentEvidence;
exports.resolveMissingCourseDayIds = resolveMissingCourseDayIds;
exports.evaluateCourseEnrollmentOutcomeCalculator = evaluateCourseEnrollmentOutcomeCalculator;
exports.attendanceCorrectionWouldContradictTerminalOutcome = attendanceCorrectionWouldContradictTerminalOutcome;
exports.assertCourseDayInstructorAttendanceWindow = assertCourseDayInstructorAttendanceWindow;
const courseEnrollmentAttendanceAdminIssue_1 = require("./courseEnrollmentAttendanceAdminIssue");
const bookingAttendancePolicy_1 = require("./bookingAttendancePolicy");
Object.defineProperty(exports, "COURSE_DAY_INSTRUCTOR_ATTENDANCE_WINDOW_MS", { enumerable: true, get: function () { return bookingAttendancePolicy_1.BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS; } });
Object.defineProperty(exports, "instructorMayCorrectAttendance", { enumerable: true, get: function () { return bookingAttendancePolicy_1.instructorMayCorrectAttendance; } });
const guestBooking_1 = require("./guestBooking");
const deterministicIdentity_1 = require("./deterministicIdentity");
const primitives_1 = require("./primitives");
function courseDayInstructorAttendanceWindowEnd(endsAt) {
    return (0, guestBooking_1.addMillisecondsToCanonicalTimestamp)(endsAt, bookingAttendancePolicy_1.BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS);
}
function evaluateCourseEnrollmentOutcomeEligibility(input) {
    return (0, primitives_1.compareCanonicalTimestamps)(input.now, input.finalCourseDayEndsAt) >= 0
        ? 'eligible'
        : 'not_yet_eligible';
}
function evaluateCourseEnrollmentAutomationEligibility(input) {
    const automationEligibleAt = courseDayInstructorAttendanceWindowEnd(input.finalCourseDayEndsAt);
    return (0, primitives_1.compareCanonicalTimestamps)(input.now, automationEligibleAt) >= 0
        ? 'eligible'
        : 'not_yet_eligible';
}
function deriveCourseEnrollmentAttendanceSufficiency(input) {
    const summary = input.attendanceSummary;
    if (!summary) {
        return 'missing_attendance';
    }
    if (summary.presentDayCount >= 1) {
        return 'completed';
    }
    if (summary.absentDayCount === input.courseDayCount) {
        return 'no_show';
    }
    return 'missing_attendance';
}
function missingCourseDayAttendanceIssueIdentity(input) {
    return {
        strategyVersion: courseEnrollmentAttendanceAdminIssue_1.ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
        kind: 'missing_attendance',
        subjectKind: 'course_enrollment',
        subjectId: input.enrollmentId,
        courseDayId: input.courseDayId,
        participantId: input.participantId,
        occurrenceId: input.occurrenceId,
    };
}
function courseDayOccurrenceId(courseDay) {
    return (0, deterministicIdentity_1.courseDayOccurrenceIdFromRevision)(courseDay.courseDayId, courseDay.revision);
}
function findCourseDayForEnrollment(courseDays, courseDayId, courseId) {
    return courseDays.find((courseDay) => courseDay.courseDayId === courseDayId && courseDay.courseId === courseId);
}
function instructorAssignedToCourseDay(courseDay, instructorId) {
    return courseDay.actualInstructorIds.includes(instructorId);
}
function applyAttendanceSummaryDelta(input) {
    const existing = input.existing ?? {
        recordedDayCount: 0,
        presentDayCount: 0,
        absentDayCount: 0,
        projectionRevision: primitives_1.AggregateRevisionSchema.parse(0),
    };
    let recordedDayCount = existing.recordedDayCount;
    let presentDayCount = existing.presentDayCount;
    let absentDayCount = existing.absentDayCount;
    if (input.previousStatus === undefined) {
        recordedDayCount += 1;
        if (input.nextStatus === 'present') {
            presentDayCount += 1;
        }
        else {
            absentDayCount += 1;
        }
    }
    else if (input.previousStatus !== input.nextStatus) {
        if (input.previousStatus === 'present') {
            presentDayCount -= 1;
            absentDayCount += 1;
        }
        else {
            absentDayCount -= 1;
            presentDayCount += 1;
        }
    }
    return {
        recordedDayCount,
        presentDayCount,
        absentDayCount,
        projectionRevision: primitives_1.AggregateRevisionSchema.parse(existing.projectionRevision + 1),
    };
}
function courseDayAttendanceMatchesCurrentOccurrence(attendance, courseDay) {
    if (attendance.subject.subjectKind !== 'course_enrollment') {
        return false;
    }
    return attendance.subject.occurrenceId === courseDayOccurrenceId(courseDay);
}
function buildCourseEnrollmentAttendanceSummaryFromCurrentEvidence(input) {
    let recordedDayCount = 0;
    let presentDayCount = 0;
    let absentDayCount = 0;
    for (const courseDay of input.courseDays) {
        const attendance = input.attendancesByCourseDayId.get(courseDay.courseDayId);
        if (!attendance || !courseDayAttendanceMatchesCurrentOccurrence(attendance, courseDay)) {
            continue;
        }
        recordedDayCount += 1;
        if (attendance.attendanceStatus === 'present') {
            presentDayCount += 1;
        }
        else {
            absentDayCount += 1;
        }
    }
    return {
        recordedDayCount,
        presentDayCount,
        absentDayCount,
        projectionRevision: primitives_1.AggregateRevisionSchema.parse(0),
    };
}
function resolveMissingCourseDayIds(input) {
    return input.courseDays
        .filter((courseDay) => {
        const attendance = input.attendancesByCourseDayId.get(courseDay.courseDayId);
        return !attendance || !courseDayAttendanceMatchesCurrentOccurrence(attendance, courseDay);
    })
        .map((courseDay) => courseDay.courseDayId);
}
function evaluateCourseEnrollmentOutcomeCalculator(input) {
    const status = input.enrollment.lifecycle.status;
    if (status === 'cancelled' || status === 'withdrawn' || status === 'completed' || status === 'no_show') {
        return { outcome: 'blocked_terminal_lifecycle' };
    }
    if (status === 'pending_cancellation') {
        return { outcome: 'blocked_pending_cancellation' };
    }
    if (status !== 'confirmed') {
        return { outcome: 'blocked_terminal_lifecycle' };
    }
    const eligibility = input.automationOnly
        ? evaluateCourseEnrollmentAutomationEligibility({
            now: input.now,
            finalCourseDayEndsAt: input.course.scheduleProjection.finalCourseDayEndsAt,
        })
        : evaluateCourseEnrollmentOutcomeEligibility({
            now: input.now,
            finalCourseDayEndsAt: input.course.scheduleProjection.finalCourseDayEndsAt,
        });
    if (eligibility === 'not_yet_eligible') {
        return { outcome: 'not_yet_eligible' };
    }
    const blockingIssue = (0, bookingAttendancePolicy_1.hasOpenOutcomeBlockingAdminIssue)(input.openAdminIssues);
    if (blockingIssue) {
        return { outcome: 'blocked_outcome_issue', issueKind: blockingIssue.kind };
    }
    const effectiveSummary = buildCourseEnrollmentAttendanceSummaryFromCurrentEvidence({
        courseDays: input.courseDays,
        attendancesByCourseDayId: input.attendancesByCourseDayId,
    });
    const sufficiency = deriveCourseEnrollmentAttendanceSufficiency({
        courseDayCount: input.course.scheduleProjection.courseDayCount,
        attendanceSummary: effectiveSummary,
    });
    if (sufficiency === 'completed') {
        return { outcome: 'resolve', lifecycle: 'completed' };
    }
    if (sufficiency === 'no_show') {
        return { outcome: 'resolve', lifecycle: 'no_show' };
    }
    const missingCourseDayIds = resolveMissingCourseDayIds({
        courseDays: input.courseDays,
        attendancesByCourseDayId: input.attendancesByCourseDayId,
    });
    return {
        outcome: 'unresolved',
        issueKind: 'missing_attendance',
        missingCourseDayIds,
    };
}
function attendanceCorrectionWouldContradictTerminalOutcome(input) {
    const status = input.enrollment.lifecycle.status;
    if (status !== 'completed' && status !== 'no_show') {
        return false;
    }
    if (status === 'completed' && input.nextStatus === 'absent') {
        return true;
    }
    if (status === 'no_show' && input.nextStatus === 'present') {
        return true;
    }
    return false;
}
function assertCourseDayInstructorAttendanceWindow(input) {
    return (0, bookingAttendancePolicy_1.evaluateInstructorAttendanceWindow)({
        now: input.now,
        startsAt: input.courseDay.interval.startsAt,
        endsAt: input.courseDay.interval.endsAt,
    });
}
