import {
  type QueryLessonBookingReadModelsInput,
  type QueryLessonBookingReadModelsResult,
  type QueryManagedParticipantPickerReadModelsInput,
  type QueryManagedParticipantPickerReadModelsResult,
} from '@ski-academy/shared-domain';
import { callFunction } from '../functions/functionsClient';

export const QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE = 'queryLessonBookingReadModels';
export const QUERY_MANAGED_PARTICIPANT_PICKER_READ_MODELS_CALLABLE =
  'queryManagedParticipantPickerReadModels';

function createReadModelIdempotencyKey(input: QueryLessonBookingReadModelsInput): string {
  const scopePart = input.scope;
  const cursorPart = input.cursor ?? 'start';
  const bookingPart = input.bookingId ?? 'none';
  return `read:${scopePart}:${cursorPart}:${bookingPart}`;
}

export async function queryLessonBookingReadModels(
  input: QueryLessonBookingReadModelsInput
): Promise<QueryLessonBookingReadModelsResult> {
  const idempotencyKey = createReadModelIdempotencyKey(input);
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
