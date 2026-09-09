import { useCallback } from 'react';
import {
  AggregateRevisionSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  ParticipantIdSchema,
  accountCommandActor,
  parseCommandResultPayload,
  type GuestCourseEnrollmentLinkCredential,
} from '@ski-academy/shared-domain';
import {
  executeAuthenticatedCanonicalCommand,
  executeGuestCanonicalCommand,
  previewAuthenticatedCommandIdentity,
  type ClientCallableCapability,
} from '../../lib/canonical/canonicalCommandClient';
import { mapCanonicalCommandResultError } from '../../lib/canonical/mapCanonicalCommandError';
import {
  queryCourseCatalogReadModels,
  queryCourseEnrollmentReadModels,
} from '../../lib/canonical/canonicalReadModelClient';
import type {
  AuthenticatedCourseEnrollmentCommandResult,
  AuthenticatedCourseEnrollmentInput,
  GuestCourseEnrollmentInput,
} from './courseEnrollmentContracts';
import {
  deriveGuestCreateEnrollmentIdempotencyKey,
  deriveRequestCancellationIdempotencyKey,
  deriveWithdrawEnrollmentIdempotencyKey,
  resolveEnrollmentIdsForAuthenticatedCommand,
} from './deriveEnrollmentIds';
import { persistGuestCourseEnrollmentCredential } from './guestCourseEnrollmentCredentialStorage';
import { useCourseEnrollmentStore } from './courseEnrollmentStore';
import { mergeCatalogRecords, mergeCourseEnrollmentRecords } from './courseEnrollmentViewModel';
import {
  resolveCourseCancellationLifecycleFromStore,
  type CabinetCancellationCommandResult,
} from '../student-cabinet/cabinetCancellationOutcome';
import { resolveCabinetCancellationOutcome } from '../student-cabinet/resolveCabinetCancellationOutcome';

async function refetchAccountHotEnrollments(): Promise<void> {
  const [enrollmentResult, catalogResult] = await Promise.all([
    queryCourseEnrollmentReadModels({ scope: 'account_hot' }),
    queryCourseCatalogReadModels({ scope: 'public' }),
  ]);
  const state = useCourseEnrollmentStore.getState();
  const mergedEnrollments = mergeCourseEnrollmentRecords(state.items, enrollmentResult);
  const mergedCatalog = mergeCatalogRecords(state.catalogByCourseId, catalogResult.items);
  useCourseEnrollmentStore.getState().mergeItems(mergedEnrollments);
  useCourseEnrollmentStore.getState().mergeCatalog(mergedCatalog);
}

function resolveCreateEnrollmentOutcome(
  result: Awaited<ReturnType<typeof executeAuthenticatedCanonicalCommand>>
): AuthenticatedCourseEnrollmentCommandResult['outcome'] {
  if (result.status !== 'success') {
    return 'created';
  }
  const payload = parseCommandResultPayload('create_course_enrollments', result.payload ?? {});
  if (payload.success) {
    return payload.data.outcome;
  }
  // Older servers without outcome: treat as created so first-time UX stays intact.
  return 'created';
}

