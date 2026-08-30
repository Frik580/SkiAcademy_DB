import {
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
  const idempotencyKey = 'read:managed_participant_picker';
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
