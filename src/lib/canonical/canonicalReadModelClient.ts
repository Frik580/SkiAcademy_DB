import {
  boundCanonicalReadIdempotencyCursor,
  buildCanonicalReadIdempotencyKey,
  canonicalDeterministicHash,
  type QueryAdminFinanceReadModelsInput,
  type QueryAdminFinanceReadModelsResult,
  type QueryAdminCourseReadModelsInput,
  type QueryAdminCourseReadModelsResult,
  type QueryAdminCourseEnrollmentReadModelsInput,
  type QueryAdminCourseEnrollmentReadModelsResult,
  type QueryAdminIssueReadModelsInput,
  type QueryAdminIssueReadModelsResult,
  type QueryAdminIdentityReadModelsInput,
  type QueryAdminIdentityReadModelsResult,
  type QueryAdminPlannerReadModelsInput,
  type QueryAdminPlannerReadModelsResult,
  type QueryBookingChangeRequestReadModelsInput,
  type QueryBookingChangeRequestReadModelsResult,
  type QueryBookingProposalReadModelsInput,
  type QueryBookingProposalReadModelsResult,
  type QueryCourseAttendanceReadModelsInput,
  type QueryCourseAttendanceReadModelsResult,
  type QueryCourseCatalogReadModelsInput,
  type QueryCourseCatalogReadModelsResult,
  type QueryCourseEnrollmentReadModelsInput,
  type QueryCourseEnrollmentReadModelsResult,
  type QueryInstructorCourseAssignmentReadModelsInput,
  type QueryInstructorCourseAssignmentReadModelsResult,
  type QueryInstructorOccupancyReadModelsInput,
  type QueryInstructorOccupancyReadModelsResult,
  type QueryLessonBookingReadModelsInput,
  type QueryLessonBookingReadModelsResult,
  type QueryLessonPricingSettingsReadModelInput,
  type QueryLessonPricingSettingsReadModelResult,
  type QueryManagedParticipantPickerReadModelsInput,
  type QueryManagedParticipantPickerReadModelsResult,
  type QueryParticipantInstructorAccessReadModelsInput,
  type QueryParticipantInstructorAccessReadModelsResult,
  type QueryInstructorReviewReadModelsInput,
  type QueryInstructorReviewReadModelsResult,
  type QueryParticipantProgressReadModelsInput,
  type QueryParticipantProgressReadModelsResult,
  type QueryParticipantAchievementsReadModelsInput,
  type QueryParticipantAchievementsReadModelsResult,
  type QueryParticipantLessonFeedbackReadModelsInput,
  type QueryParticipantLessonFeedbackReadModelsResult,
  type BookingId,
  type InstructorId,
  type ParticipantId,
  INSTRUCTOR_REVIEW_ACCOUNT_BOOKING_IDS_MAX,
  PARTICIPANT_PROGRESS_READ_MODEL_IDS_MAX,
  PARTICIPANT_ACHIEVEMENTS_READ_MODEL_IDS_MAX,
} from '@ski-academy/shared-domain';
import { callFunction, type FunctionsCallOptions } from '../functions/functionsClient';
import { auth } from '../../infrastructure/firebase';

export const QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE = 'queryLessonBookingReadModels';
export const QUERY_MANAGED_PARTICIPANT_PICKER_READ_MODELS_CALLABLE =
  'queryManagedParticipantPickerReadModels';
export const QUERY_BOOKING_PROPOSAL_READ_MODELS_CALLABLE = 'queryBookingProposalReadModels';
export const QUERY_BOOKING_CHANGE_REQUEST_READ_MODELS_CALLABLE =
  'queryBookingChangeRequestReadModels';
export const QUERY_PARTICIPANT_INSTRUCTOR_ACCESS_READ_MODELS_CALLABLE =
  'queryParticipantInstructorAccessReadModels';
export const QUERY_COURSE_ENROLLMENT_READ_MODELS_CALLABLE = 'queryCourseEnrollmentReadModels';
export const QUERY_COURSE_CATALOG_READ_MODELS_CALLABLE = 'queryCourseCatalogReadModels';
export const QUERY_COURSE_ATTENDANCE_READ_MODELS_CALLABLE = 'queryCourseAttendanceReadModels';
export const QUERY_INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODELS_CALLABLE =
  'queryInstructorCourseAssignmentReadModels';
