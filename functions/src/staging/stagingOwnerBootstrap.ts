import {
  AccountIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  nextAggregateRevision,
  parseAccountDocument,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { assertStagingMutationEnvironment } from './stagingProjectGuard';

const OWNER_BOOTSTRAP_COMMAND_ID = CommandIdSchema.parse('command_staging_grant_owner');
const OWNER_BOOTSTRAP_CORRELATION_ID = CorrelationIdSchema.parse('correlation_staging_grant_owner');

type OwnerBootstrapAuth = Pick<Auth, 'getUserByEmail'>;
type OwnerBootstrapFirestore = Pick<Firestore, 'doc' | 'runTransaction'>;

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function normalizedEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('STAGING_OWNER_EMAIL is required and must be a valid email address');
  }
  return email;
}

export async function grantStagingOwner(input: {
  readonly email: string;
  readonly explicitProjectId?: string;
  readonly adminAppProjectId?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly auth: OwnerBootstrapAuth;
  readonly firestore: OwnerBootstrapFirestore;
  readonly now?: Date;
}): Promise<{ readonly uid: string; readonly changed: boolean }> {
  assertStagingMutationEnvironment({
    explicitProjectId: input.explicitProjectId,
    adminAppProjectId: input.adminAppProjectId,
    env: input.env,
  });

  const email = normalizedEmail(input.email);
  let authUser: Awaited<ReturnType<OwnerBootstrapAuth['getUserByEmail']>>;
  try {
    authUser = await input.auth.getUserByEmail(email);
  } catch (error) {
    if (errorCode(error) === 'auth/user-not-found') {
      throw new Error(`STAGING ONLY: no existing Firebase Auth user found for ${email}`);
    }
    throw error;
  }

  if (authUser.email?.trim().toLowerCase() !== email) {
    throw new Error('STAGING ONLY: Firebase Auth email does not match STAGING_OWNER_EMAIL');
  }
  if (!authUser.providerData.some((provider) => provider.providerId === 'google.com')) {
    throw new Error('STAGING ONLY: existing Firebase Auth user is not linked to Google');
  }

  const accountId = AccountIdSchema.safeParse(authUser.uid);
  if (!accountId.success) {
    throw new Error('STAGING ONLY: Firebase Auth UID is not a valid canonical Account ID');
  }

  const accountRef = input.firestore.doc(`users/${authUser.uid}`);
  const updatedAt = timestampFromDate(input.now ?? new Date());
  const changed = await input.firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(accountRef);
    if (!snapshot.exists) {
      throw new Error(`STAGING ONLY: canonical Account ${authUser.uid} does not exist`);
    }
    const data = snapshot.data() as Record<string, unknown> | undefined;
    const account = parseAccountDocument(data);
    if (!account || account.accountId !== accountId.data) {
      throw new Error(`STAGING ONLY: canonical Account ${authUser.uid} has an invalid shape`);
    }
    if (account.lifecycle.status !== 'active') {
      throw new Error(`STAGING ONLY: refusing to promote inactive Account ${authUser.uid}`);
    }
    if (account.dataScope === 'test' || account.testSessionId !== undefined) {
      throw new Error(`STAGING ONLY: refusing to promote test-scoped Account ${authUser.uid}`);
    }
    if (data?.email?.toString().trim().toLowerCase() !== email) {
      throw new Error(`STAGING ONLY: Account ${authUser.uid} email does not match Firebase Auth`);
    }
    if (data?.uid !== undefined && data.uid !== authUser.uid) {
      throw new Error(`STAGING ONLY: Account ${authUser.uid} has a conflicting uid field`);
    }
    if (data?.role !== 'user' && data?.role !== 'admin') {
      throw new Error(`STAGING ONLY: Account ${authUser.uid} has an invalid role field`);
    }
    if (data?.systemRole !== undefined && data.systemRole !== 'owner') {
      throw new Error(`STAGING ONLY: Account ${authUser.uid} has an unexpected systemRole field`);
    }

    if (data.role === 'admin' && data.systemRole === 'owner') return false;

    transaction.update(accountRef, {
      role: 'admin',
      systemRole: 'owner',
      revision: nextAggregateRevision(account.revision),
      updatedAt,
      audit: {
        ...account.audit,
        lastChangedByCommandId: OWNER_BOOTSTRAP_COMMAND_ID,
        correlationId: OWNER_BOOTSTRAP_CORRELATION_ID,
      },
    });
    return true;
  });

  return { uid: authUser.uid, changed };
}
