import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  CommandIdSchema,
  KztMinorUnitsSchema,
  SystemActorIdSchema,
  TestSessionPolicyError,
  WalletSchema,
  assertTestSessionAcceptsProvisioningMutations,
  canonicalScopeFields,
  creditWalletBalance,
  monetaryEventIdFromTestWalletSeed,
  nextAggregateRevision,
  parsePersistedCanonicalScope,
  testCanonicalExecutionScope,
  timestampFromDate,
  type AccountId,
  type CanonicalTimestamp,
  type CommandId,
  type CorrelationId,
  type MonetaryEvent,
  type TestSession,
  type Wallet,
} from '@ski-academy/shared-domain';
import type { CanonicalTransactionExecutor } from '../transactions';
import {
  FINANCE_PLANNING_ESTIMATES,
  initialWallet,
  mergeWalletBalance,
  monetaryEventPath,
  parseWallet,
  toFirestoreWritePayload,
  walletPath,
} from '../finance/financeStore';
import { crossScopeCommandError } from './assertTestMutableResourceScope';
import { parseTestActor, parseTestSession, testActorPath, testSessionPath } from './testSessionStore';

const TEST_WALLET_SEED_SYSTEM_ACTOR = SystemActorIdSchema.parse('system_test_wallet_seed');
const TEST_WALLET_SEED_REASON = 'test_wallet_seed';

export interface SeedTestActorWalletInput {
  readonly executor: CanonicalTransactionExecutor;
  readonly correlationId: CorrelationId;
  readonly testSession: Pick<TestSession, 'testSessionId' | 'status' | 'config'>;
  readonly accountId: AccountId;
  readonly decidedAt: Date;
}

export interface SeedTestActorWalletResult {
  readonly outcome: 'created' | 'rebound' | 'already_seeded';
  readonly wallet: Wallet;
  readonly monetaryEventId: ReturnType<typeof monetaryEventIdFromTestWalletSeed>;
}

function commandIdForSeed(
  accountId: AccountId,
  testSessionId: TestSession['testSessionId']
): CommandId {
  return CommandIdSchema.parse(
    monetaryEventIdFromTestWalletSeed({ accountId, testSessionId })
  );
}

function mapProvisioningError(correlationId: CorrelationId, error: unknown): never {
  if (error instanceof CanonicalCommandError) throw error;
  if (error instanceof TestSessionPolicyError) {
    throw new CanonicalCommandError('cross_scope_forbidden', {
      correlationId,
      details: { reason: 'unsupported' },
    });
  }
  throw error;
}

