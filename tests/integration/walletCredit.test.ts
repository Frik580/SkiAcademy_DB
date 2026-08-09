import { doc, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { grantAndApplyWalletCredit, MAX_WALLET_CREDIT_USD } from '../../src/lib/walletCredit';
import {
  USER_ID,
  clearIntegrationFirestore,
  integrationTestEnv,
  seedBookingUser,
  seedOwnerAndMigrationFlag,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
} from './helpers';

describe('wallet credit', () => {
  beforeAll(async () => {
    await setupIntegrationTestEnvironment();
  });

  beforeEach(async () => {
    await clearIntegrationFirestore();
    await seedOwnerAndMigrationFlag(true);
    await seedBookingUser(100);
  });

  afterAll(async () => {
    await teardownIntegrationTestEnvironment();
  });

  it('grants and applies wallet credit in a single transaction', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();

    const newBalance = await grantAndApplyWalletCredit(userDb, USER_ID, 50);

    const userDoc = await getDoc(doc(userDb, 'users', USER_ID));
    expect(newBalance).toBe(150);
    expect(userDoc.data()?.balanceUSD).toBe(150);
    expect(userDoc.data()?.pendingWalletCredit ?? 0).toBe(0);
  });

  it('flushes stale pending credits before applying a new grant', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();

    await grantAndApplyWalletCredit(userDb, USER_ID, 25);
    const newBalance = await grantAndApplyWalletCredit(userDb, USER_ID, 25);

    const userDoc = await getDoc(doc(userDb, 'users', USER_ID));
    expect(newBalance).toBe(150);
    expect(userDoc.data()?.balanceUSD).toBe(150);
  });

  it('rejects wallet credits above the configured limit', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();

    await expect(
      grantAndApplyWalletCredit(userDb, USER_ID, MAX_WALLET_CREDIT_USD + 1)
    ).rejects.toThrow(/limit/i);
  });
});
