import { IdempotencyKeySchema } from '@ski-academy/shared-domain';
import { executeAuthenticatedCanonicalCommand } from './canonicalCommandClient';
import { mapCanonicalCommandResultError } from './mapCanonicalCommandError';

const SELF_PARTICIPANT_PROVISIONING_IDEMPOTENCY_KEY = IdempotencyKeySchema.parse(
  // v2: forces one post-deploy reconcile so historical UserProfile↔self Participant
  // identity drift is repaired; subsequent calls with this key remain cheap replays.
  'provision-self-participant-v2'
);

const STARTER_CREDIT_GRANT_IDEMPOTENCY_KEY = IdempotencyKeySchema.parse('grant-starter-credit-v1');

export async function ensureCanonicalSelfParticipant(accountId: string): Promise<void> {
  const provisionResult = await executeAuthenticatedCanonicalCommand(accountId, {
    kind: 'provision_self_participant',
    intent: {},
    idempotencyKey: SELF_PARTICIPANT_PROVISIONING_IDEMPOTENCY_KEY,
    exercisedCapability: 'account_owner',
  });
  const provisionError = mapCanonicalCommandResultError(provisionResult);
  if (provisionError) throw provisionError;

  const grantResult = await executeAuthenticatedCanonicalCommand(accountId, {
    kind: 'grant_starter_credit',
    intent: {},
    idempotencyKey: STARTER_CREDIT_GRANT_IDEMPOTENCY_KEY,
    exercisedCapability: 'account_owner',
  });
  const grantError = mapCanonicalCommandResultError(grantResult);
  if (grantError) throw grantError;
}
