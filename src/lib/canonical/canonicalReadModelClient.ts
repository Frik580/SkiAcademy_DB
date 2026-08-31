import {
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
  type QueryLessonBookingReadModelsInput,
  type QueryLessonBookingReadModelsResult,
  type QueryManagedParticipantPickerReadModelsInput,
  type QueryManagedParticipantPickerReadModelsResult,
  type QueryParticipantInstructorAccessReadModelsInput,
  type QueryParticipantInstructorAccessReadModelsResult,
} from '@ski-academy/shared-domain';
import { callFunction } from '../functions/functionsClient';

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
  return callFunction<
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
            : `${'search' in input ? (input.search ?? 'all') : 'all'}:${'cursor' in input ? (input.cursor ?? 'start') : 'start'}`;
  const identityHash = canonicalDeterministicHash(['read:admin_identity:v1', input.scope, target]);
  return callFunction<QueryAdminIdentityReadModelsInput, QueryAdminIdentityReadModelsResult>(
    QUERY_ADMIN_IDENTITY_READ_MODELS_CALLABLE,
    input,
    {
      idempotencyKey: `read:admin_identity:${identityHash}`,
      maxAttempts: 1,
    }
  );
}

export async function queryAdminCourseReadModels(
  input: QueryAdminCourseReadModelsInput
): Promise<QueryAdminCourseReadModelsResult> {
  const target = input.scope === 'admin_course_detail' ? input.courseId : 'list';
  const idempotencyKey = `read:admin_course:${input.scope}:${target}`;
  return callFunction<QueryAdminCourseReadModelsInput, QueryAdminCourseReadModelsResult>(
    QUERY_ADMIN_COURSE_READ_MODELS_CALLABLE,
    input,
    { idempotencyKey, maxAttempts: 1 }
  );
}

export async function queryAdminFinanceReadModels(
  input: QueryAdminFinanceReadModelsInput
): Promise<QueryAdminFinanceReadModelsResult> {
  const target = input.scope === 'admin_wallet' ? input.accountId : input.paymentId;
  const identityHash = canonicalDeterministicHash([
    'read:admin_finance:v1',
    input.scope,
    target,
    input.cursor ?? 'start',
  ]);
  const idempotencyKey = `read:admin_finance:${identityHash}`;
  return callFunction<QueryAdminFinanceReadModelsInput, QueryAdminFinanceReadModelsResult>(
    QUERY_ADMIN_FINANCE_READ_MODELS_CALLABLE,
    input,
    { idempotencyKey, maxAttempts: 1 }
  );
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
  const idempotencyKey = [
    'read:admin_issue',
    transportInput.scope,
    transportInput.issueId ?? 'all',
    transportInput.severity ?? 'all',
    transportInput.cursor ?? 'start',
  ].join(':');
  return callFunction<QueryAdminIssueReadModelsInput, QueryAdminIssueReadModelsResult>(
    QUERY_ADMIN_ISSUE_READ_MODELS_CALLABLE,
    transportInput,
    {
      idempotencyKey,
      maxAttempts: 1,
    }
  );
}

function createLessonBookingReadModelIdempotencyKey(
  input: QueryLessonBookingReadModelsInput
): string {
  const scopePart = input.scope;
  const cursorPart = input.cursor ?? 'start';
  const bookingPart = input.bookingId ?? 'none';
  return `read:lesson_booking:${scopePart}:${cursorPart}:${bookingPart}`;
}

function createParticipantInstructorAccessReadModelIdempotencyKey(
  input: QueryParticipantInstructorAccessReadModelsInput
): string {
  return `read:participant_instructor_access:${input.scope}:${input.participantId}:${input.instructorId}`;
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
  return callFunction<QueryLessonBookingReadModelsInput, QueryLessonBookingReadModelsResult>(
    QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE,
    transportInput,
    { idempotencyKey, maxAttempts: 1 }
  );
}

export async function queryManagedParticipantPickerReadModels(
  input: QueryManagedParticipantPickerReadModelsInput = {}
): Promise<QueryManagedParticipantPickerReadModelsResult> {
  const idempotencyKey = input.accountId
    ? `read:managed_participant_picker:admin:${input.accountId}`
    : 'read:managed_participant_picker';
  return callFunction<
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
  return callFunction<QueryBookingProposalReadModelsInput, QueryBookingProposalReadModelsResult>(
    QUERY_BOOKING_PROPOSAL_READ_MODELS_CALLABLE,
    input,
    { idempotencyKey, maxAttempts: 1 }
  );
}

export async function queryBookingChangeRequestReadModels(
  input: QueryBookingChangeRequestReadModelsInput
): Promise<QueryBookingChangeRequestReadModelsResult> {
  const idempotencyKey = `read:booking_change_request:${input.scope}`;
  return callFunction<
    QueryBookingChangeRequestReadModelsInput,
    QueryBookingChangeRequestReadModelsResult
  >(QUERY_BOOKING_CHANGE_REQUEST_READ_MODELS_CALLABLE, input, { idempotencyKey, maxAttempts: 1 });
}

export async function queryParticipantInstructorAccessReadModels(
  input: QueryParticipantInstructorAccessReadModelsInput
): Promise<QueryParticipantInstructorAccessReadModelsResult> {
  const idempotencyKey = createParticipantInstructorAccessReadModelIdempotencyKey(input);
  return callFunction<
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
  const scopePart = input.scope;
  const cursorPart = input.cursor ?? 'start';
  const enrollmentPart = input.enrollmentId ?? 'none';
  const coursePart = input.courseId ?? 'none';
  return `read:course_enrollment:${scopePart}:${cursorPart}:${enrollmentPart}:${coursePart}`;
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
  return callFunction<QueryCourseEnrollmentReadModelsInput, QueryCourseEnrollmentReadModelsResult>(
    QUERY_COURSE_ENROLLMENT_READ_MODELS_CALLABLE,
    transportInput,
    { idempotencyKey, maxAttempts: 1 }
  );
}

export async function queryCourseCatalogReadModels(
  input: QueryCourseCatalogReadModelsInput
): Promise<QueryCourseCatalogReadModelsResult> {
  const idempotencyKey = `read:course_catalog:${input.scope}:${input.courseId ?? 'all'}`;
  return callFunction<QueryCourseCatalogReadModelsInput, QueryCourseCatalogReadModelsResult>(
    QUERY_COURSE_CATALOG_READ_MODELS_CALLABLE,
    input,
    { idempotencyKey, maxAttempts: 1 }
  );
}

export async function queryCourseAttendanceReadModels(
  input: QueryCourseAttendanceReadModelsInput
): Promise<QueryCourseAttendanceReadModelsResult> {
  const idempotencyKey = `read:course_attendance:${input.scope}:${input.enrollmentId ?? 'none'}:${input.courseId ?? 'none'}`;
  return callFunction<QueryCourseAttendanceReadModelsInput, QueryCourseAttendanceReadModelsResult>(
    QUERY_COURSE_ATTENDANCE_READ_MODELS_CALLABLE,
    input,
    { idempotencyKey, maxAttempts: 1 }
  );
}

export async function queryInstructorCourseAssignmentReadModels(
  input: QueryInstructorCourseAssignmentReadModelsInput
): Promise<QueryInstructorCourseAssignmentReadModelsResult> {
  const idempotencyKey = `read:instructor_course_assignment:${input.scope}`;
  return callFunction<
    QueryInstructorCourseAssignmentReadModelsInput,
    QueryInstructorCourseAssignmentReadModelsResult
  >(QUERY_INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODELS_CALLABLE, input, {
    idempotencyKey,
    maxAttempts: 1,
  });
}
