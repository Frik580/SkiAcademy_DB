import { describe, expect, it } from 'vitest';
import { formatLessonBookingParticipantLine } from '../../src/features/lesson-bookings/lessonBookingParticipantPresentation';

const LABELS = {
  participantLabel: 'Участник',
  participantsLabel: 'Участники',
} as const;

describe('formatLessonBookingParticipantLine', () => {
  it('formats a single self participant booking', () => {
    expect(
      formatLessonBookingParticipantLine({
        ...LABELS,
        participantNames: ['Ксюша'],
      })
    ).toBe('Участник: Ксюша');
  });

  it('formats a single dependent participant booking', () => {
    expect(
      formatLessonBookingParticipantLine({
        ...LABELS,
        participantNames: ['Маша'],
      })
    ).toBe('Участник: Маша');
  });

  it('formats multiple participants as a comma-separated list', () => {
    expect(
      formatLessonBookingParticipantLine({
        ...LABELS,
        participantNames: ['Ксюша', 'Маша'],
      })
    ).toBe('Участники: Ксюша, Маша');
  });

  it('falls back to the singular label when display names are missing', () => {
    expect(
      formatLessonBookingParticipantLine({
        ...LABELS,
        participantNames: [],
      })
    ).toBe('Участник');
    expect(
      formatLessonBookingParticipantLine({
        ...LABELS,
        participantNames: ['', '   '],
      })
    ).toBe('Участник');
  });

  it('distinguishes production-like self and dependent smoke cases by name', () => {
    const selfLine = formatLessonBookingParticipantLine({
      ...LABELS,
      participantNames: ['Ксюша'],
    });
    const dependentLine = formatLessonBookingParticipantLine({
      ...LABELS,
      participantNames: ['Маша'],
    });

    expect(selfLine).not.toBe(dependentLine);
    expect(selfLine).toBe('Участник: Ксюша');
    expect(dependentLine).toBe('Участник: Маша');
  });
});
