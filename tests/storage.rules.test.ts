import { readFileSync } from 'node:fs';
import {
  assertFails,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadString } from 'firebase/storage';
import { afterAll, beforeAll, describe, it } from 'vitest';

const PROJECT_ID = 'ski-academy-storage-rules-test';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'),
    },
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadString(ref(context.storage(), 'existing/image.txt'), 'private');
  });
});

afterAll(async () => {
  await testEnv.cleanup();
}, 30_000);

describe('storage default deny', () => {
  it('rejects anonymous and authenticated uploads', async () => {
    const anonymousStorage = testEnv.unauthenticatedContext().storage();
    const authenticatedStorage = testEnv.authenticatedContext('user-1').storage();

    await assertFails(uploadString(ref(anonymousStorage, 'avatars/anonymous.txt'), 'unsafe'));
    await assertFails(uploadString(ref(authenticatedStorage, 'avatars/user-1.txt'), 'unsafe'));
  });

  it('rejects reads of existing objects', async () => {
    const authenticatedStorage = testEnv.authenticatedContext('user-1').storage();

    await assertFails(getBytes(ref(authenticatedStorage, 'existing/image.txt')));
  });
});
