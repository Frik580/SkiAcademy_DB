export const E2E_PROJECT_ID = 'demo-ski-school-e2e';
export const AUTH_EMULATOR_HOST = 'http://127.0.0.1:9299';
export const FUNCTIONS_EMULATOR_HOST = '127.0.0.1';
export const FUNCTIONS_EMULATOR_PORT = 5001;
export const FUNCTIONS_REGION = 'us-central1';
export const FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

export const E2E_STUDENT_EMAIL = 'student@e2e.test';
export const E2E_STUDENT_PASSWORD = 'password123';

export const E2E_STUDENT_B_EMAIL = 'student-b@e2e.test';
export const E2E_STUDENT_B_PASSWORD = 'password123';

export const E2E_INSTRUCTOR_EMAIL = 'instructor@e2e.test';
export const E2E_INSTRUCTOR_PASSWORD = 'password123';
export const E2E_WORKSPACE_INSTRUCTOR_ID = 'e2e-workspace-instructor';
export const E2E_WORKSPACE_INSTRUCTOR_NAME = 'E2E Workspace Coach';

export const E2E_ADMIN_EMAIL = 'admin@e2e.test';
export const E2E_ADMIN_PASSWORD = 'password123';
export const E2E_ADMIN_DISPLAY_NAME = 'E2E Admin';

export const E2E_INSTRUCTOR_ID = 'e2e-instructor-1';
export const E2E_INSTRUCTOR_NAME = 'E2E Test Coach';

export const E2E_STUDENT_DISPLAY_NAME = 'E2E Student';
export const E2E_CHILD_DISPLAY_NAME = 'E2E Child Skier';

export const DEFAULT_LESSON_DURATION_MINUTES = 120;

export function functionsCallableUrl(functionName: string): string {
  return `http://${FUNCTIONS_EMULATOR_HOST}:${FUNCTIONS_EMULATOR_PORT}/${E2E_PROJECT_ID}/${FUNCTIONS_REGION}/${functionName}`;
}
