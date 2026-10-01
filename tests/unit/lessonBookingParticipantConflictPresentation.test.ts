import { describe, expect, it } from 'vitest';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';
import { presentCanonicalCommandErrorWithContext } from '../../src/features/lesson-bookings/presentCanonicalCommandError';
import {
  formatParticipantBookingConflictMessage,
  participantConflictIdsFromDetails,
} from '../../src/features/lesson-bookings/lessonBookingParticipantPresentation';

describe('participant booking conflict presentation', () => {
  it('reads participantIds from canonical error details', () => {
    expect(
      participantConflictIdsFromDetails({
        reason: 'conflict',
        resourceKind: 'participant',
        participantIds: ['participant_conflict_a', 'participant_conflict_b'],
      })
    ).toEqual(['participant_conflict_a', 'participant_conflict_b']);
  });

  it('formats a single participant conflict with display name', () => {
    const message = formatParticipantBookingConflictMessage({
      participantIds: ['participant_conflict_one'],
      resolveDisplayName: (id) => (id === 'participant_conflict_one' ? 'Arseniy' : undefined),
      t: (key, ...args) => `${key}:${JSON.stringify(args[0] ?? {})}`,
    });
    expect(message).toContain('Arseniy');
  });

  it('maps participant_conflict through presentCanonicalCommandErrorWithContext', () => {
    const presented = presentCanonicalCommandErrorWithContext(
      new CanonicalCommandClientError('participant_conflict', {
        correlationId: 'correlation_participant_busy',
        details: {
          reason: 'conflict',
          resourceKind: 'participant',
          participantIds: ['participant_conflict_one'],
        },
      }),
      {
        t: (key, ...args) =>
          key === 'bookingParticipantTimeConflict'
            ? `busy:${(args[0] as { name: string }).name}`
            : key,
        resolveParticipantDisplayName: (id) =>
          id === 'participant_conflict_one' ? 'Arseniy' : undefined,
      }
    );
    expect(presented.correlationId).toBe('correlation_participant_busy');
    expect(presented.shouldRefresh).toBe(true);
    expect(presented.message).toBe('busy:Arseniy');
  });
});
