import { describe, expect, it } from 'vitest';
import { parseCommandIntent } from './commands/commandIntents';
import {
  PARTICIPANT_PROGRESS_COMMENT_MAX_LENGTH,
  PARTICIPANT_PROGRESS_SKILL_SCORE_MAX,
  normalizeParticipantProgressSkillComments,
} from './participantProgress';

const validIntent = {
  participantId: 'participant_progress_contract_01',
  level: 2,
  skillScores: { carving: 12 },
  skillComments: { carving: 'Strong edge' },
};

describe('canonical participant progress contract', () => {
  it('requires participantId and rejects account-level fallback fields', () => {
    expect(parseCommandIntent('update_participant_progress', validIntent).success).toBe(true);
    expect(
      parseCommandIntent('update_participant_progress', {
        level: 2,
        skillScores: {},
        skillComments: {},
      }).success
    ).toBe(false);
    expect(
      parseCommandIntent('update_participant_progress', {
        ...validIntent,
        accountId: 'account_progress_spoof',
      }).success
    ).toBe(false);
  });

  it.each([0, 5, 1.5, Number.NaN])('rejects invalid level %s', (level) => {
    expect(
      parseCommandIntent('update_participant_progress', {
        ...validIntent,
        level,
      }).success
    ).toBe(false);
  });

  it.each([-1, PARTICIPANT_PROGRESS_SKILL_SCORE_MAX + 1, 2.5, Number.NaN])(
    'rejects invalid score %s',
    (score) => {
      expect(
        parseCommandIntent('update_participant_progress', {
          ...validIntent,
          skillScores: { carving: score },
        }).success
      ).toBe(false);
    }
  );

  it('rejects empty, oversized, and unsanitary comments', () => {
    expect(normalizeParticipantProgressSkillComments(undefined)).toEqual({});
    expect(normalizeParticipantProgressSkillComments({ carving: '  note  ' })).toEqual({
      carving: 'note',
    });
    expect(normalizeParticipantProgressSkillComments({ carving: '   ' })).toEqual({});
    expect(() =>
      normalizeParticipantProgressSkillComments({
        carving: 'x'.repeat(PARTICIPANT_PROGRESS_COMMENT_MAX_LENGTH + 1),
      })
    ).toThrow();
    expect(
      parseCommandIntent('update_participant_progress', {
        ...validIntent,
        skillComments: { carving: '' },
      }).success
    ).toBe(false);
    expect(
      parseCommandIntent('update_participant_progress', {
        ...validIntent,
        skillComments: { carving: 'x'.repeat(PARTICIPANT_PROGRESS_COMMENT_MAX_LENGTH + 1) },
      }).success
    ).toBe(false);
  });
});
