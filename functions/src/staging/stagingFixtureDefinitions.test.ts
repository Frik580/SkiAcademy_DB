import { describe, expect, it } from 'vitest';
import { AccountSchema, parseCommandEnvelope, timestampFromDate } from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../canonical/commands/commandClock';
import { createProductionCanonicalCommands } from '../canonical/commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../canonical/transactions';
import {
  STAGING_ACCOUNT_IDS,
  STAGING_AUTH_FIXTURES,
  STAGING_DEPENDENT_PARTICIPANTS,
  buildStagingCourseManifests,
  buildStagingFixturePlan,
} from './stagingFixtureDefinitions';

describe('staging fixture definitions', () => {
  const anchor = '2026-10-12';

  it('builds two operational courses with six distinct future CourseDays', () => {
    const manifests = buildStagingCourseManifests(anchor);
    expect(manifests).toHaveLength(2);
    expect(manifests.flatMap((manifest) => manifest.days)).toHaveLength(6);
    expect(
      new Set(manifests.flatMap((manifest) => manifest.days.map((day) => day.courseDayId))).size
    ).toBe(6);
    expect(manifests.every((manifest) => manifest.instructorRosterIds.length === 1)).toBe(true);
  });

  it('uses canonical LIVE commands without TestSession/TestActor fields', () => {
    const plan = buildStagingFixturePlan(anchor);
    expect(plan.commandEnvelopes).toHaveLength(9);
    for (const envelope of plan.commandEnvelopes) {
      const parsed = parseCommandEnvelope(envelope);
      expect(
        parsed,
        `${envelope.kind}: ${parsed.success ? '' : parsed.error.message}`
      ).toMatchObject({ success: true });
      expect(JSON.stringify(envelope)).not.toContain('testSessionId');
      expect(JSON.stringify(envelope)).not.toContain('test_actor');
    }
  });

  it('owns deterministic identities, canonical wallet funding, claims, and no storage objects', () => {
    const plan = buildStagingFixturePlan(anchor);
    expect(plan.authUids).toEqual(STAGING_AUTH_FIXTURES.map((fixture) => fixture.uid));
    expect(plan.ownedFirestorePaths).toHaveLength(55);
    expect(plan.resourceClaimOwnership).toHaveLength(6);
    expect(plan.storagePrefixes).toEqual([]);
    expect(plan.ownedFirestorePaths).toContain(`users/${STAGING_ACCOUNT_IDS.parent}/wallet/state`);
    for (const dependent of STAGING_DEPENDENT_PARTICIPANTS) {
      expect(plan.ownedFirestorePaths).toContain(`participants/${dependent.participantId}`);
      expect(plan.ownedFirestorePaths).toContain(
        `participant_management/${dependent.participantManagementId}`
      );
    }
    const funding = plan.commandEnvelopes.find(
      (envelope) => envelope.kind === 'record_manual_wallet_funding'
    );
    expect(funding?.intent).toMatchObject({ amount: 1_000_000 });
  });

  it('executes through production canonical commands and accounts for every created document', async () => {
    const plan = buildStagingFixturePlan(anchor);
    const decidedAt = timestampFromDate(new Date('2026-10-01T00:00:00.000Z'));
    const initialDocuments = Object.fromEntries(
      STAGING_AUTH_FIXTURES.map((fixture) => [
        `users/${fixture.uid}`,
        {
          ...AccountSchema.parse({
            accountId: fixture.uid,
            dataScope: 'live',
            lifecycle: { status: 'active' },
            revision: 1,
            createdAt: decidedAt,
            updatedAt: decidedAt,
            audit: {
              createdByCommandId: 'command_staging_fixture_bootstrap',
              lastChangedByCommandId: 'command_staging_fixture_bootstrap',
              correlationId: `staging-account-${fixture.uid}`,
            },
          }),
          uid: fixture.uid,
          email: fixture.email,
          displayName: fixture.displayName,
          avatarUrl: '',
          role: fixture.uid === STAGING_ACCOUNT_IDS.admin ? 'admin' : 'user',
          ...(fixture.uid === STAGING_ACCOUNT_IDS.admin ? { systemRole: 'owner' } : {}),
          isClientActive: true,
        },
      ])
    );
    const executor = createInMemoryCanonicalTransactionExecutor(initialDocuments);
    const commands = createProductionCanonicalCommands(
      {
        clock: createAuthoritativeCommandClock(new Date('2026-10-01T00:00:00.000Z')),
        scope: { dataScope: 'live' },
      },
      executor
    );

    for (const envelope of plan.commandEnvelopes) {
      const result = await commands.execute(envelope);
      expect(result, envelope.kind).toMatchObject({ status: 'success' });
    }

    const paths = [...executor.snapshot().docs.keys()];
    expect(plan.ownedFirestorePaths.filter((path) => !paths.includes(path))).toEqual([]);
    expect(
      paths.filter(
        (path) =>
          !plan.ownedFirestorePaths.includes(path) &&
          !path.startsWith('admin_runtime/') &&
          !path.startsWith('resource_claim_guards/')
      )
    ).toEqual([]);
  });
});