export async function seedTestActorWalletForSession(
  input: SeedTestActorWalletInput
): Promise<SeedTestActorWalletResult> {
  try {
    assertTestSessionAcceptsProvisioningMutations(input.testSession);
  } catch (error) {
    mapProvisioningError(input.correlationId, error);
  }

  const scope = testCanonicalExecutionScope(input.testSession.testSessionId);
  const walletDocumentPath = walletPath(input.accountId);
  const actorDocumentPath = testActorPath(input.accountId);
  const sessionDocumentPath = testSessionPath(input.testSession.testSessionId);
  const eventId = monetaryEventIdFromTestWalletSeed({
    accountId: input.accountId,
    testSessionId: input.testSession.testSessionId,
  });
  const eventDocumentPath = monetaryEventPath(eventId);
  const startingBalance = KztMinorUnitsSchema.parse(input.testSession.config.startingBalanceKzt);
  const commandId = commandIdForSeed(input.accountId, input.testSession.testSessionId);
  const decidedAt = timestampFromDate(input.decidedAt) as CanonicalTimestamp;

  return input.executor.runAtomic({
    correlationId: input.correlationId,
    run: async (session) => {
      const sessionRead = await session.tx.get({ path: sessionDocumentPath });
      session.plan.planRead({ path: sessionDocumentPath, category: 'authorization_check' });
      const persistedSession = parseTestSession(sessionRead.exists ? sessionRead.data : undefined);
      if (!persistedSession || persistedSession.testSessionId !== input.testSession.testSessionId) {
        throw new CanonicalCommandError('validation', {
          correlationId: input.correlationId,
          details: { reason: 'conflict' },
        });
      }
      try {
        assertTestSessionAcceptsProvisioningMutations(persistedSession);
      } catch (error) {
        mapProvisioningError(input.correlationId, error);
      }

      const actorRead = await session.tx.get({ path: actorDocumentPath });
      session.plan.planRead({ path: actorDocumentPath, category: 'authorization_check' });
      const actor = parseTestActor(actorRead.exists ? actorRead.data : undefined);
      if (!actor || !actor.allowed || actor.accountId !== input.accountId) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: input.correlationId,
        });
      }

      const walletRead = await session.tx.get({ path: walletDocumentPath });
      session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
      const existingWallet = parseWallet(walletRead.exists ? walletRead.data : undefined);
      const eventRead = await session.tx.get({ path: eventDocumentPath });
      session.plan.planRead({ path: eventDocumentPath, category: 'payment_wallet' });

      if (existingWallet) {
        const existingScope = parsePersistedCanonicalScope(existingWallet, {
          allowLegacyLive: true,
        });
        if (existingScope.dataScope === 'live') {
          throw crossScopeCommandError(input.correlationId, 'conflict');
        }
        if (
          existingScope.testSessionId === input.testSession.testSessionId &&
          existingWallet.balance === startingBalance &&
          eventRead.exists
        ) {
          return {
            outcome: 'already_seeded' as const,
            wallet: existingWallet,
            monetaryEventId: eventId,
          };
        }
      }

      const rebound = Boolean(existingWallet);
      session.plan.planMutation({
        path: walletDocumentPath,
        kind: walletRead.exists ? 'update' : 'create',
        category: 'payment_wallet',
        estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.walletBytes,
      });
      session.plan.planMutation({
        path: eventDocumentPath,
        kind: eventRead.exists ? 'update' : 'create',
        category: 'payment_wallet',
        estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.monetaryEventBytes,
      });

      await session.transitionToWrites();

      const baseWallet = initialWallet(input.accountId, decidedAt);
      const credited = creditWalletBalance(baseWallet.balance, startingBalance);
      const wallet = WalletSchema.parse({
        ...mergeWalletBalance(baseWallet, credited, {
          revision: existingWallet
            ? nextAggregateRevision(existingWallet.revision)
            : AggregateRevisionSchema.parse(1),
          eventRevision: AggregateRevisionSchema.parse(1),
          updatedAt: decidedAt,
        }),
        ...canonicalScopeFields(scope),
      });
      const monetaryEvent: MonetaryEvent = {
        eventId,
        eventKind: 'wallet_credit',
        currency: 'KZT',
        walletAccountId: input.accountId,
        walletBalanceDelta: startingBalance,
        sourceKind: 'system',
        actor: { kind: 'system', systemActorId: TEST_WALLET_SEED_SYSTEM_ACTOR },
        reasonCode: TEST_WALLET_SEED_REASON,
        commandId,
        correlationId: input.correlationId,
        walletEventRevision: wallet.eventRevision,
        occurredAt: decidedAt,
        recordedAt: decidedAt,
        ...canonicalScopeFields(scope),
      };

      const walletPayload = toFirestoreWritePayload(wallet as Record<string, unknown>);
      if (walletRead.exists) {
        session.tx.update({ path: walletDocumentPath }, walletPayload);
      } else {
        session.tx.create({ path: walletDocumentPath }, walletPayload);
      }

      const eventPayload = toFirestoreWritePayload(monetaryEvent as Record<string, unknown>);
      if (eventRead.exists) {
        session.tx.update({ path: eventDocumentPath }, eventPayload);
      } else {
        session.tx.create({ path: eventDocumentPath }, eventPayload);
      }

      return {
        outcome: rebound ? ('rebound' as const) : ('created' as const),
        wallet,
        monetaryEventId: eventId,
      };
    },
  });
}