export const QUERY_ADMIN_ISSUE_READ_MODELS_CALLABLE = 'queryAdminIssueReadModels';
export const QUERY_ADMIN_FINANCE_READ_MODELS_CALLABLE = 'queryAdminFinanceReadModels';
export const QUERY_ADMIN_COURSE_READ_MODELS_CALLABLE = 'queryAdminCourseReadModels';
export const QUERY_ADMIN_COURSE_ENROLLMENT_READ_MODELS_CALLABLE =
  'queryAdminCourseEnrollmentReadModels';
export const QUERY_ADMIN_IDENTITY_READ_MODELS_CALLABLE = 'queryAdminIdentityReadModels';
export const QUERY_ADMIN_PLANNER_READ_MODELS_CALLABLE = 'queryAdminPlannerReadModels';
export const QUERY_INSTRUCTOR_OCCUPANCY_READ_MODELS_CALLABLE = 'queryInstructorOccupancyReadModels';
export const QUERY_LESSON_PRICING_SETTINGS_READ_MODEL_CALLABLE =
  'queryLessonPricingSettingsReadModel';
export const QUERY_INSTRUCTOR_REVIEW_READ_MODELS_CALLABLE = 'queryInstructorReviewReadModels';
export const QUERY_PARTICIPANT_PROGRESS_READ_MODELS_CALLABLE = 'queryParticipantProgressReadModels';
export const QUERY_PARTICIPANT_ACHIEVEMENTS_READ_MODELS_CALLABLE =
  'queryParticipantAchievementsReadModels';
export const QUERY_PARTICIPANT_LESSON_FEEDBACK_READ_MODELS_CALLABLE =
  'queryParticipantLessonFeedbackReadModels';

export async function queryLessonPricingSettingsReadModel(
  input: QueryLessonPricingSettingsReadModelInput
): Promise<QueryLessonPricingSettingsReadModelResult> {
  return invokeCanonicalReadCallable<
    QueryLessonPricingSettingsReadModelInput,
    QueryLessonPricingSettingsReadModelResult
  >(QUERY_LESSON_PRICING_SETTINGS_READ_MODEL_CALLABLE, input, {
    idempotencyKey: input.idempotencyKey ?? 'read:lesson_pricing_settings:current',
    maxAttempts: 1,
  });
}

export async function queryInstructorReviewReadModels(
  input: QueryInstructorReviewReadModelsInput
): Promise<QueryInstructorReviewReadModelsResult> {
  const target =
    input.scope === 'instructor_reviews'
      ? `${input.instructorId}:${input.cursor ?? 'start'}`
      : input.scope === 'public_summaries'
        ? [...input.instructorIds].sort().join(',')
        : [...(input.bookingIds ?? [])].sort().join(',');
  const identityHash = canonicalDeterministicHash([
    'read:instructor_review:v1',
    input.scope,
    target,
  ]);
  return invokeCanonicalReadCallable<
    QueryInstructorReviewReadModelsInput,
    QueryInstructorReviewReadModelsResult
  >(QUERY_INSTRUCTOR_REVIEW_READ_MODELS_CALLABLE, input, {
    idempotencyKey: `read:instructor_review:${identityHash}`,
    maxAttempts: 1,
  });
}

export async function queryParticipantProgressReadModels(
  input: QueryParticipantProgressReadModelsInput
): Promise<QueryParticipantProgressReadModelsResult> {
  const target =
    input.scope === 'managed'
      ? [...(input.participantIds ?? [])].sort().join(',') || 'all'
      : [...input.participantIds].sort().join(',');
  const identityHash = canonicalDeterministicHash([
    'read:participant_progress:v1',
    input.scope,
    target,
  ]);
  return invokeCanonicalReadCallable<
    QueryParticipantProgressReadModelsInput,
    QueryParticipantProgressReadModelsResult
  >(QUERY_PARTICIPANT_PROGRESS_READ_MODELS_CALLABLE, input, {
    idempotencyKey: `read:participant_progress:${identityHash}`,
    maxAttempts: 1,
  });
}

function chunkIds<T>(ids: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push([...ids.slice(index, index + size)]);
  }
  return chunks;
}

