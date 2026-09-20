import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  CanonicalExecutionScopeSchema,
  CommandIdSchema,
  DataScopeSchema,
  ParticipantIdSchema,
  TestActorAssignmentSchema,
  TestActorSchema,
  TestSessionIdSchema,
  TestSessionMembershipSchema,
  TestSessionSchema,
  TEST_SESSION_STATUSES,
  assertTestSessionActivationAllowed,
  canonicalPaths,
  isTestSessionMembershipForPath,
  timestampFromDate,
} from './index';

const at = timestampFromDate(new Date('2026-09-20T00:00:00.000Z'));
const accountId = AccountIdSchema.parse('account_test_actor_01');
const otherAccountId = AccountIdSchema.parse('account_test_actor_02');
const participantId = ParticipantIdSchema.parse('participant_test_actor_01');
const testSessionId = TestSessionIdSchema.parse('test_session_01');
const commandId = CommandIdSchema.parse('command_test_session_01');
const audit = {
  createdByCommandId: commandId,
  lastChangedByCommandId: commandId,
  correlationId: 'correlation_test_session_01',
};

function session(status: (typeof TEST_SESSION_STATUSES)[number]) {
  return {
    testSessionId,
    schemaVersion: 1,
    status,
    label: 'T42 session',
    createdByAccountId: accountId,
    config: { startingBalanceKzt: 0, clonedCourseIds: [] },
    inventoryRevision: 0,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit,
  };
}

describe('Canonical Test Session domain', () => {
  it('accepts only live and test DataScope values', () => {
    expect(DataScopeSchema.parse('live')).toBe('live');
    expect(DataScopeSchema.parse('test')).toBe('test');
    expect(DataScopeSchema.safeParse('staging').success).toBe(false);
  });

  it('enforces the discriminated CanonicalExecutionScope contract', () => {
    expect(CanonicalExecutionScopeSchema.safeParse({ dataScope: 'live' }).success).toBe(true);
    expect(
      CanonicalExecutionScopeSchema.safeParse({ dataScope: 'live', testSessionId }).success
    ).toBe(false);
    expect(CanonicalExecutionScopeSchema.safeParse({ dataScope: 'test' }).success).toBe(false);
    expect(
      CanonicalExecutionScopeSchema.safeParse({ dataScope: 'test', testSessionId }).success
    ).toBe(true);
  });

  it.each(TEST_SESSION_STATUSES)('parses TestSession status %s', (status) => {
    expect(TestSessionSchema.safeParse(session(status)).success).toBe(true);
  });

  it('rejects unsafe or unprefixed TestSession IDs', () => {
    expect(TestSessionIdSchema.safeParse('session_01').success).toBe(false);
    expect(TestSessionIdSchema.safeParse('test_bad/path').success).toBe(false);
  });

  it('requires registry-backed TestActor dataScope to be test', () => {
    const actor = {
      accountId,
      participantIds: [participantId],
      kind: 'test_parent',
      allowed: true,
      dataScope: 'test',
      revision: 1,
      createdAt: at,
      updatedAt: at,
      audit,
    };
    expect(TestActorSchema.safeParse(actor).success).toBe(true);
    expect(TestActorSchema.safeParse({ ...actor, dataScope: 'live' }).success).toBe(false);
  });

  it('validates nullable assignment session IDs', () => {
    const assignment = {
      accountId,
      activeTestSessionId: testSessionId,
      revision: 1,
      updatedAt: at,
      audit,
    };
    expect(TestActorAssignmentSchema.safeParse(assignment).success).toBe(true);
    expect(
      TestActorAssignmentSchema.safeParse({ ...assignment, activeTestSessionId: null }).success
    ).toBe(true);
    expect(
      TestActorAssignmentSchema.safeParse({ ...assignment, activeTestSessionId: 'bad/session' })
        .success
    ).toBe(false);
  });

  it('validates membership identity and its canonical path relation', () => {
    const membership = TestSessionMembershipSchema.parse({
      testSessionId,
      accountId,
      boundAt: at,
      boundByCommandId: commandId,
      revision: 1,
      audit,
    });
    expect(isTestSessionMembershipForPath(membership, testSessionId, accountId)).toBe(true);
    expect(isTestSessionMembershipForPath(membership, testSessionId, otherAccountId)).toBe(false);
    expect(canonicalPaths.testSessionMember(testSessionId, accountId)).toBe(
      `/test_sessions/${testSessionId}/membership/${accountId}`
    );
  });

  it('enforces the v1 active-session limit while ignoring non-active statuses', () => {
    expect(() => assertTestSessionActivationAllowed([])).not.toThrow();
    expect(() =>
      assertTestSessionActivationAllowed(['closed', 'failed', 'deleting'])
    ).not.toThrow();
    expect(() => assertTestSessionActivationAllowed(['provisioning'])).not.toThrow();
    expect(() => assertTestSessionActivationAllowed(['active'])).toThrow(
      expect.objectContaining({ code: 'TEST_SESSION_ACTIVE_LIMIT' })
    );
  });
});
