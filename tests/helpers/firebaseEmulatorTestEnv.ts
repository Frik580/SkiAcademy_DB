import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  type TestEnvironmentConfig,
} from '@firebase/rules-unit-testing';

export interface EmulatorTestEnvironmentOptions {
  /**
   * Keep FIREBASE_EMULATOR_HUB when running under `firebase emulators:exec`.
   * Required for Storage rules that call firestore.get()/exists().
   */
  preserveEmulatorHub?: boolean;
}

/**
 * Initialize a rules test environment against explicitly configured emulators.
 * Clears FIREBASE_EMULATOR_HUB so a stale hub env var does not trigger discovery
 * against a dead emulator hub (ECONNREFUSED on port 4400).
 */
export async function initializeEmulatorTestEnvironment(
  config: TestEnvironmentConfig,
  options: EmulatorTestEnvironmentOptions = {}
): Promise<RulesTestEnvironment> {
  if (!options.preserveEmulatorHub) {
    delete process.env.FIREBASE_EMULATOR_HUB;
  }
  return initializeTestEnvironment(config);
}

export async function cleanupEmulatorTestEnvironment(
  testEnv: RulesTestEnvironment | undefined
): Promise<void> {
  if (testEnv) {
    await testEnv.cleanup();
  }
}