export async function queryManagedParticipantProgressReadModels(
  participantIds?: readonly ParticipantId[]
): Promise<QueryParticipantProgressReadModelsResult> {
  if (!participantIds || participantIds.length === 0) {
    return queryParticipantProgressReadModels({ scope: 'managed' });
  }
  const uniqueIds = [...new Set(participantIds)];
  const chunks = chunkIds(uniqueIds, PARTICIPANT_PROGRESS_READ_MODEL_IDS_MAX);
  const results = await Promise.all(
    chunks.map((chunk) =>
      queryParticipantProgressReadModels({ scope: 'managed', participantIds: chunk })
    )
  );
  return {
    scope: 'managed',
    items: results.flatMap((result) => result.items),
  };
}

export async function queryParticipantAchievementsReadModels(
  input: QueryParticipantAchievementsReadModelsInput
): Promise<QueryParticipantAchievementsReadModelsResult> {
  const target = [...(input.participantIds ?? [])].sort().join(',') || 'all';
  const identityHash = canonicalDeterministicHash([
    'read:participant_achievements:v1',
    input.scope,
    target,
  ]);
  return invokeCanonicalReadCallable<
    QueryParticipantAchievementsReadModelsInput,
    QueryParticipantAchievementsReadModelsResult
  >(QUERY_PARTICIPANT_ACHIEVEMENTS_READ_MODELS_CALLABLE, input, {
    idempotencyKey: `read:participant_achievements:${identityHash}`,
    maxAttempts: 1,
  });
}

export async function queryManagedParticipantAchievementsReadModels(
  participantIds?: readonly ParticipantId[]
): Promise<QueryParticipantAchievementsReadModelsResult> {
  if (!participantIds || participantIds.length === 0) {
    return queryParticipantAchievementsReadModels({ scope: 'managed' });
  }
  const uniqueIds = [...new Set(participantIds)];
  const chunks = chunkIds(uniqueIds, PARTICIPANT_ACHIEVEMENTS_READ_MODEL_IDS_MAX);
  const results = await Promise.all(
    chunks.map((chunk) =>
      queryParticipantAchievementsReadModels({ scope: 'managed', participantIds: chunk })
    )
  );
  return {
    scope: 'managed',
    items: results.flatMap((result) => result.items),
  };
}

export async function queryParticipantLessonFeedbackReadModels(
  input: QueryParticipantLessonFeedbackReadModelsInput
): Promise<QueryParticipantLessonFeedbackReadModelsResult> {
  const target =
    input.scope === 'instructor_lesson'
      ? `${input.participantId}:${input.lessonBookingId}`
      : input.scope === 'managed_latest'
        ? input.participantId
        : [
            [...input.participantIds].sort().join(','),
            [...(input.lessonBookingIds ?? [])].sort().join(','),
          ].join(':');
  const identityHash = canonicalDeterministicHash([
    'read:participant_lesson_feedback:v1',
    input.scope,
    target,
  ]);
  return invokeCanonicalReadCallable<
    QueryParticipantLessonFeedbackReadModelsInput,
    QueryParticipantLessonFeedbackReadModelsResult
  >(QUERY_PARTICIPANT_LESSON_FEEDBACK_READ_MODELS_CALLABLE, input, {
    idempotencyKey: `read:participant_lesson_feedback:${identityHash}`,
    maxAttempts: 1,
  });
}

export async function queryInstructorParticipantProgressReadModels(
  participantIds: readonly ParticipantId[]
): Promise<QueryParticipantProgressReadModelsResult> {
  const uniqueIds = [...new Set(participantIds)];
  if (uniqueIds.length === 0) {
    return { scope: 'instructor', items: [] };
  }
  const chunks = chunkIds(uniqueIds, PARTICIPANT_PROGRESS_READ_MODEL_IDS_MAX);
  const settled = await Promise.allSettled(
    chunks.map((chunk) =>
      queryParticipantProgressReadModels({ scope: 'instructor', participantIds: chunk })
    )
  );
  const items = settled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value.items : []
  );
  if (items.length === 0 && settled.some((result) => result.status === 'rejected')) {
    const rejected = settled.find((result) => result.status === 'rejected');
    throw rejected && rejected.status === 'rejected'
      ? rejected.reason
      : new Error('Progress read failed');
  }
  return { scope: 'instructor', items };
}

type CanonicalReadInFlightEntry = {
  readonly promise: Promise<unknown>;
};

