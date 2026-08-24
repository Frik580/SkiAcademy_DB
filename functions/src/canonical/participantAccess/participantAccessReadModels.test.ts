import { describe, expect, it } from 'vitest';
import { AccountIdSchema, InstructorIdSchema, timestampFromDate } from '@ski-academy/shared-domain';
import { canonicalParticipantAccessFixtures } from '@ski-academy/shared-domain/testing';
import {
  buildAccountParticipantReadModel,
  buildInstructorParticipantReadModel,
} from './participantAccessReadModels';

const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

describe('participant access read models', () => {
  it('returns participant data only when account management access is authorized', () => {
    const result = buildAccountParticipantReadModel({
      topology: canonicalParticipantAccessFixtures.unblockedTopology,
      accountId: AccountIdSchema.parse('account_access_fixture'),
      participant: canonicalParticipantAccessFixtures.participant,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.participant.participantId).toBe(
        canonicalParticipantAccessFixtures.participant.participantId
      );
      expect(result.access.authority).toBe('parent_guardian');
    }
  });

  it('denies unauthorized account lookup', () => {
    const result = buildAccountParticipantReadModel({
      topology: canonicalParticipantAccessFixtures.unblockedTopology,
      accountId: AccountIdSchema.parse('account_unauthorized'),
      participant: canonicalParticipantAccessFixtures.participant,
    });

    expect(result).toEqual({ allowed: false, reason: 'unauthorized' });
  });

  it('returns sanitized participant data only when instructor access is authorized', () => {
    const result = buildInstructorParticipantReadModel({
      topology: canonicalParticipantAccessFixtures.unblockedTopology,
      instructorId: InstructorIdSchema.parse('instructor_access_fixture'),
      participant: canonicalParticipantAccessFixtures.participant,
      at: decidedAt,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.participant.participantId).toBe(
        canonicalParticipantAccessFixtures.participant.participantId
      );
      expect(result.participant).not.toHaveProperty('revision');
      expect(result.access.scope).toBe('relationship');
    }
  });

  it('denies unauthorized instructor lookup', () => {
    const result = buildInstructorParticipantReadModel({
      topology: canonicalParticipantAccessFixtures.unblockedTopology,
      instructorId: InstructorIdSchema.parse('instructor_unauthorized'),
      participant: canonicalParticipantAccessFixtures.participant,
      at: decidedAt,
    });

    expect(result).toEqual({ allowed: false, reason: 'unauthorized' });
  });

  it('denies general access when an active block exists', () => {
    const result = buildInstructorParticipantReadModel({
      topology: canonicalParticipantAccessFixtures.blockedTopology,
      instructorId: InstructorIdSchema.parse('instructor_access_fixture'),
      participant: canonicalParticipantAccessFixtures.participant,
      at: decidedAt,
    });

    expect(result).toEqual({ allowed: false, reason: 'blocked' });
  });
});
