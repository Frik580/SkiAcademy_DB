import {
  type QueryBookingChangeRequestReadModelsInput,
  type QueryBookingChangeRequestReadModelsResult,
  type QueryBookingProposalReadModelsInput,
  type QueryBookingProposalReadModelsResult,
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

export async function queryLessonBookingReadModels(
  input: QueryLessonBookingReadModelsInput
): Promise<QueryLessonBookingReadModelsResult> {
  const idempotencyKey = createLessonBookingReadModelIdempotencyKey(input);
  return callFunction<QueryLessonBookingReadModelsInput, QueryLessonBookingReadModelsResult>(
    QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE,
    input,
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