const inFlightCanonicalReads = new Map<string, CanonicalReadInFlightEntry>();
let canonicalReadTransportInvocationCount = 0;
let resolveCanonicalReadSessionKey = (): string => auth.currentUser?.uid ?? 'anonymous';

export function __getCanonicalReadTransportInvocationCountForTests(): number {
  return canonicalReadTransportInvocationCount;
}

export function __resetCanonicalReadInFlightRegistryForTests(): void {
  inFlightCanonicalReads.clear();
  canonicalReadTransportInvocationCount = 0;
}

export function __setCanonicalReadSessionKeyResolverForTests(resolver: () => string): void {
  resolveCanonicalReadSessionKey = resolver;
}

function buildCanonicalReadInFlightKey(
  callableName: string,
  idempotencyKey: string,
  guestCredential?: { readonly nonce?: string; readonly signature?: string }
): string {
  const guestPart =
    guestCredential?.nonce || guestCredential?.signature
      ? canonicalDeterministicHash([guestCredential.nonce ?? '', guestCredential.signature ?? ''])
      : 'none';
  return [callableName, idempotencyKey, resolveCanonicalReadSessionKey(), guestPart].join('\u001f');
}

/**
 * Same-key in-flight dedupe for canonical READ callables only.
 * Not a result cache: the registry entry is removed when the promise settles.
 */
function invokeCanonicalReadCallable<Input, Output>(
  callableName: string,
  input: Input,
  options: FunctionsCallOptions,
  guestCredential?: { readonly nonce?: string; readonly signature?: string }
): Promise<Output> {
  const key = buildCanonicalReadInFlightKey(callableName, options.idempotencyKey, guestCredential);
  const existing = inFlightCanonicalReads.get(key);
  if (existing) {
    return existing.promise as Promise<Output>;
  }

  canonicalReadTransportInvocationCount += 1;
  const pending: CanonicalReadInFlightEntry = {
    promise: undefined as unknown as Promise<unknown>,
  };
  const promise = callFunction<Input, Output>(callableName, input, options).finally(() => {
    if (inFlightCanonicalReads.get(key) === pending) {
      inFlightCanonicalReads.delete(key);
    }
  });
  (pending as { promise: Promise<unknown> }).promise = promise;
  inFlightCanonicalReads.set(key, pending);
  return promise;
}

export async function queryPublicInstructorRatingSummaries(
  instructorIds: readonly InstructorId[]
): Promise<Extract<QueryInstructorReviewReadModelsResult, { scope: 'public_summaries' }>> {
  const uniqueIds = [...new Set(instructorIds)];
  const chunks: InstructorId[][] = [];
  for (let index = 0; index < uniqueIds.length; index += 100) {
    chunks.push(uniqueIds.slice(index, index + 100));
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      queryInstructorReviewReadModels({ scope: 'public_summaries', instructorIds: chunk })
    )
  );
  return {
    scope: 'public_summaries',
    summaries: results.flatMap((result) =>
      result.scope === 'public_summaries' ? result.summaries : []
    ),
  };
}

export async function queryAccountInstructorReviewReadModels(
  bookingIds: readonly BookingId[]
): Promise<Extract<QueryInstructorReviewReadModelsResult, { scope: 'account_reviews' }>> {
  const uniqueIds = [...new Set(bookingIds)];
  if (uniqueIds.length === 0) {
    return { scope: 'account_reviews', reviews: [], bookingStates: [] };
  }
  const chunks: BookingId[][] = [];
  for (
    let index = 0;
    index < uniqueIds.length;
    index += INSTRUCTOR_REVIEW_ACCOUNT_BOOKING_IDS_MAX
  ) {
    chunks.push(uniqueIds.slice(index, index + INSTRUCTOR_REVIEW_ACCOUNT_BOOKING_IDS_MAX));
  }
  const results = await Promise.allSettled(
    chunks.map((chunk) =>
      queryInstructorReviewReadModels({ scope: 'account_reviews', bookingIds: chunk })
    )
  );
  const fulfilled = results.flatMap((result) =>
    result.status === 'fulfilled' && result.value.scope === 'account_reviews' ? [result.value] : []
  );
  if (fulfilled.length === 0) {
    const firstFailure = results.find((result) => result.status === 'rejected');
    throw firstFailure?.status === 'rejected'
      ? firstFailure.reason
      : new Error('Account review read failed.');
  }
  const reviews = fulfilled.flatMap((result) => result.reviews);
  const bookingStates = fulfilled.flatMap((result) => result.bookingStates);
  return {
    scope: 'account_reviews',
    reviews: [...new Map(reviews.map((review) => [review.reviewId, review])).values()],
    bookingStates: [...new Map(bookingStates.map((state) => [state.bookingId, state])).values()],
  };
}

