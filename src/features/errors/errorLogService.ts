import { logErrorToFirestore } from '../../infrastructure/firebase/firebase';

export function logErrorBoundaryFailure(error: Error): void {
  void logErrorToFirestore(error.message, error.stack, 'error_boundary');
}
