import { describe, expect, it } from 'vitest';
import { assertFirebaseTestEnvironment } from '../../src/infrastructure/firebase/firebaseEnvironmentGuard';

describe('test Firebase configuration fails before SDK initialization', () => {
  for (const projectId of ['ski-school-8f3ca', 'ski-school-staging']) {
    for (const mode of ['test', 'e2e']) {
      it(`rejects ${projectId} in ${mode}`, () => {
        expect(() =>
          assertFirebaseTestEnvironment({ mode, projectId, useEmulators: true })
        ).toThrow();
      });
    }
  }
  it('rejects E2E without emulator opt-in', () => {
    expect(() =>
      assertFirebaseTestEnvironment({ mode: 'e2e', projectId: 'demo-test', useEmulators: false })
    ).toThrow();
  });
  it('allows isolated demo tests and leaves deployed modes unchanged', () => {
    expect(() =>
      assertFirebaseTestEnvironment({ mode: 'e2e', projectId: 'demo-test', useEmulators: true })
    ).not.toThrow();
    expect(() =>
      assertFirebaseTestEnvironment({
        mode: 'production',
        projectId: 'ski-school-8f3ca',
        useEmulators: false,
      })
    ).not.toThrow();
  });
});
