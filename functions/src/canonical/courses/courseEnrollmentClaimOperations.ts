import {
  buildCourseSeatClaimIdentity,
  buildParticipantCourseDayEnrollmentClaimIdentity,
  courseDayIntervalHasStarted,
  courseEnrollmentSeatOccurrenceId,
  courseSeatClaimInterval,
  type Course,
  type CourseDay,
  type CourseEnrollment,
  type CanonicalTimestamp,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  commitReleaseActiveCourseEnrollmentGuard,
  readAndPlanReleaseActiveCourseEnrollmentGuard,
} from '../resourceClaims/uniquenessGuards';
import {
  commitResourceClaimPlan,
  readAndPlanAcquireResourceClaim,
  readAndPlanReleaseResourceClaim,
  registerResourceClaimPlanInGuardOverlay,
  type InTransactionGuardOverlay,
  type ResourceClaimOperationPlan,
} from '../resourceClaims/resourceClaimEngine';

export interface CourseEnrollmentClaimCommandMetadata {
  readonly correlationId: import('@ski-academy/shared-domain').CorrelationId;
  readonly commandId: import('@ski-academy/shared-domain').CommandId;
  readonly decidedAt: Date;
}

export interface PlannedCourseEnrollmentClaimRelease {
  readonly seatClaimPlan?: ResourceClaimOperationPlan;
  readonly dayClaimPlans: readonly ResourceClaimOperationPlan[];
  readonly releaseActiveGuard: boolean;
  readonly incrementAvailableSeats: boolean;
}

export async function planReleaseCourseEnrollmentClaims(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly metadata: CourseEnrollmentClaimCommandMetadata;
    readonly enrollment: CourseEnrollment;
    readonly course: Course;
    readonly courseDays: readonly CourseDay[];
    readonly now: CanonicalTimestamp;
    readonly releaseSeat: boolean;
    readonly releaseFutureDayClaimsOnly: boolean;
  }
): Promise<PlannedCourseEnrollmentClaimRelease> {
  const claimMetadata = {
    correlationId: input.metadata.correlationId,
    commandId: input.metadata.commandId,
    decidedAt: input.metadata.decidedAt,
  };

  let seatClaimPlan: ResourceClaimOperationPlan | undefined;
  if (input.releaseSeat) {
    const seatIdentity = buildCourseSeatClaimIdentity({
      courseId: input.course.courseId,
      enrollmentId: input.enrollment.enrollmentId,
      occurrenceId: courseEnrollmentSeatOccurrenceId(input.enrollment.enrollmentId),
    });
    seatClaimPlan = await readAndPlanReleaseResourceClaim(session, {
      ...claimMetadata,
      claimId: seatIdentity.claimId,
    });
  }

  const dayClaimPlans: ResourceClaimOperationPlan[] = [];
  for (const courseDay of input.courseDays) {
    const shouldRelease =
      !input.releaseFutureDayClaimsOnly ||
      !courseDayIntervalHasStarted(courseDay.interval, input.now);
    if (!shouldRelease) {
      continue;
    }
    const dayIdentity = buildParticipantCourseDayEnrollmentClaimIdentity({
      participantId: input.enrollment.participantId,
      enrollmentId: input.enrollment.enrollmentId,
      courseDay,
    });
    dayClaimPlans.push(
      await readAndPlanReleaseResourceClaim(session, {
        ...claimMetadata,
        claimId: dayIdentity.claimId,
      })
    );
  }

  const releaseActiveGuard = await readAndPlanReleaseActiveCourseEnrollmentGuard(session, {
    ...claimMetadata,
    participantId: input.enrollment.participantId,
    courseId: input.enrollment.courseId,
    courseEnrollmentId: input.enrollment.enrollmentId,
  });

  return {
    seatClaimPlan,
    dayClaimPlans,
    releaseActiveGuard,
    incrementAvailableSeats: input.releaseSeat,
  };
}

