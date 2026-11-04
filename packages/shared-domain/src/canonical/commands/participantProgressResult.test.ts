import { describe, expect, it } from 'vitest';
import { parseCommandResultPayload } from './commandResultPayloads';

describe('participant progress command result', () => {
  it('accepts the canonical runtime people revision after an instructor saves ratings', () => {
    expect(
      parseCommandResultPayload('update_participant_progress', {
        participantId: 'participant_progress_result',
        revision: 2,
        adminPeopleRevision: 4,
      }).success
    ).toBe(true);
  });

  it('keeps accepting results without revision metadata and rejects malformed metadata', () => {
    const result = { participantId: 'participant_progress_result', revision: 2 };
    expect(parseCommandResultPayload('update_participant_progress', result).success).toBe(true);
    expect(
      parseCommandResultPayload('update_participant_progress', {
        ...result,
        adminPeopleRevision: -1,
      }).success
    ).toBe(false);
  });
});
