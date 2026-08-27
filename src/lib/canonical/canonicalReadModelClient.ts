import {
  type QueryLessonBookingReadModelsInput,
  type QueryLessonBookingReadModelsResult,
} from '@ski-academy/shared-domain';
import { callFunction } from '../functions/functionsClient';

export const QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE = 'queryLessonBookingReadModels';

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
