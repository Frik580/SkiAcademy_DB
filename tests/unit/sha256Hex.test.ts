import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  activityLogIdFromCommandId,
  canonicalDeterministicHash,
  domainOutboxIdFromCommand,
  monetaryEventIdFromCommandEffect,
  resourceClaimGuardBucketKeyFromIdentity,
  resourceClaimIdFromIdentity,
} from '@ski-academy/shared-domain';
import { sha256Hex } from '../../packages/shared-domain/src/canonical/sha256Hex';

const nodeSha256Hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

const DETERMINISTIC_ID_PART_SEPARATOR = '\u001f';

describe('sha256Hex', () => {
  it('matches known FIPS 180-2 test vectors', () => {
    const vectors: ReadonlyArray<readonly [string, string]> = [
      [
        '',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      ],
      [
        'abc',
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      ],
      [
        'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
      ],
      [
        'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
        'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
      ],
    ];

    for (const [input, expected] of vectors) {
      expect(sha256Hex(input)).toBe(expected);
      expect(sha256Hex(input)).toBe(nodeSha256Hex(input));
    }
  });

  it('matches Node crypto for ASCII, Unicode, and long UTF-8 inputs', () => {
    const inputs = [
      '',
      'audit:v1',
      'command_payment_fixture_01',
      'The quick brown fox jumps over the lazy dog',
      'こんにちは',
      'mañana',
      '🔒 deterministic-id',
      'e\u0301', // combining accent
      'a'.repeat(55),
      'a'.repeat(64),
      'a'.repeat(128),
      'a'.repeat(10_000),
      ['audit:v1', 'command_audit_test_01'].join(DETERMINISTIC_ID_PART_SEPARATOR),
      [
        'claim:v1',
        'instructor_booking_occurrence',
        'instructor',
        'instructor_fixture_01',
        'booking',
        'booking_fixture_01',
        'occurrence_fixture_01',
      ].join(DETERMINISTIC_ID_PART_SEPARATOR),
    ];

    for (const input of inputs) {
      expect(sha256Hex(input)).toBe(nodeSha256Hex(input));
    }
  });

  it('returns lowercase hexadecimal digests', () => {
    const digest = sha256Hex('abc');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(digest.toLowerCase());
  });
});

describe('canonicalDeterministicHash parity with Node crypto', () => {
  it('preserves audit, outbox, and monetary identity hashes', () => {
    const commandId = 'command_audit_test_01';

    const auditPayload = ['audit:v1', commandId].join(DETERMINISTIC_ID_PART_SEPARATOR);
    const outboxPayload = ['outbox:v1', commandId, '0'].join(DETERMINISTIC_ID_PART_SEPARATOR);
    const monetaryPayload = ['monetary:v1', commandId, '0'].join(DETERMINISTIC_ID_PART_SEPARATOR);

    expect(canonicalDeterministicHash(['audit:v1', commandId])).toBe(nodeSha256Hex(auditPayload));
    expect(canonicalDeterministicHash(['outbox:v1', commandId, '0'])).toBe(
      nodeSha256Hex(outboxPayload)
    );
    expect(canonicalDeterministicHash(['monetary:v1', commandId, '0'])).toBe(
      nodeSha256Hex(monetaryPayload)
    );

    expect(activityLogIdFromCommandId(commandId)).toBe(nodeSha256Hex(auditPayload));
    expect(domainOutboxIdFromCommand(commandId, 0)).toBe(nodeSha256Hex(outboxPayload));
    expect(monetaryEventIdFromCommandEffect(commandId, 0)).toBe(nodeSha256Hex(monetaryPayload));
  });

  it('preserves resource claim identity hashes used by fixtures', () => {
    const claimIdentity = {
      strategyVersion: 'claim:v1' as const,
      claimKind: 'instructor_booking_occurrence' as const,
      resourceKind: 'instructor' as const,
      resourceId: 'instructor_fixture_01',
      ownerKind: 'booking' as const,
      ownerId: 'booking_fixture_01',
      occurrenceId: 'occurrence_fixture_01',
    };

    const claimPayload = [
      claimIdentity.strategyVersion,
      claimIdentity.claimKind,
      claimIdentity.resourceKind,
      claimIdentity.resourceId,
      claimIdentity.ownerKind,
      claimIdentity.ownerId,
      claimIdentity.occurrenceId,
    ].join(DETERMINISTIC_ID_PART_SEPARATOR);

    expect(resourceClaimIdFromIdentity(claimIdentity)).toBe(nodeSha256Hex(claimPayload));

    const guardPayload = [
      'guard:v1',
      'instructor',
      'instructor_fixture_01',
      '1736913600',
    ].join(DETERMINISTIC_ID_PART_SEPARATOR);

    expect(
      resourceClaimGuardBucketKeyFromIdentity({
        strategyVersion: 'guard:v1',
        resourceKind: 'instructor',
        resourceId: 'instructor_fixture_01',
        bucketStartSeconds: 1_736_913_600,
      })
    ).toBe(nodeSha256Hex(guardPayload));
  });
});
