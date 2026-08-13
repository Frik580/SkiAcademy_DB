import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  grantAndApplyWalletCredit,
  MAX_WALLET_CREDIT_USD,
  updateUserWithAdminBalanceLedger,
} from '../../src/lib/walletCredit';
import {
  OWNER_ID,
  USER_ID,
  clearIntegrationFirestore,
  integrationTestEnv,
  seedBookingUser,
  seedOwnerAndMigrationFlag,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  userProfile,
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

  it('grants and applies wallet credit through admin context', async () => {
    const adminDb = integrationTestEnv()
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();

    const newBalance = await grantAndApplyWalletCredit(adminDb, USER_ID, 50);

    const userDoc = await getDoc(doc(adminDb, 'users', USER_ID));
    expect(newBalance).toBe(150);
    expect(userDoc.data()?.balanceUSD).toBe(150);
    expect(userDoc.data()?.pendingWalletCredit ?? 0).toBe(0);
  });

  it('flushes stale pending credits before applying a new admin grant', async () => {
    const adminDb = integrationTestEnv()
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();

    await grantAndApplyWalletCredit(adminDb, USER_ID, 25);
    const newBalance = await grantAndApplyWalletCredit(adminDb, USER_ID, 25);

    const userDoc = await getDoc(doc(adminDb, 'users', USER_ID));
    expect(newBalance).toBe(150);
    expect(userDoc.data()?.balanceUSD).toBe(150);
  });

  it('blocks client self-credit grants', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();

    await expect(grantAndApplyWalletCredit(userDb, USER_ID, 50)).rejects.toThrow();
  });

  it('rejects wallet credits above the configured limit', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();

    await expect(
      grantAndApplyWalletCredit(userDb, USER_ID, MAX_WALLET_CREDIT_USD + 1)
    ).rejects.toThrow(/limit/i);
  });

  it('records admin balance edits in wallet_ledger', async () => {
    const adminDb = integrationTestEnv()
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();

    await updateUserWithAdminBalanceLedger(adminDb, {
      ...userProfile(USER_ID, 'user@example.com', 'user'),
      balanceUSD: 250,
    });

    const userDoc = await getDoc(doc(adminDb, 'users', USER_ID));
    expect(userDoc.data()?.balanceUSD).toBe(250);

    const ledgerSnap = await getDocs(
      query(
        collection(adminDb, 'wallet_ledger'),
        where('userId', '==', USER_ID),
        where('type', '==', 'admin_adjustment')
      )
    );

    expect(ledgerSnap.size).toBe(1);
    expect(ledgerSnap.docs[0].data()).toMatchObject({
      amount: 150,
      balanceAfter: 250,
      type: 'admin_adjustment',
    });
  });
});
