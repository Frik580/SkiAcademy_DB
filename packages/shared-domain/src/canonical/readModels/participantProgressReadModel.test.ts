import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_PARTICIPANT_PROGRESS_READ_INPUT_KEYS,
  QueryParticipantProgressReadModelsInputSchema,
  emptyParticipantProgressReadModel,
  rejectSpoofedParticipantProgressReadInput,
} from './participantProgressReadModel';

describe('participant progress read-model transport', () => {
  it('accepts managed and instructor scopes', () => {
    expect(
      QueryParticipantProgressReadModelsInputSchema.safeParse({ scope: 'managed' }).success
    ).toBe(true);
    expect(
      QueryParticipantProgressReadModelsInputSchema.safeParse({
        scope: 'instructor',
        participantIds: ['participant_progress_read_01'],
      }).success
    ).toBe(true);
  });

  it('requires instructor participantIds and rejects spoof keys', () => {
    expect(
      QueryParticipantProgressReadModelsInputSchema.safeParse({ scope: 'instructor' }).success
    ).toBe(false);
    expect(() =>
      rejectSpoofedParticipantProgressReadInput({
        scope: 'managed',
        accountId: 'account_spoof',
      })
    ).toThrow(/accountId/);
    for (const key of FORBIDDEN_PARTICIPANT_PROGRESS_READ_INPUT_KEYS) {
      expect(() => rejectSpoofedParticipantProgressReadInput({ [key]: 'spoof' })).toThrow();
    }
  });

  it('projects missing docs as empty participant-specific progress', () => {
    expect(emptyParticipantProgressReadModel('participant_progress_read_empty')).toMatchObject({
      participantId: 'participant_progress_read_empty',
      level: 1,
      skillScores: {},
      skillComments: {},
      revision: 0,
    });
  });
});