export async function queryAdminCourseEnrollmentReadModels(
  input: QueryAdminCourseEnrollmentReadModelsInput
): Promise<QueryAdminCourseEnrollmentReadModelsResult> {
  const target =
    input.scope === 'admin_enrollment_detail'
      ? input.enrollmentId
      : `${input.courseId ?? 'all'}:${input.cursor ?? 'start'}`;
  const identityHash = canonicalDeterministicHash([
    'read:admin_course_enrollment:v1',
    input.scope,
    target,
  ]);
  return invokeCanonicalReadCallable<
    QueryAdminCourseEnrollmentReadModelsInput,
    QueryAdminCourseEnrollmentReadModelsResult
  >(QUERY_ADMIN_COURSE_ENROLLMENT_READ_MODELS_CALLABLE, input, {
    idempotencyKey: `read:admin_course_enrollment:${identityHash}`,
    maxAttempts: 1,
  });
}

export async function queryAdminIdentityReadModels(
  input: QueryAdminIdentityReadModelsInput
): Promise<QueryAdminIdentityReadModelsResult> {
  const target =
    input.scope === 'admin_account_detail'
      ? input.accountId
      : input.scope === 'admin_participant_detail'
        ? input.participantId
        : input.scope === 'admin_instructor_detail'
          ? input.instructorId
          : input.scope === 'admin_eligible_participants'
            ? input.accountId
            : `${'search' in input ? (input.search ?? 'all') : 'all'}:${'role' in input && input.role ? input.role : 'any'}:${'cursor' in input ? (input.cursor ?? 'start') : 'start'}`;
  const identityHash = canonicalDeterministicHash(['read:admin_identity:v1', input.scope, target]);
  return invokeCanonicalReadCallable<
    QueryAdminIdentityReadModelsInput,
    QueryAdminIdentityReadModelsResult
  >(QUERY_ADMIN_IDENTITY_READ_MODELS_CALLABLE, input, {
    idempotencyKey: `read:admin_identity:${identityHash}`,
    maxAttempts: 1,
  });
}

export async function queryAdminPlannerReadModels(
  input: QueryAdminPlannerReadModelsInput
): Promise<QueryAdminPlannerReadModelsResult> {
  const identityHash = canonicalDeterministicHash([
    'read:admin_planner:v1',
    input.localDate,
    input.view ?? 'day',
    input.timeZone,
    String(input.windowDays ?? ''),
  ]);
  return invokeCanonicalReadCallable<
    QueryAdminPlannerReadModelsInput,
    QueryAdminPlannerReadModelsResult
  >(QUERY_ADMIN_PLANNER_READ_MODELS_CALLABLE, input, {
    idempotencyKey: `read:admin_planner:${identityHash}`,
    maxAttempts: 1,
  });
}

export async function queryAdminCourseReadModels(
  input: QueryAdminCourseReadModelsInput
): Promise<QueryAdminCourseReadModelsResult> {
  const target =
    input.scope === 'admin_course_detail'
      ? input.courseId
      : 'readModelVersion' in input && input.readModelVersion === 2
        ? `v2:${input.lifecycle ?? 'active'}:${input.pageSize ?? 'default'}:${boundCanonicalReadIdempotencyCursor(
            'cursor' in input ? input.cursor : undefined
          )}`
        : `v1:${input.pageSize ?? 'default'}`;
  const idempotencyKey = buildCanonicalReadIdempotencyKey([
    'read:admin_course',
    input.scope,
    target,
  ]);
  return invokeCanonicalReadCallable<
    QueryAdminCourseReadModelsInput,
    QueryAdminCourseReadModelsResult
  >(QUERY_ADMIN_COURSE_READ_MODELS_CALLABLE, input, { idempotencyKey, maxAttempts: 1 });
}

