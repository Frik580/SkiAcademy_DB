import {
  ResourceClaimIdentityInputSchema,
  courseDayOccurrenceIdFromRevision,
  resourceClaimIdFromIdentity,
  type CourseDay,
  type CourseDayId,
  type InstructorId,
  type OccurrenceId,
  type ResourceClaimReplacementIgnore,
  type TimeInterval,
} from '@ski-academy/shared-domain';
import {
  commitResourceClaimPlan,
  readAndPlanAcquireResourceClaim,
  readAndPlanReleaseResourceClaim,
  type InTransactionGuardOverlay,
} from '../resourceClaims/resourceClaimEngine';

export function courseDayInstructorClaimIdentity(input: {
  readonly courseDayId: CourseDayId;
  readonly instructorId: InstructorId;
  readonly occurrenceRevision: number;
}) {
  const occurrenceId = courseDayOccurrenceIdFromRevision(
    input.courseDayId,
    input.occurrenceRevision
  );
  const instructorIdentity = ResourceClaimIdentityInputSchema.parse({
    strategyVersion: 'claim:v1',
    claimKind: 'instructor_course_day',
    resourceKind: 'instructor',
    resourceId: input.instructorId,
    ownerKind: 'course_day',
    ownerId: input.courseDayId,
    occurrenceId,
  });
  return {
    occurrenceId,
    instructorIdentity,
    instructorClaimId: resourceClaimIdFromIdentity(instructorIdentity),
  };
}

export function replacementIgnoreForCourseDayOccurrence(
  courseDay: CourseDay
): ResourceClaimReplacementIgnore {
  return {
    ownerKind: 'course_day',
    ownerId: courseDay.courseDayId,
    occurrenceId: courseDayOccurrenceIdFromRevision(courseDay.courseDayId, courseDay.revision),
  };
}

export async function planAcquireCourseDayInstructorClaim(
  session: Parameters<typeof readAndPlanAcquireResourceClaim>[0],
  input: {
    readonly courseDayId: CourseDayId;
    readonly instructorId: InstructorId;
    readonly occurrenceRevision: number;
    readonly interval: TimeInterval;
    readonly replacementIgnore?: ResourceClaimReplacementIgnore;
    readonly correlationId: Parameters<typeof readAndPlanAcquireResourceClaim>[1]['correlationId'];
    readonly commandId: Parameters<typeof readAndPlanAcquireResourceClaim>[1]['commandId'];
    readonly decidedAt: Date;
    readonly inTransactionGuardOverlay?: InTransactionGuardOverlay;
  }
) {
  const identities = courseDayInstructorClaimIdentity({
    courseDayId: input.courseDayId,
    instructorId: input.instructorId,
    occurrenceRevision: input.occurrenceRevision,
  });
  return readAndPlanAcquireResourceClaim(session, {
    correlationId: input.correlationId,
    commandId: input.commandId,
    decidedAt: input.decidedAt,
    identity: identities.instructorIdentity,
    interval: input.interval,
    replacementIgnore: input.replacementIgnore,
    inTransactionGuardOverlay: input.inTransactionGuardOverlay,
  });
}

export async function planReleaseCourseDayInstructorClaim(
  session: Parameters<typeof readAndPlanReleaseResourceClaim>[0],
  input: {
    readonly courseDay: CourseDay;
    readonly correlationId: Parameters<typeof readAndPlanReleaseResourceClaim>[1]['correlationId'];
    readonly commandId: Parameters<typeof readAndPlanReleaseResourceClaim>[1]['commandId'];
    readonly decidedAt: Date;
  }
) {
  return Promise.all(
    input.courseDay.actualInstructorIds.map((instructorId) => {
      const identities = courseDayInstructorClaimIdentity({
        courseDayId: input.courseDay.courseDayId,
        instructorId,
        occurrenceRevision: input.courseDay.revision,
      });
      return readAndPlanReleaseResourceClaim(session, {
        correlationId: input.correlationId,
        commandId: input.commandId,
        decidedAt: input.decidedAt,
        claimId: identities.instructorClaimId,
      });
    })
  );
}

export interface CourseDayInstructorClaimSwapPlan {
  readonly releasePlans: Awaited<ReturnType<typeof planReleaseCourseDayInstructorClaim>>;
  readonly acquirePlans: ReadonlyArray<
    Awaited<ReturnType<typeof planAcquireCourseDayInstructorClaim>>
  >;
  readonly newOccurrenceId: OccurrenceId;
}

export async function planSwapCourseDayInstructorClaim(
  session: Parameters<typeof readAndPlanReleaseResourceClaim>[0],
  input: {
    readonly courseDay: CourseDay;
    readonly newInstructorIds: readonly InstructorId[];
    readonly newOccurrenceRevision: number;
    readonly interval: TimeInterval;
    readonly correlationId: Parameters<typeof readAndPlanReleaseResourceClaim>[1]['correlationId'];
    readonly commandId: Parameters<typeof readAndPlanReleaseResourceClaim>[1]['commandId'];
    readonly decidedAt: Date;
  }
): Promise<CourseDayInstructorClaimSwapPlan> {
  const replacementIgnore = replacementIgnoreForCourseDayOccurrence(input.courseDay);
  const releasePlans = await planReleaseCourseDayInstructorClaim(session, {
    courseDay: input.courseDay,
    correlationId: input.correlationId,
    commandId: input.commandId,
    decidedAt: input.decidedAt,
  });
  const acquirePlans = await Promise.all(
    input.newInstructorIds.map((instructorId) =>
      planAcquireCourseDayInstructorClaim(session, {
        courseDayId: input.courseDay.courseDayId,
        instructorId,
        occurrenceRevision: input.newOccurrenceRevision,
        interval: input.interval,
        replacementIgnore,
        correlationId: input.correlationId,
        commandId: input.commandId,
        decidedAt: input.decidedAt,
      })
    )
  );
  const newOccurrenceId = courseDayOccurrenceIdFromRevision(
    input.courseDay.courseDayId,
    input.newOccurrenceRevision
  );
  return { releasePlans, acquirePlans, newOccurrenceId };
}

export function commitPlannedCourseDayInstructorClaimSwap(
  session: Parameters<typeof commitResourceClaimPlan>[0],
  plan: CourseDayInstructorClaimSwapPlan,
  metadata: {
    readonly correlationId: Parameters<typeof commitResourceClaimPlan>[2]['correlationId'];
    readonly commandId: Parameters<typeof commitResourceClaimPlan>[2]['commandId'];
  },
  decidedAt: Date
): void {
  const claimMetadata = {
    correlationId: metadata.correlationId,
    commandId: metadata.commandId,
    decidedAt,
  };
  for (const releasePlan of plan.releasePlans) {
    commitResourceClaimPlan(session, releasePlan, claimMetadata);
  }
  for (const acquirePlan of plan.acquirePlans) {
    commitResourceClaimPlan(session, acquirePlan, claimMetadata);
  }
}
