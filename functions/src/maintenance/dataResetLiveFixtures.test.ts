import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { Timestamp, GeoPoint } from 'firebase-admin/firestore';
import {
  ResourceClaimGuardSchema,
  resourceClaimGuardBucketKeyFromIdentity,
} from '@ski-academy/shared-domain';
import { canonicalCourseDeliveryFixtures as courseFixture } from '@ski-academy/shared-domain/testing';
import { liveAccounts, livePerson, liveFixtureData } from '../../testSupport/dataResetLiveFixture';
const require = createRequire(import.meta.url);
const { buildManifest } = require('../../scripts/data-reset/engine.cjs');
const { fixtureOwnership, CONTRACT } = require('../../scripts/data-reset/stagingFixtures.cjs');
const {
  createRecoveryExport,
  readRecoveryExport,
} = require('../../scripts/data-reset/recovery.cjs');
const { fingerprint, storagePlan } = require('../../scripts/data-reset/storage.cjs');
const { hash } = require('../../scripts/data-reset/inventory.cjs');
const target = { projectId: 'demo-live-reset', databaseId: '(default)', entrypoint: 'staging' };
function plan(
  extra: Record<string, Record<string, unknown>> = {},
  alternateTarget = target,
  mode = 'full-test-reset'
) {
  const data = { ...liveFixtureData(), ...extra };
  const snapshot = {
    complete: true,
    rows: Object.entries(data).map(([path, data]) => ({
      path,
      data,
      hash: hash(data),
      updateTime: '1:0',
    })),
    ghosts: [],
    auth: liveAccounts.map((uid) => ({ uid, hash: uid })),
    storage: { complete: true, bucket: 'demo-live-reset.firebasestorage.app', objects: [] },
  };
  const selection = {
    contract: CONTRACT,
    accountIds: liveAccounts,
    participantIds: [livePerson],
    testSessionIds: [],
    storageObjects: [],
    documents: snapshot.rows
      .filter((r) => /^(bookings|course_enrollments)\//.test(r.path))
      .map((r) => ({ path: r.path, sha256: r.hash })),
  };
  const proof = fixtureOwnership(snapshot, selection, alternateTarget, mode);
  selection.documents = snapshot.rows
    .filter((r) => proof.eligible.has(r.path))
    .map((r) => ({ path: r.path, sha256: r.hash }));
  return {
    snapshot,
    selection,
    manifest: buildManifest(snapshot, {
      target: alternateTarget,
      mode,
      selection,
      createdAt: '2026-01-01T00:00:00Z',
    }),
  };
}
describe('staging LIVE fixture reset contract', () => {
  it('deletes only linked activity, preserves all identities/grant tombstones and unrelated logs without relabelling', () => {
    const { manifest, snapshot } = plan();
    expect(manifest.blockers).toEqual([]);
    expect(
      manifest.actions
        .filter((a: { kind: string }) => a.kind === 'delete')
        .map((a: { path: string }) => a.path)
        .sort()
    ).toEqual(['bookings/live_old', 'error_logs/err_linked', 'payments/payment_live_old']);
    expect(
      snapshot.rows.filter((r) => r.data.dataScope).every((r) => r.data.dataScope === 'live')
    ).toBe(true);
    expect(
      manifest.fixtureClassification.filter(
        (r: { type: string }) => r.type === 'one_time_starter_credit_tombstone'
      )
    ).toHaveLength(5);
  });
  it('forbids the contract in production and other cloud projects before any mutation', () => {
    expect(() =>
      plan({}, { projectId: 'ski-school-8f3ca', databaseId: '(default)', entrypoint: 'production' })
    ).toThrow('staging-only');
    expect(() =>
      plan({}, { projectId: 'other-project', databaseId: '(default)', entrypoint: 'staging' })
    ).toThrow('staging-only');
  });
  it('fails closed for unknown log/grant shapes, foreign identities and unselected roots', () => {
    const grant = `users/${liveAccounts[0]}/wallet/starter_credit_grant`;
    expect(
      plan({
        [grant]: {
          granted: true,
          amountKzt: 250,
          grantedAt: { seconds: 1, nanoseconds: 0 },
          unknown: true,
        },
      }).manifest.blockers.join()
    ).toContain('Unknown starter grant');
    expect(
      plan({ 'error_logs/unknown': { id: 'unknown', message: 'bad' } }).manifest.blockers.join()
    ).toContain('Unknown/foreign error log');
    const { snapshot, selection } = plan();
    selection.documents = [];
    expect(
      buildManifest(snapshot, { target, mode: 'full-test-reset', selection }).blockers.join()
    ).toContain('every exact old');
    selection.accountIds = liveAccounts.slice(1);
    expect(
      buildManifest(snapshot, { target, mode: 'full-test-reset', selection }).blockers.join()
    ).toContain('every Account/Auth');
  });
  it('blocks frozen Course deletion while retaining the Course document', () => {
    const course = {
      ...courseFixture.course,
      dataScope: 'live',
      startAt: { seconds: 1, nanoseconds: 0 },
    };
    const enrollment = {
      ...courseFixture.confirmedEnrollment,
      dataScope: 'live',
      participantId: livePerson,
      payerAccountId: liveAccounts[0],
      attribution: {
        bookingOrigin: 'account',
        bookedBy: { kind: 'account', accountId: liveAccounts[0] },
      },
    };
    const { manifest } = plan({
      [`courses/${course.courseId}`]: course,
      [`course_enrollments/${enrollment.enrollmentId}`]: enrollment,
    });
    expect(manifest.blockers.join()).toContain('frozen capacity');
    expect(
      manifest.actions.some(
        (a: { path: string; kind: string }) =>
          a.path === `courses/${course.courseId}` && a.kind === 'delete'
      )
    ).toBe(false);
  });
  it('recognizes a verified public image cache, preserves it and rejects forged provenance', () => {
    const crypto = require('node:crypto'),
      sourceUrl = 'https://storage.yandexcloud.net/carve/banner.jpg';
    const digest = crypto.createHash('sha256').update(`${sourceUrl}|960|72|webp`).digest('hex');
    const name = `image-cache/${digest}_w960_q72.webp`;
    const object = fingerprint({
      name,
      bucket: target.projectId + '.firebasestorage.app',
      generation: '1',
      metageneration: '1',
      md5Hash: 'md5',
      size: '4',
      contentType: 'image/webp',
      metadata: { sourceUrl, width: '960', quality: '72' },
    });
    const { snapshot, selection } = plan();
    snapshot.storage.objects = [object] as never;
    const blockers: string[] = [];
    const result = storagePlan(snapshot, selection, [], target, blockers);
    expect(blockers).toEqual([]);
    expect(result.deletions).toEqual([]);
    expect(result.classification[0].decision).toBe('preserve');
    const forged = { ...object, name: name.replace(digest, 'f'.repeat(64)) };
    snapshot.storage.objects = [forged] as never;
    storagePlan(snapshot, selection, [], target, blockers);
    expect(blockers.join()).toContain('Unsupported Storage ownership');
  });
  it('round-trips typed critical recovery data and rejects corrupted archives', () => {
    const { snapshot } = plan({
      'settings/typed': {
        time: new Timestamp(1, 123),
        geo: new GeoPoint(1, 2),
        bytes: Buffer.from('restore'),
        emptyBytes: Buffer.alloc(0),
        date: new Date('2026-01-01'),
      },
    });
    const archive = createRecoveryExport(snapshot, target);
    const restored = readRecoveryExport(JSON.parse(JSON.stringify(archive)));
    expect(hash(restored)).toBe(hash(snapshot));
    expect(() => readRecoveryExport({ ...archive, sha256: 'f'.repeat(64) })).toThrow(
      'archive/hash'
    );
  });
  it('blocks unknown retained payments and checks actual FKs nested inside audit', () => {
    expect(
      plan({
        'guest_confirmation_reconciliation_work/payment_live_old': {
          paymentId: 'payment_live_old',
          subjectPath: 'bookings/live_old',
          fingerprint: 'old',
          generation: 1,
          status: 'complete',
          nextAttemptAtMs: 0,
          attempts: 0,
          leaseToken: null,
          leaseUntilMs: 0,
          updatedAtMs: 0,
        },
      }).manifest.blockers.length
    ).toBeGreaterThan(0);
    expect(
      plan({
        'payments/orphan': { dataScope: 'live', totallyUnknownShape: true },
      }).manifest.blockers.join()
    ).toContain('Unclassified retained LIVE activity');
    expect(
      plan({ 'settings/fk': { audit: { bookingId: 'live_old' } } }).manifest.blockers.join()
    ).toContain('Retained orphan reference');
  });
  it('finds Booking references embedded in a logged JSON payload', () => {
    const source = liveFixtureData()['error_logs/err_unrelated'];
    const { manifest } = plan({
      'error_logs/embedded': { ...source, id: 'embedded', message: '{"bookingId":"live_old"}' },
    });
    expect(manifest.blockers).toEqual([]);
    expect(
      manifest.actions.some(
        (a: { path: string; kind: string }) =>
          a.path === 'error_logs/embedded' && a.kind === 'delete'
      )
    ).toBe(true);
  });
  it('does not infer log ownership from an ID prefix or another entity ID', () => {
    const source = liveFixtureData()['error_logs/err_unrelated'];
    const { manifest } = plan({
      'error_logs/other_id': {
        ...source,
        id: 'other_id',
        message: 'live_old_copy live_oldest live_old.other',
      },
    });
    expect(manifest.blockers).toEqual([]);
    expect(manifest.actions.some((a: { path: string }) => a.path === 'error_logs/other_id')).toBe(
      false
    );
    expect(
      manifest.fixtureClassification.find((r: { path: string }) => r.path === 'error_logs/other_id')
        .entityReferences
    ).toEqual([]);
  });
  it('preserves configuration guard entries when owner IDs collide across typed namespaces', () => {
    const interval = {
      startsAt: { seconds: 1, nanoseconds: 0 },
      endsAt: { seconds: 2, nanoseconds: 0 },
    };
    const guard = {
      guardId: 'guard_shared',
      dataScope: 'live',
      strategyVersion: 'guard:v2',
      bucketKey: 'bucket',
      resourceKind: 'course',
      resourceId: 'course_keep',
      bucketStartAt: { seconds: 0, nanoseconds: 0 },
      entries: [
        {
          claimId: 'claim_booking',
          ownerKind: 'booking',
          ownerId: 'live_old',
          occurrenceId: 'occ_old',
          interval,
          lifecycleStatus: 'active',
        },
        {
          claimId: 'claim_config',
          ownerKind: 'administrative_block',
          ownerId: 'live_old',
          occurrenceId: 'occ_config',
          interval,
          lifecycleStatus: 'active',
        },
      ],
      revision: 1,
      updatedAt: { seconds: 3, nanoseconds: 0 },
      lastChangedByCommandId: 'command_guard',
      correlationId: 'guard_test',
    };
    guard.bucketKey = resourceClaimGuardBucketKeyFromIdentity({
      strategyVersion: 'guard:v2',
      resourceKind: 'course',
      resourceId: 'course_keep',
      bucketStartSeconds: 0,
    });
    expect(ResourceClaimGuardSchema.safeParse(guard).success).toBe(true);
    const { snapshot, selection } = plan();
    snapshot.rows.push({
      path: 'resource_claim_guards/guard_shared',
      data: guard,
      hash: hash(guard),
      updateTime: '1:0',
    });
    const proof = fixtureOwnership(snapshot, selection, target);
    expect(proof.eligible.has('resource_claim_guards/guard_shared')).toBe(false);
    expect(
      proof.patches.find((p: { path: string }) => p.path === 'resource_claim_guards/guard_shared')
        .set.entries
    ).toEqual([guard.entries[1]]);
  });
  it('activity-reset preserves schema-verified progress and achievements', () => {
    const base = {
      participantId: livePerson,
      dataScope: 'live',
      revision: 1,
      createdAt: { seconds: 1, nanoseconds: 0 },
      updatedAt: { seconds: 1, nanoseconds: 0 },
      audit: {
        createdByCommandId: 'progress_created',
        lastChangedByCommandId: 'progress_updated',
        correlationId: 'progress_test',
      },
    };
    const { manifest } = plan(
      {
        'activity_logs/act_level_fixture': {
          dataScope: 'live',
          actorId: liveAccounts[1],
          userId: liveAccounts[0],
          timestamp: '2026-01-01T00:00:00Z',
          type: 'level_up',
          metadata: {
            oldLevel: 1,
            newLevel: 2,
            pointsDelta: 0,
            skillDeltas: [],
            commentedSkillIds: [],
          },
        },
        [`participant_progress/${livePerson}`]: {
          ...base,
          level: 2,
          skillScores: {},
          skillComments: {},
        },
        [`participant_achievements/${livePerson}`]: { ...base, earned: {} },
      },
      target,
      'activity-reset'
    );
    expect(manifest.blockers).toEqual([]);
    expect(
      manifest.actions.some((a: { path: string }) => a.path === 'activity_logs/act_level_fixture')
    ).toBe(false);
    expect(
      manifest.actions.some(
        (a: { path: string }) =>
          a.path.startsWith('participant_progress/') ||
          a.path.startsWith('participant_achievements/')
      )
    ).toBe(false);
  });
});