export async function queryAdminFinanceReadModels(
  input: QueryAdminFinanceReadModelsInput
): Promise<QueryAdminFinanceReadModelsResult> {
  const target =
    input.scope === 'admin_wallet'
      ? input.accountId
      : input.scope === 'admin_school_movement'
        ? input.period && input.localDate && input.timeZone
          ? `school:${input.period}:${input.localDate}:${input.timeZone}`
          : 'school'
        : input.scope === 'admin_financial_overview'
          ? `${input.period}:${input.localDate}:${input.timeZone}`
          : input.scope === 'admin_guest_funds'
            ? `${input.filter ?? 'all'}`
            : input.paymentId;
  const identityHash = canonicalDeterministicHash([
    'read:admin_finance:v1',
    input.scope,
    target,
    input.scope === 'admin_financial_overview'
      ? 'overview'
      : input.scope === 'admin_guest_funds'
        ? (input.cursor ?? 'start')
        : (input.cursor ?? 'start'),
  ]);
  const idempotencyKey = `read:admin_finance:${identityHash}`;
  return invokeCanonicalReadCallable<
    QueryAdminFinanceReadModelsInput,
    QueryAdminFinanceReadModelsResult
  >(QUERY_ADMIN_FINANCE_READ_MODELS_CALLABLE, input, { idempotencyKey, maxAttempts: 1 });
}

function buildAdminIssueReadModelTransportInput(
  input: QueryAdminIssueReadModelsInput
): QueryAdminIssueReadModelsInput {
  const transportInput: QueryAdminIssueReadModelsInput = { scope: input.scope };
  if (input.issueId !== undefined) {
    transportInput.issueId = input.issueId;
  }
  if (input.severity !== undefined) {
    transportInput.severity = input.severity;
  }
  if (input.pageSize !== undefined) {
    transportInput.pageSize = input.pageSize;
  }
  if (input.cursor) {
    transportInput.cursor = input.cursor;
  }
  return transportInput;
}

export async function queryAdminIssueReadModels(
  input: QueryAdminIssueReadModelsInput
): Promise<QueryAdminIssueReadModelsResult> {
  const transportInput = buildAdminIssueReadModelTransportInput(input);
  const idempotencyKey = buildCanonicalReadIdempotencyKey([
    'read:admin_issue',
    transportInput.scope,
    transportInput.issueId ?? 'all',
    transportInput.severity ?? 'all',
    boundCanonicalReadIdempotencyCursor(transportInput.cursor),
  ]);
  return invokeCanonicalReadCallable<
    QueryAdminIssueReadModelsInput,
    QueryAdminIssueReadModelsResult
  >(QUERY_ADMIN_ISSUE_READ_MODELS_CALLABLE, transportInput, {
    idempotencyKey,
    maxAttempts: 1,
  });
}

function createLessonBookingReadModelIdempotencyKey(
  input: QueryLessonBookingReadModelsInput
): string {
  return buildCanonicalReadIdempotencyKey([
    'read:lesson_booking',
    input.scope,
    boundCanonicalReadIdempotencyCursor(input.cursor),
    input.bookingId ?? 'none',
  ]);
}

function createParticipantInstructorAccessReadModelIdempotencyKey(
  input: QueryParticipantInstructorAccessReadModelsInput
): string {
  return buildCanonicalReadIdempotencyKey([
    'read:participant_instructor_access',
    input.scope,
    input.participantId,
    input.instructorId,
  ]);
}

function buildLessonBookingReadModelTransportInput(
  input: QueryLessonBookingReadModelsInput
): QueryLessonBookingReadModelsInput {
  const transportInput: QueryLessonBookingReadModelsInput = { scope: input.scope };
  if (input.pageSize !== undefined) {
    transportInput.pageSize = input.pageSize;
  }
  if (input.cursor) {
    transportInput.cursor = input.cursor;
  }
  if (input.bookingId !== undefined) {
    transportInput.bookingId = input.bookingId;
  }
  if (input.guestActionNonce) {
    transportInput.guestActionNonce = input.guestActionNonce;
  }
  if (input.guestActionSignature) {
    transportInput.guestActionSignature = input.guestActionSignature;
  }
  return transportInput;
}

export async function queryLessonBookingReadModels(
  input: QueryLessonBookingReadModelsInput
): Promise<QueryLessonBookingReadModelsResult> {
  const transportInput = buildLessonBookingReadModelTransportInput(input);
  const idempotencyKey = createLessonBookingReadModelIdempotencyKey(transportInput);
  return invokeCanonicalReadCallable<
    QueryLessonBookingReadModelsInput,
    QueryLessonBookingReadModelsResult
  >(
    QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE,
    transportInput,
    { idempotencyKey, maxAttempts: 1 },
    {
      nonce: transportInput.guestActionNonce,
      signature: transportInput.guestActionSignature,
    }
  );
}

