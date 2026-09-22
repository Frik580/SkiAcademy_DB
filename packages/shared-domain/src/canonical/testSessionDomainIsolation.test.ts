import { describe, expect, it } from 'vitest';
import { COMMAND_KINDS } from './commands/commandKinds';
import { ParticipantIdSchema, TestSessionIdSchema } from './identifiers';
import { testCanonicalExecutionScope } from './canonicalScope';
import {
  HomeworkTargetError,
  TEST_SESSION_COMMAND_SUPPORT,
  TEST_SESSION_RESOURCE_CLASSIFICATION,
  assertHomeworkTargetsSameScope,
  assertNoHomeworkForUserIds,
  isTestSessionCommandSupported,
  isTestSessionExistingIdentityBootstrap,
  isTestSessionStarterCreditBootstrapNoOp,
  resolveTestSessionCommandSupport,
} from './testSessionDomainIsolation';

const testSessionId = TestSessionIdSchema.parse('test_session_isolation_01');
const otherSessionId = TestSessionIdSchema.parse('test_session_isolation_02');
const partyA = ParticipantIdSchema.parse('participant_hw_01');
const partyB = ParticipantIdSchema.parse('participant_hw_02');
const outsider = ParticipantIdSchema.parse('participant_hw_live');

describe('T42B-3 domain isolation contract', () => {
  it('classifies every command kind without an unknown-means-allowed default', () => {
    for (const kind of COMMAND_KINDS) {
      expect(resolveTestSessionCommandSupport(kind)).toEqual(TEST_SESSION_COMMAND_SUPPORT[kind]);
    }
    expect(Object.keys(TEST_SESSION_COMMAND_SUPPORT).sort()).toEqual([...COMMAND_KINDS].sort());
  });

  it('keeps live settings, starter credit, and LIVE course provisioning forbidden in TEST', () => {
    expect(isTestSessionCommandSupported('update_lesson_pricing_settings')).toBe(false);
    expect(isTestSessionCommandSupported('grant_starter_credit')).toBe(false);
    expect(isTestSessionCommandSupported('provision_canonical_course')).toBe(false);
    expect(isTestSessionCommandSupported('record_audit_correction')).toBe(false);
    expect(isTestSessionCommandSupported('provision_self_participant')).toBe(false);
    expect(isTestSessionExistingIdentityBootstrap('provision_self_participant')).toBe(true);
    expect(isTestSessionExistingIdentityBootstrap('provision_self_participant_for_account')).toBe(
      false
    );
    expect(isTestSessionExistingIdentityBootstrap('create_participant')).toBe(false);
    expect(isTestSessionExistingIdentityBootstrap('grant_starter_credit')).toBe(false);
    expect(isTestSessionStarterCreditBootstrapNoOp('grant_starter_credit')).toBe(true);
    expect(isTestSessionStarterCreditBootstrapNoOp('provision_self_participant')).toBe(false);
    expect(isTestSessionStarterCreditBootstrapNoOp('record_manual_wallet_funding')).toBe(false);
    expect(TEST_SESSION_RESOURCE_CLASSIFICATION.settingsStarterCredit).toBe('FORBIDDEN');
    expect(TEST_SESSION_RESOURCE_CLASSIFICATION.liveCourseCapacity).toBe('FORBIDDEN');
  });

  it('allows same-scope homework targets and rejects LIVE or cross-session participants', () => {
    const scope = testCanonicalExecutionScope(testSessionId);
    expect(() =>
      assertHomeworkTargetsSameScope({
        executionScope: scope,
        bookingPartyParticipantIds: [partyA, partyB],
        targetParticipantIds: [partyA],
        targetParticipantRecords: [
          { participantId: partyA, dataScope: 'test', testSessionId },
        ],
      })
    ).not.toThrow();

    expect(() =>
      assertHomeworkTargetsSameScope({
        executionScope: scope,
        bookingPartyParticipantIds: [partyA],
        targetParticipantIds: [outsider],
        targetParticipantRecords: [{ participantId: outsider, dataScope: 'live' }],
      })
    ).toThrow(expect.objectContaining({ code: 'TARGET_NOT_IN_PARTY' }));

    expect(() =>
      assertHomeworkTargetsSameScope({
        executionScope: scope,
        bookingPartyParticipantIds: [partyA],
        targetParticipantIds: [partyA],
        targetParticipantRecords: [{ participantId: partyA, dataScope: 'live' }],
      })
    ).toThrow(new HomeworkTargetError('CROSS_SCOPE_FORBIDDEN'));

    expect(() =>
      assertHomeworkTargetsSameScope({
        executionScope: scope,
        bookingPartyParticipantIds: [partyA],
        targetParticipantIds: [partyA],
        targetParticipantRecords: [
          { participantId: partyA, dataScope: 'test', testSessionId: otherSessionId },
        ],
      })
    ).toThrow(new HomeworkTargetError('CROSS_SCOPE_FORBIDDEN'));
  });

  it('forbids resurrecting homeworkForUserIds', () => {
    expect(() => assertNoHomeworkForUserIds({ homeworkForParticipantIds: [partyA] })).not.toThrow();
    expect(() => assertNoHomeworkForUserIds({ homeworkForUserIds: ['user_01'] })).toThrow(
      new HomeworkTargetError('HOMEWORK_USER_IDS_FORBIDDEN')
    );
  });
});
