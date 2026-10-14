import { describe, expect, it } from 'vitest';
import {
  calculateParticipantStage,
  reviewParticipantQualifications,
  LevelOperationSchema,
} from './participantLevelProgression';
import { ParticipantProgressSchema } from './participantProgress';

const config = {
  passPercentage: 80,
  items: [
    { id: 'beginner', levelTarget: 1, maxPoints: 100 },
    { id: 'carve', levelTarget: 2, maxPoints: 150 },
    { id: 'performance', levelTarget: 3, maxPoints: 100 },
  ],
};
describe('participant mastery stage', () => {
  it('counts only factual current-stage scores, retaining total historical evidence', () => {
    const scores = { beginner: 100, carve: 120, performance: 10, unknown: 100 };
    expect(calculateParticipantStage(3, scores, config)).toMatchObject({
      earned: 10,
      maximum: 100,
      required: 80,
      ready: false,
      nextLevel: 4,
    });
    expect(scores).toEqual({ beginner: 100, carve: 120, performance: 10, unknown: 100 });
    expect(calculateParticipantStage(2, scores, config)).toMatchObject({
      earned: 120,
      ready: true,
    });
  });
  it('manual qualification does not fill previous stages or the current stage', () => {
    expect(calculateParticipantStage(3, {}, config)).toMatchObject({
      earned: 0,
      evaluated: 0,
      ready: false,
      ratio: 0,
    });
    expect(calculateParticipantStage(1, {}, config).earned).toBe(0);
  });
  it('distinguishes an unevaluated score from a factual zero', () => {
    expect(calculateParticipantStage(1, {}, config).evaluated).toBe(0);
    expect(calculateParticipantStage(1, { beginner: 0 }, config).evaluated).toBe(1);
  });
  it('uses configurable thresholds rounded up and never promotes an empty curriculum', () => {
    const custom = { passPercentage: 81, items: [{ id: 'a', levelTarget: 1, maxPoints: 3 }] };
    expect(calculateParticipantStage(1, { a: 2 }, custom)).toMatchObject({
      required: 3,
      ready: false,
    });
    expect(calculateParticipantStage(1, { a: 3 }, custom).ready).toBe(true);
    expect(calculateParticipantStage(1, {}, { passPercentage: 80, items: [] }).ready).toBe(false);
  });
  it('has no next stage at Expert and clamps legacy out-of-range scores for display', () => {
    expect(calculateParticipantStage(4, { performance: 100 }, config)).toMatchObject({
      earned: 0,
      maximum: 0,
      ready: false,
      isMax: true,
      nextLevel: undefined,
    });
    expect(calculateParticipantStage(1, { beginner: 999 }, config).earned).toBe(100);
  });
  it('old progress documents remain valid without a level state', () => {
    expect(
      ParticipantProgressSchema.safeParse({
        participantId: 'participant_old',
        level: 3,
        skillScores: {},
        skillComments: {},
        revision: 1,
        createdAt: { seconds: 1, nanoseconds: 0 },
        updatedAt: { seconds: 1, nanoseconds: 0 },
        audit: {
          createdByCommandId: 'command_old',
          lastChangedByCommandId: 'command_old',
          correlationId: 'correlation_old',
        },
      }).success
    ).toBe(true);
    expect(reviewParticipantQualifications(undefined, {}, config)).toBeUndefined();
  });
  it('validates bounded mandatory reasons and level identifiers', () => {
    expect(
      LevelOperationSchema.safeParse({
        action: 'assign',
        level: 5,
        reason: { category: 'other', text: 'x' },
      }).success
    ).toBe(false);
    expect(
      LevelOperationSchema.safeParse({
        action: 'assign',
        level: 3,
        reason: { category: 'other', text: ' ' },
      }).success
    ).toBe(false);
  });
});
