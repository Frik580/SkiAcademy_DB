import { logErrorToFirestore } from '../../infrastructure/firebase';
import type { FunctionsClientError } from '../../lib/functions/functionsClient';

export function logErrorBoundaryFailure(error: Error): void {
  void logErrorToFirestore(error.message, error.stack, 'error_boundary');
}

export function logCallableFailure(functionName: string, error: FunctionsClientError): void {
  void logErrorToFirestore(
    error.message,
    error.stack,
    'cloud_function',
    'CALL',
    `functions/${functionName}`
  );
}
