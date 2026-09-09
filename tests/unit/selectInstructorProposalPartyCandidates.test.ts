import { describe, expect, it } from 'vitest';
import { selectInstructorProposalPartyCandidates } from '../../src/features/booking-collaboration/selectInstructorProposalPartyCandidates';

describe('selectInstructorProposalPartyCandidates', () => {
  const instructorId = 'instructor_party_01';

  it('selects same-account participants with authority and disables seed members without it', () => {
    const candidates = selectInstructorProposalPartyCandidates({
      instructorId,
      seedParticipantIds: ['participant_a', 'participant_b'],
      seedAccountId: 'account_family',
      relationshipStatusByParticipantId: new Map([['participant_a', 'active']]),
      bookings: [
        {
          instructorId,
          participantIds: ['participant_a'],
          lifecycleStatus: 'confirmed',
          participants: [
            { participantId: 'participant_a', label: 'Alice', accountId: 'account_family' },
            { participantId: 'participant_b', label: 'Bob', accountId: 'account_family' },
          ],
        },
      ],
    });

    expect(candidates.map((candidate) => candidate.participantId).sort()).toEqual([
      'participant_a',
      'participant_b',
    ]);
    expect(candidates.find((candidate) => candidate.participantId === 'participant_a')?.selectable).toBe(
      true
    );
    expect(candidates.find((candidate) => candidate.participantId === 'participant_b')).toMatchObject({
      selectable: false,
      disabledReason: 'no_authority',
    });
  });

  it('does not expose another account just because the instructor taught one sibling', () => {
    const candidates = selectInstructorProposalPartyCandidates({
      instructorId,
      seedParticipantIds: ['participant_a'],
      seedAccountId: 'account_family',
      relationshipStatusByParticipantId: new Map([
        ['participant_a', 'active'],
        ['participant_other', 'active'],
      ]),
      bookings: [
        {
          instructorId,
          participantIds: ['participant_a'],
          lifecycleStatus: 'confirmed',
          participants: [
            { participantId: 'participant_a', label: 'Alice', accountId: 'account_family' },
          ],
        },
        {
          instructorId,
          participantIds: ['participant_other'],
          lifecycleStatus: 'confirmed',
          participants: [
            {
              participantId: 'participant_other',
              label: 'Other',
              accountId: 'account_other',
            },
          ],
        },
      ],
    });

    expect(candidates.map((candidate) => candidate.participantId)).toEqual(['participant_a']);
  });
});