export async function queryManagedParticipantPickerReadModels(
  input: QueryManagedParticipantPickerReadModelsInput = {}
): Promise<QueryManagedParticipantPickerReadModelsResult> {
  const idempotencyKey = input.accountId
    ? `read:managed_participant_picker:admin:${input.accountId}`
    : 'read:managed_participant_picker';
  return invokeCanonicalReadCallable<
    QueryManagedParticipantPickerReadModelsInput,
    QueryManagedParticipantPickerReadModelsResult
  >(QUERY_MANAGED_PARTICIPANT_PICKER_READ_MODELS_CALLABLE, input, {
    idempotencyKey,
    maxAttempts: 1,
  });
}

export async function queryBookingProposalReadModels(
  input: QueryBookingProposalReadModelsInput
): Promise<QueryBookingProposalReadModelsResult> {
  const idempotencyKey = `read:booking_proposal:${input.scope}`;
  return invokeCanonicalReadCallable<
    QueryBookingProposalReadModelsInput,
    QueryBookingProposalReadModelsResult
  >(QUERY_BOOKING_PROPOSAL_READ_MODELS_CALLABLE, input, {
    idempotencyKey,
    maxAttempts: 1,
  });
}

export async function queryBookingChangeRequestReadModels(input: {
  readonly scope: 'account_open' | 'instructor_open';
  readonly idempotencyKey?: QueryBookingChangeRequestReadModelsInput['idempotencyKey'];
}): Promise<
  Extract<QueryBookingChangeRequestReadModelsResult, { scope: 'account_open' | 'instructor_open' }>
>;
export async function queryBookingChangeRequestReadModels(input: {
  readonly scope: 'admin_open';
  readonly idempotencyKey?: QueryBookingChangeRequestReadModelsInput['idempotencyKey'];
}): Promise<Extract<QueryBookingChangeRequestReadModelsResult, { scope: 'admin_open' }>>;
export async function queryBookingChangeRequestReadModels(input: {
  readonly scope: 'admin_detail';
  readonly requestId: NonNullable<QueryBookingChangeRequestReadModelsInput['requestId']>;
  readonly idempotencyKey?: QueryBookingChangeRequestReadModelsInput['idempotencyKey'];
}): Promise<Extract<QueryBookingChangeRequestReadModelsResult, { scope: 'admin_detail' }>>;
export async function queryBookingChangeRequestReadModels(
  input: QueryBookingChangeRequestReadModelsInput
): Promise<QueryBookingChangeRequestReadModelsResult>;
export async function queryBookingChangeRequestReadModels(
  input: QueryBookingChangeRequestReadModelsInput
): Promise<QueryBookingChangeRequestReadModelsResult> {
  const idempotencyKey = `read:booking_change_request:${input.scope}`;
  return invokeCanonicalReadCallable<
    QueryBookingChangeRequestReadModelsInput,
    QueryBookingChangeRequestReadModelsResult
  >(QUERY_BOOKING_CHANGE_REQUEST_READ_MODELS_CALLABLE, input, {
    idempotencyKey,
    maxAttempts: 1,
  });
}

export async function queryParticipantInstructorAccessReadModels(
  input: QueryParticipantInstructorAccessReadModelsInput
): Promise<QueryParticipantInstructorAccessReadModelsResult> {
  const idempotencyKey = createParticipantInstructorAccessReadModelIdempotencyKey(input);
  return invokeCanonicalReadCallable<
    QueryParticipantInstructorAccessReadModelsInput,
    QueryParticipantInstructorAccessReadModelsResult
  >(QUERY_PARTICIPANT_INSTRUCTOR_ACCESS_READ_MODELS_CALLABLE, input, {
    idempotencyKey,
    maxAttempts: 1,
  });
}

function createCourseEnrollmentReadModelIdempotencyKey(
  input: QueryCourseEnrollmentReadModelsInput
): string {
  return buildCanonicalReadIdempotencyKey([
    'read:course_enrollment',
    input.scope,
    boundCanonicalReadIdempotencyCursor(input.cursor),
    input.enrollmentId ?? 'none',
    input.courseId ?? 'none',
  ]);
}

