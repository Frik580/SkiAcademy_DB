import { toFunctionsClientError } from '../../lib/functions/functionsClient';
import type { InstructorCourseReadErrorCode } from './instructorCourseContracts';

export function classifyInstructorCourseReadError(error: unknown): InstructorCourseReadErrorCode {
  const normalized = toFunctionsClientError(error);
  if (normalized.code === 'functions/permission-denied') {
    return 'permission-denied';
  }
  return 'read-failed';
}
