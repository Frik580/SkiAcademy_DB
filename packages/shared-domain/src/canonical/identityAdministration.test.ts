import { describe, expect, it } from 'vitest';
import {
  evaluateAdminManagementAssignment,
  evaluateAdminManagementRevocation,
  evaluateChangeAccountRole,
  evaluateDisableAccount,
  evaluateReactivateInstructorCatalog,
  instructorUnlinkBlockedByFutureCommitments,
  parseInstructorCatalogRevision,
  participantArchiveBlockedByCommitments,
  diagnoseAccountIdentity,
  diagnoseParticipantIdentity,
} from './identityAdministration';
import { AccountIdSchema, CorrelationIdSchema } from './identifiers';
import { AggregateRevisionSchema, timestampFromDate } from './primitives';
import { assertExpectedRevision, readAggregateRevision } from './revisionConcurrency';

const actor = AccountIdSchema.parse('account_identity_policy_actor');
const target = AccountIdSchema.parse('account_identity_policy_target');
const correlationId = CorrelationIdSchema.parse('correlation_instructor_revision_matrix_01');

describe('T32.8A identity administration policy', () => {
  it('preserves authoritative instructor catalog revision 0 and treats missing as 0', () => {
    expect(parseInstructorCatalogRevision({ revision: 0 })).toBe(0);
    expect(parseInstructorCatalogRevision({ revision: 1 })).toBe(1);
    expect(parseInstructorCatalogRevision({ revision: 7 })).toBe(7);
    expect(parseInstructorCatalogRevision({})).toBe(0);
    expect(parseInstructorCatalogRevision(undefined)).toBe(0);
    expect(parseInstructorCatalogRevision({ revision: -1 })).toBe(0);
    expect(parseInstructorCatalogRevision({ revision: 1.5 })).toBe(0);
    expect(parseInstructorCatalogRevision({ revision: '0' })).toBe(0);
  });

  it('keeps presentation and command revision authority aligned for legacy catalog shapes', () => {
    const matrix: Array<{
      raw: Record<string, unknown> | undefined;
      expected: number;
      commandCurrent: number | undefined;
      assertWithPresentation: 'pass' | 'stale';
    }> = [
      { raw: {}, expected: 0, commandCurrent: 0, assertWithPresentation: 'pass' },
      { raw: { revision: 0 }, expected: 0, commandCurrent: 0, assertWithPresentation: 'pass' },
      { raw: { revision: 1 }, expected: 1, commandCurrent: 1, assertWithPresentation: 'pass' },
      { raw: { revision: -1 }, expected: 0, commandCurrent: undefined, assertWithPresentation: 'stale' },
      { raw: { revision: '0' }, expected: 0, commandCurrent: undefined, assertWithPresentation: 'stale' },
      { raw: undefined, expected: 0, commandCurrent: undefined, assertWithPresentation: 'stale' },
    ];

    for (const row of matrix) {
      const presentation = parseInstructorCatalogRevision(row.raw);
      const command = readAggregateRevision(row.raw);
      expect(presentation).toBe(row.expected);
      expect(command).toBe(row.commandCurrent);

      if (row.assertWithPresentation === 'pass') {
        expect(() =>
          assertExpectedRevision({
            correlationId,
            expectedRevision: AggregateRevisionSchema.parse(presentation),
            currentRevision: command,
            requireExpectedRevision: true,
          })
        ).not.toThrow();
      } else {
        try {
          assertExpectedRevision({
            correlationId,
            expectedRevision: AggregateRevisionSchema.parse(presentation),
            currentRevision: command,
            requireExpectedRevision: true,
          });
          throw new Error(`expected stale_version for ${JSON.stringify(row.raw)}`);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as { code?: string }).code).toBe('stale_version');
        }
      }
    }

    // Supported legacy states used by production Instructor documents:
    // missing field and explicit 0 must share the same authoritative revision.
    expect(parseInstructorCatalogRevision({})).toBe(readAggregateRevision({}));
    expect(parseInstructorCatalogRevision({ revision: 0 })).toBe(
      readAggregateRevision({ revision: 0 })
    );
  });

  it('lets only system owner change non-owner Account roles and never self-demote', () => {
    expect(
      evaluateChangeAccountRole({
        actorSystemRole: 'owner',
        actorAccountId: actor,
        targetAccountId: target,
        targetSystemRole: undefined,
        nextRole: 'admin',
      })
    ).toBe('allowed');
    expect(
      evaluateChangeAccountRole({
        actorSystemRole: undefined,
        actorAccountId: actor,
        targetAccountId: target,
        targetSystemRole: undefined,
        nextRole: 'admin',
      })
    ).toBe('actor_not_owner');
    expect(
      evaluateChangeAccountRole({
        actorSystemRole: 'owner',
        actorAccountId: actor,
        targetAccountId: target,
        targetSystemRole: 'owner',
        nextRole: 'user',
      })
    ).toBe('target_is_owner');
    expect(
      evaluateChangeAccountRole({
        actorSystemRole: 'owner',
        actorAccountId: actor,
        targetAccountId: actor,
        targetSystemRole: undefined,
        nextRole: 'user',
      })
    ).toBe('self_demotion_forbidden');
  });

  it('protects system owner from disable and active linked instructors', () => {
    expect(evaluateDisableAccount({ targetSystemRole: 'owner' })).toBe('system_owner_protected');
    expect(evaluateDisableAccount({ targetSystemRole: undefined })).toBe('allowed');
    expect(
      evaluateDisableAccount({
        targetSystemRole: undefined,
        linkedInstructorAvailable: true,
      })
    ).toBe('active_instructor_linked');
    expect(
      evaluateDisableAccount({
        targetSystemRole: undefined,
        linkedInstructorAvailable: false,
      })
    ).toBe('allowed');
  });

  it('blocks instructor reactivation while linked Account is disabled', () => {
    expect(evaluateReactivateInstructorCatalog({})).toBe('allowed');
    expect(evaluateReactivateInstructorCatalog({ linkedAccountLifecycle: 'active' })).toBe(
      'allowed'
    );
    expect(evaluateReactivateInstructorCatalog({ linkedAccountLifecycle: 'disabled' })).toBe(
      'linked_account_disabled'
    );
  });

  it('blocks instructor unlink on outstanding non-terminal commitments', () => {
    const now = timestampFromDate(new Date('2026-02-01T00:00:00.000Z'));
    const future = timestampFromDate(new Date('2026-02-10T00:00:00.000Z'));
    const past = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
    expect(
      instructorUnlinkBlockedByFutureCommitments({
        bookings: [
          {
            lifecycle: { status: 'confirmed' },
            occurrence: { interval: { startsAt: future, endsAt: future } },
          },
        ],
        courseDays: [],
        now,
        bookingScanCapped: false,
        courseDayScanCapped: false,
      })
    ).toBe(true);
    expect(
      instructorUnlinkBlockedByFutureCommitments({
        bookings: [
          {
            lifecycle: { status: 'completed' },
            occurrence: { interval: { startsAt: past, endsAt: past } },
          },
        ],
        courseDays: [],
        now,
        bookingScanCapped: false,
        courseDayScanCapped: false,
      })
    ).toBe(false);
    expect(
      instructorUnlinkBlockedByFutureCommitments({
        bookings: [],
        courseDays: [{ interval: { startsAt: future, endsAt: future } }],
        now,
        bookingScanCapped: false,
        courseDayScanCapped: false,
      })
    ).toBe(true);
  });

  it('assigns unmanaged guests to an explicit active Account and never transfers managed ones', () => {
    expect(
      evaluateAdminManagementAssignment({
        participantManagementKind: 'unmanaged_guest',
        targetAccountId: target,
        targetAccountActive: true,
      })
    ).toBe('allowed');
    expect(
      evaluateAdminManagementAssignment({
        participantManagementKind: 'managed',
        targetAccountId: target,
        targetAccountActive: true,
      })
    ).toBe('already_managed');
    expect(
      evaluateAdminManagementAssignment({
        participantManagementKind: 'unmanaged_guest',
        initialManagementEligibleAccountId: actor,
        targetAccountId: target,
        targetAccountActive: true,
      })
    ).toBe('eligible_account_mismatch');
    expect(
      evaluateAdminManagementAssignment({
        participantManagementKind: 'unmanaged_guest',
        targetAccountId: target,
        targetAccountActive: false,
      })
    ).toBe('target_inactive');
  });

  it('forbids Admin revocation of self management', () => {
    expect(evaluateAdminManagementRevocation({ authority: 'self' })).toBe(
      'self_management_forbidden'
    );
    expect(evaluateAdminManagementRevocation({ authority: 'parent_guardian' })).toBe('allowed');
  });

  it('fails closed on archive when commitments exist or the scan is capped', () => {
    expect(
      participantArchiveBlockedByCommitments({
        bookings: [{ lifecycle: { status: 'confirmed' } }],
        enrollments: [],
        bookingScanCapped: false,
        enrollmentScanCapped: false,
      })
    ).toBe(true);
    expect(
      participantArchiveBlockedByCommitments({
        bookings: [{ lifecycle: { status: 'cancelled' } }],
        enrollments: [{ lifecycle: { status: 'withdrawn' } }],
        bookingScanCapped: false,
        enrollmentScanCapped: false,
      })
    ).toBe(false);
    expect(
      participantArchiveBlockedByCommitments({
        bookings: [],
        enrollments: [],
        bookingScanCapped: true,
        enrollmentScanCapped: false,
      })
    ).toBe(true);
    expect(
      participantArchiveBlockedByCommitments({
        bookings: [],
        enrollments: [],
        bookingScanCapped: false,
        enrollmentScanCapped: false,
        unparsedCommitmentCount: 1,
      })
    ).toBe(true);
  });

  it('offers only uniquely determined safe repairs', () => {
    const missingSelf = diagnoseAccountIdentity({
      profileExists: true,
      activeSelfManagementCount: 0,
      activeManagementCount: 0,
      ownerGuardPresent: false,
      ownerGuardMatchesUniqueSelf: false,
      instructorCatalogExists: true,
    });
    expect(missingSelf.some((item) => item.safeRepairKind === 'provision_self_participant_for_account')).toBe(
      true
    );
    const conflict = diagnoseAccountIdentity({
      profileExists: true,
      activeSelfManagementCount: 2,
      activeManagementCount: 2,
      ownerGuardPresent: false,
      ownerGuardMatchesUniqueSelf: false,
      instructorCatalogExists: true,
    });
    expect(conflict.some((item) => item.safeRepairAvailable)).toBe(false);
    const uniqueGuard = diagnoseParticipantIdentity({
      participantId: 'participant_identity_policy_01',
      managementKind: 'managed',
      activeManagementCount: 1,
      ownerGuardPresent: false,
      ownerGuardMatchesUniqueOwner: false,
    });
    expect(
      uniqueGuard.some((item) => item.safeRepairKind === 'repair_participant_management_owner_guard')
    ).toBe(true);
  });
});
