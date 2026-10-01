import { describe, expect, it } from 'vitest';
import { QueryParticipantOccupancyReadModelsInputSchema } from '@ski-academy/shared-domain';

describe('QueryParticipantOccupancyReadModelsInputSchema', () => {
  it('accepts account_participant_day with up to eight participant ids', () => {
    const parsed = QueryParticipantOccupancyReadModelsInputSchema.safeParse({
      scope: 'account_participant_day',
      participantIds: ['participant_occupancy_a', 'participant_occupancy_b'],
      localDate: '2026-10-03',
      timeZone: 'Asia/Qyzylorda',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects empty participantIds', () => {
    const parsed = QueryParticipantOccupancyReadModelsInputSchema.safeParse({
      scope: 'account_participant_day',
      participantIds: [],
      localDate: '2026-10-03',
      timeZone: 'Asia/Qyzylorda',
    });
    expect(parsed.success).toBe(false);
  });
});
