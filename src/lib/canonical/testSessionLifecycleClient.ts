import {
  TestSessionLifecycleResultSchema,
  type TestSessionLifecycleResult,
} from '@ski-academy/shared-domain';
import { callFunction } from '../functions/functionsClient';

export const TEST_SESSION_LIFECYCLE_CALLABLE = 'executeTestSessionLifecycle';

export interface TestSessionLifecycleCall {
  readonly command:
    | 'create_test_session'
    | 'close_test_session'
    | 'preview_test_session_reset'
    | 'execute_test_session_reset'
    | 'preview_test_session_delete'
    | 'execute_test_session_delete'
    | 'retry_test_session_maintenance';
  readonly label?: string;
  readonly startingBalanceKzt?: number;
  readonly actorAccountIds?: readonly string[];
  readonly testInstructorAccountId?: string;
  readonly sourceCourseIds?: readonly string[];
  readonly testSessionId?: string;
  readonly manifestId?: string;
  readonly confirmation?: string;
}

export async function executeTestSessionLifecycle(
  input: TestSessionLifecycleCall,
  idempotencyKey: string
): Promise<TestSessionLifecycleResult> {
  const result = await callFunction<TestSessionLifecycleCall, TestSessionLifecycleResult>(
    TEST_SESSION_LIFECYCLE_CALLABLE,
    input,
    { idempotencyKey, maxAttempts: 1 }
  );
  return TestSessionLifecycleResultSchema.parse(result);
}

export function lifecycleErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    const message = error.message.trim();
    if (/^(TEST_|LIFECYCLE_)/.test(message)) return message;
  }
  return 'TEST_MAINTENANCE_FAILED';
}