export function useCourseEnrollmentCommands(accountId: string | undefined) {
  const createAuthenticatedEnrollment = useCallback(
    async (
      input: AuthenticatedCourseEnrollmentInput
    ): Promise<AuthenticatedCourseEnrollmentCommandResult> => {
      if (!accountId) {
        throw new Error('Authentication is required.');
      }
      const preview = previewAuthenticatedCommandIdentity(accountId, {
        kind: 'create_course_enrollments',
        context: {
          actor: accountCommandActor(accountId as never),
          exercisedCapability: input.exercisedCapability,
          idempotencyKey: input.identity.idempotencyKey,
          correlationId: 'correlation_preview' as never,
          source: 'client_callable',
        },
        intent: {
          courseId: CourseIdSchema.parse(input.courseId),
          participantIds: input.participantIds.map((id) => ParticipantIdSchema.parse(id)),
        },
      });
      const enrollmentIds = resolveEnrollmentIdsForAuthenticatedCommand({
        commandId: preview.commandKey,
        participantIds: input.participantIds,
      });
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'create_course_enrollments',
        intent: {
          courseId: CourseIdSchema.parse(input.courseId),
          participantIds: input.participantIds.map((id) => ParticipantIdSchema.parse(id)),
          enrollmentIds: [...enrollmentIds],
        },
        idempotencyKey: input.identity.idempotencyKey,
        exercisedCapability: input.exercisedCapability,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      const outcome = resolveCreateEnrollmentOutcome(result);
      await refetchAccountHotEnrollments();
      return { outcome };
    },
    [accountId]
  );

  const createGuestEnrollment = useCallback(
    async (input: GuestCourseEnrollmentInput): Promise<GuestCourseEnrollmentLinkCredential> => {
      const result = await executeGuestCanonicalCommand({
        kind: 'create_course_enrollments',
        intent: {
          courseId: CourseIdSchema.parse(input.courseId),
          participantIds: [ParticipantIdSchema.parse(input.participantId)],
          enrollmentIds: [CourseEnrollmentIdSchema.parse(input.enrollmentId)],
        },
        idempotencyKey: input.identity.idempotencyKey,
        guestParticipantDisplayName: input.guestDisplayName,
        guestParticipantSkillLevel: input.guestSkillLevel,
        guestParticipantDiscipline: input.guestDiscipline,
        guestParticipantAgeYears: input.guestAgeYears,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      if (result.status !== 'success') {
        throw new Error('Guest course enrollment did not succeed.');
      }
      const payload = parseCommandResultPayload(
        'create_course_enrollments',
        result.payload ?? { outcome: 'created' }
      );
      if (!payload.success) {
        throw new Error('Guest course enrollment payload was invalid.');
      }
      const credential = payload.data.guestLinkCredentials?.[0];
      if (!credential) {
        throw new Error('Guest course enrollment credential was not returned.');
      }
      persistGuestCourseEnrollmentCredential(credential);
      return credential;
    },
    []
  );

  const withdrawEnrollment = useCallback(
    async (input: {
      readonly enrollmentId: string;
      readonly expectedRevision: number;
      readonly idempotencyKey: string;
      readonly exercisedCapability: ClientCallableCapability;
      readonly guestCredential?: GuestCourseEnrollmentLinkCredential;
    }): Promise<void> => {
      if (input.guestCredential) {
        const result = await executeGuestCanonicalCommand({
          kind: 'withdraw_course_enrollment',
          intent: {
            courseEnrollmentId: CourseEnrollmentIdSchema.parse(input.enrollmentId),
          },
          idempotencyKey: input.idempotencyKey as never,
          expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
          guestActionNonce: input.guestCredential.nonce,
          guestActionSignature: input.guestCredential.signature,
        });
        const error = mapCanonicalCommandResultError(result);
        if (error) throw error;
        return;
      }
      if (!accountId) {
        throw new Error('Authentication is required.');
      }
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'withdraw_course_enrollment',
        intent: {
          courseEnrollmentId: CourseEnrollmentIdSchema.parse(input.enrollmentId),
        },
        idempotencyKey: input.idempotencyKey as never,
        expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
        exercisedCapability: input.exercisedCapability,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchAccountHotEnrollments();
    },
    [accountId]
  );

  const requestCancellation = useCallback(
    async (input: {
      readonly enrollmentId: string;
      readonly expectedRevision: number;
      readonly idempotencyKey: string;
      readonly exercisedCapability: ClientCallableCapability;
      readonly guestCredential?: GuestCourseEnrollmentLinkCredential;
    }): Promise<CabinetCancellationCommandResult> => {
      if (input.guestCredential) {
        const result = await executeGuestCanonicalCommand({
          kind: 'request_course_enrollment_cancellation',
          intent: {
            courseEnrollmentId: CourseEnrollmentIdSchema.parse(input.enrollmentId),
          },
          idempotencyKey: input.idempotencyKey as never,
          expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
          guestActionNonce: input.guestCredential.nonce,
          guestActionSignature: input.guestCredential.signature,
        });
        const error = mapCanonicalCommandResultError(result);
        if (error) throw error;
        return resolveCabinetCancellationOutcome({
          entityKind: 'course',
          entityId: input.enrollmentId,
          nextRevision: input.expectedRevision + 1,
          commandResult:
            result.status === 'success' ? result : { status: 'success', payload: undefined },
          refresh: async () => undefined,
          readLifecycleFromStore: () =>
            resolveCourseCancellationLifecycleFromStore(
              input.enrollmentId,
              useCourseEnrollmentStore.getState().items
            ),
        });
      }
      if (!accountId) {
        throw new Error('Authentication is required.');
      }
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'request_course_enrollment_cancellation',
        intent: {
          courseEnrollmentId: CourseEnrollmentIdSchema.parse(input.enrollmentId),
        },
        idempotencyKey: input.idempotencyKey as never,
        expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
        exercisedCapability: input.exercisedCapability,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      return resolveCabinetCancellationOutcome({
        entityKind: 'course',
        entityId: input.enrollmentId,
        nextRevision: input.expectedRevision + 1,
        commandResult:
          result.status === 'success' ? result : { status: 'success', payload: undefined },
        refresh: refetchAccountHotEnrollments,
        readLifecycleFromStore: () =>
          resolveCourseCancellationLifecycleFromStore(
            input.enrollmentId,
            useCourseEnrollmentStore.getState().items
          ),
      });
    },
    [accountId]
  );

  return {
    createAuthenticatedEnrollment,
    createGuestEnrollment,
    withdrawEnrollment,
    requestCancellation,
    refetchAccountHotEnrollments: accountId ? () => refetchAccountHotEnrollments() : undefined,
  };
}

export {
  deriveGuestCreateEnrollmentIdempotencyKey,
  deriveRequestCancellationIdempotencyKey,
  deriveWithdrawEnrollmentIdempotencyKey,
};
