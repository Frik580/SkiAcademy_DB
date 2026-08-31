import { describe, expect, it } from 'vitest';
import {
  evaluateAdminManagementAssignment,
  evaluateAdminManagementRevocation,
  evaluateChangeAccountRole,
  evaluateDisableAccount,
  participantArchiveBlockedByCommitments,
  diagnoseAccountIdentity,
  diagnoseParticipantIdentity,
} from './identityAdministration';
import { AccountIdSchema } from './identifiers';

const actor = AccountIdSchema.parse('account_identity_policy_actor');
const target = AccountIdSchema.parse('account_identity_policy_target');

describe('T32.8A identity administration policy', () => {
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

  it('protects system owner from disable', () => {
    expect(evaluateDisableAccount({ targetSystemRole: 'owner' })).toBe('system_owner_protected');
    expect(evaluateDisableAccount({ targetSystemRole: undefined })).toBe('allowed');
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
