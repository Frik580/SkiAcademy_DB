import { describe, expect, it } from 'vitest';
import {
  AccountSchema,
  parseCommandEnvelope,
  selfParticipantIdFromAccountId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../canonical/commands/commandClock';
import { createProductionCanonicalCommands } from '../canonical/commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../canonical/transactions';
import {
  LEGACY_STAGING_FIXTURE_ID,
  LEGACY_STAGING_FIXTURE_VERSION,
  STAGING_ACCOUNT_IDS,
  STAGING_AUTH_FIXTURES,
  STAGING_DEPENDENT_PARTICIPANTS,
  assertStagingFixtureManifestMatchesPlan,
  buildLegacyStagingFixturePlanV1,
  buildStagingFixturePlan,
  buildStagingFixturePlanForManifest,
} from './stagingFixtureDefinitions';

describe('staging fixture definitions', () => {
  const legacyAnchor = '2026-10-12';

  it('keeps only the smoke client identities, ownership records, and canonical wallet in v2', () => {
    const plan = buildStagingFixturePlan();
    expect(plan.version).toBe(2);
    expect(plan.commandEnvelopes).toHaveLength(4);
    expect(plan.authUids).toEqual(STAGING_AUTH_FIXTURES.map((fixture) => fixture.uid));
    expect(plan.resourceClaimOwnership).toEqual([]);
    expect(plan.storagePrefixes).toEqual([]);
    expect(plan.ownedFirestorePaths).toHaveLength(21);
    expect(plan.ownedFirestorePaths).toContain(`users/${STAGING_ACCOUNT_IDS.parent}/wallet/state`);
    expect(plan.ownedFirestorePaths).toContain(
      `participants/${selfParticipantIdFromAccountId(STAGING_ACCOUNT_IDS.parent)}`
    );
    expect(plan.ownedFirestorePaths).not.toContain(
      `participants/${selfParticipantIdFromAccountId(STAGING_ACCOUNT_IDS.admin)}`
    );
    for (const dependent of STAGING_DEPENDENT_PARTICIPANTS) {
      expect(plan.ownedFirestorePaths).toContain(`participants/${dependent.participantId}`);
      expect(plan.ownedFirestorePaths).toContain(
        `participant_management/${dependent.participantManagementId}`
      );
    }
    expect(
      plan.ownedFirestorePaths.filter((path) =>
        /^(instructors|courses|course_days|course_catalog_content|resource_claims|resource_claim_guards)\//.test(path)
      )
    ).toEqual([]);
    expect(plan.ownedFirestorePaths).not.toContain('users/real-google-owner');
    for (const envelope of plan.commandEnvelopes) {
      const parsed = parseCommandEnvelope(envelope);
      expect(parsed, `${envelope.kind}: ${parsed.success ? '' : parsed.error.message}`).toMatchObject({
        success: true,
      });
      expect(JSON.stringify(envelope)).not.toContain('testSessionId');
      expect(JSON.stringify(envelope)).not.toContain('test_actor');
    }
  });

  it('uses canonical idempotent wallet funding for exactly 1,000,000 KZT', async () => {
    const plan = buildStagingFixturePlan();
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

    for (let attempt = 0; attempt < 2; attempt += 1) {
      for (const envelope of plan.commandEnvelopes) {
        const result = await commands.execute(envelope);
        expect(result, `${envelope.kind} replay ${attempt}`).toMatchObject({ status: 'success' });
      }
    }

    const documents = executor.snapshot().docs;
    expect(documents.get('users/staging-parent/wallet/state')?.data).toMatchObject({
      balance: 1_000_000,
      eventRevision: 1,
    });
    const monetaryEvents = [...documents.entries()].filter(([path]) =>
      path.startsWith('monetary_events/')
    );
    expect(monetaryEvents).toHaveLength(1);
    expect(monetaryEvents[0]?.[1].data).toMatchObject({
      currency: 'KZT',
      walletBalanceDelta: 1_000_000,
      eventKind: 'wallet_credit',
    });
    expect(plan.ownedFirestorePaths.filter((path) => !documents.has(path))).toEqual([]);
  });

  it('resolves the deployed v1 manifest to its full legacy cleanup graph', () => {
    const legacyPlan = buildLegacyStagingFixturePlanV1(legacyAnchor);
    const planFromManifest = buildStagingFixturePlanForManifest({
      fixtureId: LEGACY_STAGING_FIXTURE_ID,
      version: LEGACY_STAGING_FIXTURE_VERSION,
      scheduleAnchorDate: legacyAnchor,
    });
    assertStagingFixtureManifestMatchesPlan(
      {
        fixtureId: legacyPlan.fixtureId,
        version: legacyPlan.version,
        scheduleAnchorDate: legacyAnchor,
        ownedFirestorePaths: legacyPlan.ownedFirestorePaths,
        resourceClaimOwnership: legacyPlan.resourceClaimOwnership,
        authUids: legacyPlan.authUids,
        storagePrefixes: legacyPlan.storagePrefixes,
      },
      planFromManifest
    );

    expect(legacyPlan.ownedFirestorePaths).toHaveLength(55);
    expect(legacyPlan.resourceClaimOwnership).toHaveLength(6);
    expect(legacyPlan.resourceClaimOwnership.every((owner) => owner.guardPaths.length > 0)).toBe(
      true
    );
    expect(legacyPlan.ownedFirestorePaths).toContain(
      'instructors/staging-instructor-catalog'
    );
    expect(legacyPlan.ownedFirestorePaths).toContain(
      'courses/staging-course-ski-foundations'
    );
    expect(legacyPlan.ownedFirestorePaths).toContain(
      'courses/staging-course-snowboard-progress'
    );
    expect(legacyPlan.ownedFirestorePaths).toContain(
      'course_catalog_content/staging-course-ski-foundations'
    );
    expect(legacyPlan.ownedFirestorePaths).toContain(
      'course_catalog_content/staging-course-snowboard-progress'
    );
    expect(
      legacyPlan.ownedFirestorePaths.filter((path) => /staging-(ski|snowboard)-day-/.test(path))
    ).toHaveLength(6);
    expect(legacyPlan.ownedFirestorePaths).not.toContain('courses/operator-authored-course');
    expect(legacyPlan.ownedFirestorePaths).not.toContain('instructors/operator-authored-instructor');
    expect(legacyPlan.authUids).not.toContain('real-google-owner');
  });
});
