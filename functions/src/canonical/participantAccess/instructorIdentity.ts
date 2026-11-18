import {
  CanonicalCommandError,
  InstructorIdSchema,
  LIVE_CANONICAL_EXECUTION_SCOPE,
  identityDocumentMatchesReadScope,
  type Account,
  type AccountId,
  type CommandEnvelope,
  type InstructorId,
} from '@ski-academy/shared-domain';
import { instructorCatalogPath } from '../bookings/bookingStore';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import { assertCallableInstructorCapability, requireAccountActor } from './participantAccessAuthorization';
import { accountPath, parseAccount } from './participantAccessStore';

export function resolveActiveAccountInstructorId(
  accountId: AccountId,
  account: Account | undefined,
  profileInstructorId: unknown
): InstructorId | undefined {
  if (account?.accountId !== accountId || account.lifecycle.status !== 'active') return undefined;
  const parsed = InstructorIdSchema.safeParse(profileInstructorId);
  return parsed.success ? parsed.data : undefined;
}

export function hasInstructorAccountLink(
  catalog: Record<string, unknown> | undefined,
  instructorId: InstructorId,
  accountId: AccountId
): catalog is Record<string, unknown> {
  return (
    catalog?.linkedAccountId === accountId &&
    (catalog.id === undefined || catalog.id === instructorId)
  );
}

export async function readVerifiedInstructorCatalog(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope,
  instructorId: InstructorId
): Promise<Record<string, unknown>> {
  assertCallableInstructorCapability(envelope, instructorId);
  const { accountId } = requireAccountActor(envelope);
  const account = accountPath(accountId);
  const accountRead = await session.tx.get({ path: account });
  session.plan.planRead({ path: account, category: 'authorization_check' });
  const profile = accountRead.exists ? accountRead.data : undefined;
  const currentInstructorId = resolveActiveAccountInstructorId(
    accountId,
    parseAccount(profile),
    profile?.instructorId
  );
  if (
    currentInstructorId !== instructorId ||
    !identityDocumentMatchesReadScope(session.scope ?? LIVE_CANONICAL_EXECUTION_SCOPE, profile)
  ) {
    throw new CanonicalCommandError('forbidden', { correlationId: envelope.context.correlationId });
  }

  const catalog = instructorCatalogPath(instructorId);
  const catalogRead = await session.tx.get({ path: catalog });
  session.plan.planRead({ path: catalog, category: 'authorization_check' });
  const record = catalogRead.exists ? catalogRead.data : undefined;
  if (!hasInstructorAccountLink(record, instructorId, accountId)) {
    throw new CanonicalCommandError('forbidden', { correlationId: envelope.context.correlationId });
  }
  return record;
}
