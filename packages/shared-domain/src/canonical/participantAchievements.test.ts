import { describe, expect, it } from 'vitest';
import { parseCommandIntent } from './commands/commandIntents';
import {
  FORBIDDEN_PARTICIPANT_ACHIEVEMENT_IDS,
  COURSE_GRADUATE_ACHIEVEMENT_ID,
  ParticipantAchievementsSchema,
  RecordParticipantAchievementsIntentSchema,
  courseGraduateAchievementTargetFromEnrollment,
  emptyParticipantAchievementsProjection,
  timestampFromDate,
} from './index';
import { deriveRecordParticipantAchievementsIdempotencyKey } from './participantAchievementCommandIdempotency';
import {
  emptyParticipantAchievementsReadModel,
  rejectSpoofedParticipantAchievementsReadInput,
} from './readModels/participantAchievementsReadModel';

const participantId = 'participant_achievements_contract_01';
const earnedAt = timestampFromDate(new Date('2026-01-10T12:00:00.000Z'));

const validIntent = {
  participantId,
  earned: [
    {
      achievementId: 'first_lesson',
      earnedAt,
      source: 'participant_attendance' as const,
    },
  ],
};

describe('canonical participant achievements contract', () => {
  it('requires participantId and rejects account-level spoof fields', () => {
    expect(parseCommandIntent('record_participant_achievements', validIntent).success).toBe(true);
    expect(
      parseCommandIntent('record_participant_achievements', {
        earned: validIntent.earned,
      }).success
    ).toBe(false);
    expect(
      parseCommandIntent('record_participant_achievements', {
        ...validIntent,
        accountId: 'account_achievements_spoof',
      }).success
    ).toBe(false);
  });

  it('rejects account-level achievement ids from Participant persistence', () => {
    for (const achievementId of FORBIDDEN_PARTICIPANT_ACHIEVEMENT_IDS) {
      expect(
        RecordParticipantAchievementsIntentSchema.safeParse({
          participantId,
          earned: [{ achievementId, earnedAt, source: 'participant_attendance' }],
        }).success
      ).toBe(false);
    }
  });

  it('rejects client recording of server-issued course_graduate', () => {
    expect(
      RecordParticipantAchievementsIntentSchema.safeParse({
        participantId,
        earned: [
          {
            achievementId: COURSE_GRADUATE_ACHIEVEMENT_ID,
            earnedAt,
            source: 'course_completion',
          },
        ],
      }).success
    ).toBe(false);
  });

  it('rejects duplicate achievement ids in one command', () => {
    expect(
      RecordParticipantAchievementsIntentSchema.safeParse({
        participantId,
        earned: [
          validIntent.earned[0],
          { ...validIntent.earned[0], source: 'participant_progress' },
        ],
      }).success
    ).toBe(false);
  });

  it('33. idempotency keys are deterministic per participant, revision, and ids', () => {
    const keyA = deriveRecordParticipantAchievementsIdempotencyKey(participantId as never, 0, [
      { achievementId: 'first_lesson' },
    ]);
    const keyB = deriveRecordParticipantAchievementsIdempotencyKey(participantId as never, 0, [
      { achievementId: 'first_lesson' },
    ]);
    const otherRevision = deriveRecordParticipantAchievementsIdempotencyKey(
      participantId as never,
      1,
      [{ achievementId: 'first_lesson' }]
    );
    const otherParticipant = deriveRecordParticipantAchievementsIdempotencyKey(
      'participant_achievements_contract_02' as never,
      0,
      [{ achievementId: 'first_lesson' }]
    );
    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(otherRevision);
    expect(keyA).not.toBe(otherParticipant);
  });

  it('rejects spoofed read-model account fields and missing docs are empty', () => {
    expect(() =>
      rejectSpoofedParticipantAchievementsReadInput({ scope: 'managed', accountId: 'x' })
    ).toThrow(/accountId/);
    const empty = emptyParticipantAchievementsReadModel(participantId as never);
    expect(empty).toMatchObject({ participantId, earned: {}, revision: 0 });
    expect(emptyParticipantAchievementsProjection(participantId as never).revision).toBe(0);
  });

  it('rejects storing account-level feedback_given on the aggregate', () => {
    expect(
      ParticipantAchievementsSchema.safeParse({
        participantId,
        earned: {
          feedback_given: { earnedAt, source: 'participant_attendance' },
        },
        revision: 1,
        createdAt: earnedAt,
        updatedAt: earnedAt,
        audit: {
          createdByCommandId: 'command_ach_1',
          lastChangedByCommandId: 'command_ach_1',
          correlationId: 'correlation_ach_1',
        },
      }).success
    ).toBe(false);
  });

  it('accepts only canonical course_completion source for persisted course_graduate', () => {
    const base = {
      participantId,
      revision: 1,
      createdAt: earnedAt,
      updatedAt: earnedAt,
      audit: {
        createdByCommandId: 'command_ach_course_1',
        lastChangedByCommandId: 'command_ach_course_1',
        correlationId: 'correlation_ach_course_1',
      },
    };
    expect(
      ParticipantAchievementsSchema.safeParse({
        ...base,
        earned: {
          course_graduate: { earnedAt, source: 'course_completion' },
        },
      }).success
    ).toBe(true);
    expect(
      ParticipantAchievementsSchema.safeParse({
        ...base,
        earned: {
          course_graduate: { earnedAt, source: 'participant_attendance' },
        },
      }).success
    ).toBe(false);
  });

  it('derives course_graduate only from completed CourseEnrollment lifecycle', () => {
    const base = {
      enrollmentId: 'enrollment_course_graduate_contract_01' as never,
      participantId: participantId as never,
      courseId: 'course_graduate_contract_01' as never,
    };
    expect(
      courseGraduateAchievementTargetFromEnrollment({
        ...base,
        lifecycle: { status: 'confirmed' },
      })
    ).toBeUndefined();
    expect(
      courseGraduateAchievementTargetFromEnrollment({
        ...base,
        lifecycle: { status: 'completed', completedAt: earnedAt },
      })
    ).toEqual({
      achievementId: 'course_graduate',
      enrollmentId: base.enrollmentId,
      participantId: base.participantId,
      courseId: base.courseId,
      earnedAt,
      source: 'course_completion',
    });
  });
});
