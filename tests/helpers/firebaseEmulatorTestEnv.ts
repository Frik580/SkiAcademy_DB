import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  type TestEnvironmentConfig,
} from '@firebase/rules-unit-testing';

/**
 * Initialize a rules test environment against explicitly configured emulators.
 * Clears FIREBASE_EMULATOR_HUB so a stale hub env var does not trigger discovery
 * against a dead emulator hub (ECONNREFUSED on port 4400).
 */
export async function initializeEmulatorTestEnvironment(
  config: TestEnvironmentConfig
): Promise<RulesTestEnvironment> {
  delete process.env.FIREBASE_EMULATOR_HUB;
  return initializeTestEnvironment(config);
}

export async function cleanupEmulatorTestEnvironment(
  testEnv: RulesTestEnvironment | undefined
): Promise<void> {
  if (testEnv) {
    await testEnv.cleanup();
  }
}