function buildCourseEnrollmentReadModelTransportInput(
  input: QueryCourseEnrollmentReadModelsInput
): QueryCourseEnrollmentReadModelsInput {
  const transportInput: QueryCourseEnrollmentReadModelsInput = { scope: input.scope };
  if (input.pageSize !== undefined) {
    transportInput.pageSize = input.pageSize;
  }
  if (input.cursor) {
    transportInput.cursor = input.cursor;
  }
  if (input.enrollmentId !== undefined) {
    transportInput.enrollmentId = input.enrollmentId;
  }
  if (input.courseId !== undefined) {
    transportInput.courseId = input.courseId;
  }
  if (input.guestActionNonce) {
    transportInput.guestActionNonce = input.guestActionNonce;
  }
  if (input.guestActionSignature) {
    transportInput.guestActionSignature = input.guestActionSignature;
  }
  return transportInput;
}

export async function queryCourseEnrollmentReadModels(
  input: QueryCourseEnrollmentReadModelsInput
): Promise<QueryCourseEnrollmentReadModelsResult> {
  const transportInput = buildCourseEnrollmentReadModelTransportInput(input);
  const idempotencyKey = createCourseEnrollmentReadModelIdempotencyKey(transportInput);
  return invokeCanonicalReadCallable<
    QueryCourseEnrollmentReadModelsInput,
    QueryCourseEnrollmentReadModelsResult
  >(
    QUERY_COURSE_ENROLLMENT_READ_MODELS_CALLABLE,
    transportInput,
    { idempotencyKey, maxAttempts: 1 },
    {
      nonce: transportInput.guestActionNonce,
      signature: transportInput.guestActionSignature,
    }
  );
}

export async function queryCourseCatalogReadModels(
  input: QueryCourseCatalogReadModelsInput
): Promise<QueryCourseCatalogReadModelsResult> {
  const idempotencyKey = `read:course_catalog:${input.scope}:${input.courseId ?? 'all'}`;
  return invokeCanonicalReadCallable<
    QueryCourseCatalogReadModelsInput,
    QueryCourseCatalogReadModelsResult
  >(QUERY_COURSE_CATALOG_READ_MODELS_CALLABLE, input, {
    idempotencyKey,
    maxAttempts: 1,
  });
}

export async function queryCourseAttendanceReadModels(
  input: QueryCourseAttendanceReadModelsInput
): Promise<QueryCourseAttendanceReadModelsResult> {
  const idempotencyKey = buildCanonicalReadIdempotencyKey([
    'read:course_attendance',
    input.scope,
    input.enrollmentId ?? 'none',
    input.courseId ?? 'none',
  ]);
  return invokeCanonicalReadCallable<
    QueryCourseAttendanceReadModelsInput,
    QueryCourseAttendanceReadModelsResult
  >(QUERY_COURSE_ATTENDANCE_READ_MODELS_CALLABLE, input, {
    idempotencyKey,
    maxAttempts: 1,
  });
}

export async function queryInstructorCourseAssignmentReadModels(
  input: QueryInstructorCourseAssignmentReadModelsInput
): Promise<QueryInstructorCourseAssignmentReadModelsResult> {
  const idempotencyKey = `read:instructor_course_assignment:${input.scope}`;
  return invokeCanonicalReadCallable<
    QueryInstructorCourseAssignmentReadModelsInput,
    QueryInstructorCourseAssignmentReadModelsResult
  >(QUERY_INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODELS_CALLABLE, input, {
    idempotencyKey,
    maxAttempts: 1,
  });
}

export async function queryInstructorOccupancyReadModels(
  input: QueryInstructorOccupancyReadModelsInput
): Promise<QueryInstructorOccupancyReadModelsResult> {
  const identityHash = canonicalDeterministicHash([
    'read:instructor_occupancy:v1',
    input.instructorId,
    input.localDate,
    input.timeZone,
    String(input.windowDays ?? 1),
  ]);
  return invokeCanonicalReadCallable<
    QueryInstructorOccupancyReadModelsInput,
    QueryInstructorOccupancyReadModelsResult
  >(QUERY_INSTRUCTOR_OCCUPANCY_READ_MODELS_CALLABLE, input, {
    idempotencyKey: `read:instructor_occupancy:${identityHash}`,
    maxAttempts: 1,
  });
}