export function commitPlannedCourseEnrollmentClaimRelease(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly metadata: CourseEnrollmentClaimCommandMetadata;
    readonly enrollment: CourseEnrollment;
    readonly planned: PlannedCourseEnrollmentClaimRelease;
  }
): void {
  const claimMetadata = {
    correlationId: input.metadata.correlationId,
    commandId: input.metadata.commandId,
    decidedAt: input.metadata.decidedAt,
  };

  if (input.planned.seatClaimPlan) {
    commitResourceClaimPlan(session, input.planned.seatClaimPlan, claimMetadata);
  }
  for (const dayClaimPlan of input.planned.dayClaimPlans) {
    commitResourceClaimPlan(session, dayClaimPlan, claimMetadata);
  }
  if (input.planned.releaseActiveGuard) {
    commitReleaseActiveCourseEnrollmentGuard(session, {
      ...claimMetadata,
      participantId: input.enrollment.participantId,
      courseId: input.enrollment.courseId,
      courseEnrollmentId: input.enrollment.enrollmentId,
    });
  }
}

export async function planAcquireCourseEnrollmentClaims(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly metadata: CourseEnrollmentClaimCommandMetadata;
    readonly enrollment: CourseEnrollment;
    readonly course: Course;
    readonly courseDays: readonly CourseDay[];
    readonly decidedAtTimestamp: CanonicalTimestamp;
    readonly inTransactionGuardOverlay: InTransactionGuardOverlay;
  }
): Promise<{
  readonly seatClaimPlan: ResourceClaimOperationPlan;
  readonly dayClaimPlans: readonly ResourceClaimOperationPlan[];
}> {
  const claimMetadata = {
    correlationId: input.metadata.correlationId,
    commandId: input.metadata.commandId,
    decidedAt: input.metadata.decidedAt,
  };
  const seatInterval = courseSeatClaimInterval({
    decidedAt: input.decidedAtTimestamp,
    course: input.course,
  });
  const seatIdentity = buildCourseSeatClaimIdentity({
    courseId: input.course.courseId,
    enrollmentId: input.enrollment.enrollmentId,
    occurrenceId: courseEnrollmentSeatOccurrenceId(input.enrollment.enrollmentId),
  });
  const seatClaimPlan = await readAndPlanAcquireResourceClaim(session, {
    ...claimMetadata,
    identity: seatIdentity.identity,
    interval: seatInterval,
    inTransactionGuardOverlay: input.inTransactionGuardOverlay,
  });
  registerResourceClaimPlanInGuardOverlay(input.inTransactionGuardOverlay, seatClaimPlan);

  const dayClaimPlans: ResourceClaimOperationPlan[] = [];
  for (const courseDay of input.courseDays) {
    const dayIdentity = buildParticipantCourseDayEnrollmentClaimIdentity({
      participantId: input.enrollment.participantId,
      enrollmentId: input.enrollment.enrollmentId,
      courseDay,
    });
    const dayClaimPlan = await readAndPlanAcquireResourceClaim(session, {
      ...claimMetadata,
      identity: dayIdentity.identity,
      interval: courseDay.interval,
      inTransactionGuardOverlay: input.inTransactionGuardOverlay,
    });
    registerResourceClaimPlanInGuardOverlay(input.inTransactionGuardOverlay, dayClaimPlan);
    dayClaimPlans.push(dayClaimPlan);
  }

  return { seatClaimPlan, dayClaimPlans };
}

export function commitPlannedCourseEnrollmentClaimAcquire(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly metadata: CourseEnrollmentClaimCommandMetadata;
    readonly seatClaimPlan: ResourceClaimOperationPlan;
    readonly dayClaimPlans: readonly ResourceClaimOperationPlan[];
  }
): void {
  const claimMetadata = {
    correlationId: input.metadata.correlationId,
    commandId: input.metadata.commandId,
    decidedAt: input.metadata.decidedAt,
  };
  commitResourceClaimPlan(session, input.seatClaimPlan, claimMetadata);
  for (const dayClaimPlan of input.dayClaimPlans) {
    commitResourceClaimPlan(session, dayClaimPlan, claimMetadata);
  }
}
