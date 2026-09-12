import { describe, expect, it } from 'vitest';
import {
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
  type ParticipantLessonFeedbackReadModel,
  type ParticipantLessonStatsEvidence,
} from '@ski-academy/shared-domain';
import {
  DEFAULT_ACHIEVEMENTS_CONFIG,
  DEFAULT_SKILL_CONFIG,
  evaluateEarnedAchievements,
  isAchievementRuleMet,
  type AchievementEvaluationContext,
} from '../../src/domain/achievements';
import { mergeEvaluatedAndPersistedAchievements } from '../../src/features/participant-achievements/mergeParticipantAchievements';
import { getTodayAchievements } from '../../src/features/student-cabinet/components/student/studentCabinetUtils';
import { readRepoFile } from '../helpers/readRepoFile';

const selfId = ParticipantIdSchema.parse('participant_ach_self');
const childA = ParticipantIdSchema.parse('participant_ach_child_a');
const childB = ParticipantIdSchema.parse('participant_ach_child_b');
const instructorId = InstructorIdSchema.parse('instructor_ach_01');

const scoresForIds = (ids: string[]) =>
  Object.fromEntries(
    ids
      .map((id) => DEFAULT_SKILL_CONFIG.items.find((item) => item.id === id))
      .filter(Boolean)
      .map((item) => [item!.id, item!.maxPoints])
  );

function evidence(input: {
  readonly participantId: typeof selfId | typeof childA | typeof childB;
  readonly attendanceStatus: ParticipantLessonStatsEvidence['attendanceStatus'];
  readonly durationHours: number;
  readonly startsAtIso: string;
  readonly bookingId: string;
  readonly lifecycleStatus?: ParticipantLessonStatsEvidence['lifecycleStatus'];
}): ParticipantLessonStatsEvidence {
  return {
    bookingId: BookingIdSchema.parse(input.bookingId),
    participantId: input.participantId,
    attendanceStatus: input.attendanceStatus,
    durationHours: input.durationHours,
    startsAt: timestampFromDate(new Date(input.startsAtIso)),
    timeZone: 'Asia/Almaty',
    lifecycleStatus: input.lifecycleStatus ?? 'completed',
    servicePartyParticipantIds: [selfId, childA, childB],
    instructorId,
  };
}

function presentLessons(
  participantId: typeof selfId | typeof childA | typeof childB,
  count: number,
  hours = 2
): ParticipantLessonStatsEvidence[] {
  return Array.from({ length: count }, (_, index) =>
    evidence({
      participantId,
      attendanceStatus: 'present',
      durationHours: hours,
      startsAtIso: `2026-01-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      bookingId: `booking_ach_${participantId}_${index + 1}`,
    })
  );
}

function feedback(input: {
  readonly participantId: typeof selfId | typeof childA | typeof childB;
  readonly items: ReadonlyArray<{ itemId: string; text: string; completed: boolean }>;
  readonly suffix?: string;
}): ParticipantLessonFeedbackReadModel {
  return {
    feedbackId: `feedback_ach_${input.participantId}_${input.suffix ?? '01'}`,
    participantId: input.participantId,
    lessonBookingId: BookingIdSchema.parse(`booking_feedback_${input.suffix ?? '01'}`),
    instructorId,
    items: [...input.items],
    revision: 1,
    updatedAt: timestampFromDate(new Date('2026-02-01T12:00:00.000Z')),
  };
}

function ctx(input: {
  readonly participantId?: typeof selfId | typeof childA | typeof childB;
  readonly lessonEvidence?: readonly ParticipantLessonStatsEvidence[];
  readonly level?: number;
  readonly skillScores?: Record<string, number>;
  readonly lessonFeedback?: readonly ParticipantLessonFeedbackReadModel[];
  readonly accountReviews?: { createdAtIso: string }[];
  readonly now?: Date;
}): AchievementEvaluationContext {
  const participantId = input.participantId ?? selfId;
  return {
    participantId,
    lessonEvidence: input.lessonEvidence ?? [],
    progress: {
      participantId,
      level: input.level ?? 1,
      skillScores: input.skillScores ?? {},
    },
    lessonFeedback: input.lessonFeedback ?? [],
    accountReviews: input.accountReviews ?? [],
    skillConfig: DEFAULT_SKILL_CONFIG,
    now: input.now,
  };
}

function earnedIds(evaluation: AchievementEvaluationContext) {
  return evaluateEarnedAchievements(evaluation, DEFAULT_ACHIEVEMENTS_CONFIG).map((item) => item.id);
}

describe('canonical achievement evaluation — lessons', () => {
  it('1. first_lesson: present 1 → earned', () => {
    expect(earnedIds(ctx({ lessonEvidence: presentLessons(selfId, 1) }))).toContain('first_lesson');
  });

  it('2. completed lifecycle + absent → not earned', () => {
    const evaluation = ctx({
      lessonEvidence: [
        evidence({
          participantId: selfId,
          attendanceStatus: 'absent',
          durationHours: 2,
          startsAtIso: '2026-01-10T12:00:00.000Z',
          bookingId: 'booking_ach_absent_01',
          lifecycleStatus: 'completed',
        }),
      ],
    });
    expect(earnedIds(evaluation)).not.toContain('first_lesson');
  });

  it('3. present sibling A → does not earn for B', () => {
    const evaluation = ctx({
      participantId: childB,
      lessonEvidence: presentLessons(childA, 1),
    });
    expect(earnedIds(evaluation)).not.toContain('first_lesson');
  });

  it('4. ten_lessons: exact participant 10 present → earned', () => {
    expect(earnedIds(ctx({ lessonEvidence: presentLessons(selfId, 10) }))).toContain('ten_lessons');
  });

  it('5. 9 present + unrelated sibling lessons → not earned', () => {
    const evaluation = ctx({
      participantId: childA,
      lessonEvidence: [...presentLessons(childA, 9), ...presentLessons(childB, 10)],
    });
    expect(earnedIds(evaluation)).not.toContain('ten_lessons');
    expect(earnedIds(evaluation)).toContain('first_lesson');
  });

  it('6. twenty_hours: only present duration counts', () => {
    expect(earnedIds(ctx({ lessonEvidence: presentLessons(selfId, 10, 2) }))).toContain(
      'twenty_hours'
    );
  });

  it('7. absent/missing duration = 0', () => {
    const evaluation = ctx({
      lessonEvidence: [
        evidence({
          participantId: selfId,
          attendanceStatus: 'absent',
          durationHours: 20,
          startsAtIso: '2026-01-10T12:00:00.000Z',
          bookingId: 'booking_ach_hours_absent',
        }),
        evidence({
          participantId: selfId,
          attendanceStatus: 'missing',
          durationHours: 20,
          startsAtIso: '2026-01-11T12:00:00.000Z',
          bookingId: 'booking_ach_hours_missing',
        }),
      ],
    });
    expect(earnedIds(evaluation)).not.toContain('twenty_hours');
    expect(earnedIds(evaluation)).not.toContain('first_lesson');
  });

  it('8. dependent without /users works', () => {
    const evaluation = ctx({
      participantId: childA,
      lessonEvidence: presentLessons(childA, 1),
      level: 1,
      skillScores: {},
    });
    expect('userProfile' in evaluation).toBe(false);
    expect(earnedIds(evaluation)).toContain('first_lesson');
  });
});

describe('canonical achievement evaluation — streak', () => {
  const anchor = new Date('2026-08-13T12:00:00');

  function weekLesson(
    participantId: typeof selfId | typeof childA | typeof childB,
    date: string,
    status: ParticipantLessonStatsEvidence['attendanceStatus'],
    bookingId: string
  ) {
    return evidence({
      participantId,
      attendanceStatus: status,
      durationHours: 2,
      startsAtIso: `${date}T12:00:00.000Z`,
      bookingId,
    });
  }

  it('9. three qualifying weeks → earned', () => {
    const evaluation = ctx({
      lessonEvidence: [
        weekLesson(selfId, '2026-07-23', 'present', 'booking_streak_w1'),
        weekLesson(selfId, '2026-07-30', 'present', 'booking_streak_w2'),
        weekLesson(selfId, '2026-08-06', 'present', 'booking_streak_w3'),
      ],
      now: anchor,
    });
    expect(earnedIds(evaluation)).toContain('streak_3_weeks');
  });

  it('10. gap week breaks streak', () => {
    const evaluation = ctx({
      lessonEvidence: [
        weekLesson(selfId, '2026-07-23', 'present', 'booking_streak_gap_1'),
        weekLesson(selfId, '2026-08-06', 'present', 'booking_streak_gap_2'),
      ],
      now: anchor,
    });
    expect(earnedIds(evaluation)).not.toContain('streak_3_weeks');
  });

  it('11. multiple lessons same week count one week', () => {
    const evaluation = ctx({
      lessonEvidence: [
        weekLesson(selfId, '2026-08-06', 'present', 'booking_streak_same_1'),
        weekLesson(selfId, '2026-08-07', 'present', 'booking_streak_same_2'),
        weekLesson(selfId, '2026-08-08', 'present', 'booking_streak_same_3'),
      ],
      now: anchor,
    });
    expect(earnedIds(evaluation)).not.toContain('streak_3_weeks');
  });

  it('12. absent-only week does not qualify', () => {
    const evaluation = ctx({
      lessonEvidence: [
        weekLesson(selfId, '2026-07-23', 'present', 'booking_streak_abs_1'),
        weekLesson(selfId, '2026-07-30', 'absent', 'booking_streak_abs_2'),
        weekLesson(selfId, '2026-08-06', 'present', 'booking_streak_abs_3'),
      ],
      now: anchor,
    });
    expect(earnedIds(evaluation)).not.toContain('streak_3_weeks');
  });

  it('13. missing does not qualify', () => {
    const evaluation = ctx({
      lessonEvidence: [
        weekLesson(selfId, '2026-07-23', 'present', 'booking_streak_miss_1'),
        weekLesson(selfId, '2026-07-30', 'missing', 'booking_streak_miss_2'),
        weekLesson(selfId, '2026-08-06', 'present', 'booking_streak_miss_3'),
      ],
      now: anchor,
    });
    expect(earnedIds(evaluation)).not.toContain('streak_3_weeks');
  });

  it('14. naked booking_completed activity log does not qualify', () => {
    const evaluation = {
      ...ctx({ now: anchor }),
      activityLogs: [
        {
          type: 'booking_completed',
          timestamp: '2026-07-23T12:00:00.000Z',
        },
        {
          type: 'booking_completed',
          timestamp: '2026-07-30T12:00:00.000Z',
        },
        {
          type: 'booking_completed',
          timestamp: '2026-08-06T12:00:00.000Z',
        },
      ],
    };
    expect(earnedIds(evaluation)).not.toContain('streak_3_weeks');
  });

  it('15. family sibling present does not qualify selected participant', () => {
    const evaluation = ctx({
      participantId: childB,
      lessonEvidence: [
        weekLesson(childA, '2026-07-23', 'present', 'booking_streak_sib_1'),
        weekLesson(childA, '2026-07-30', 'present', 'booking_streak_sib_2'),
        weekLesson(childA, '2026-08-06', 'present', 'booking_streak_sib_3'),
      ],
      now: anchor,
    });
    expect(earnedIds(evaluation)).not.toContain('streak_3_weeks');
  });
});

describe('canonical achievement evaluation — progress', () => {
  const masteredFive = scoresForIds(['l1_1', 'l1_2', 'l1_3', 'l1_4', 'l1_5']);

  it('16. five_exercises from participant_progress', () => {
    expect(earnedIds(ctx({ skillScores: masteredFive }))).toContain('five_exercises');
  });

  it('17. level_up from participant_progress.level', () => {
    expect(earnedIds(ctx({ level: 2 }))).toContain('level_up');
    expect(earnedIds(ctx({ level: 1 }))).not.toContain('level_up');
  });

  it('18. child A progress does not earn child B', () => {
    const evaluation = ctx({
      participantId: childB,
      level: 1,
      skillScores: {},
      lessonEvidence: [],
    });
    const withIgnoredA = {
      ...evaluation,
      siblingProgress: { participantId: childA, level: 4, skillScores: masteredFive },
    };
    expect(earnedIds(withIgnoredA)).not.toContain('five_exercises');
    expect(earnedIds(withIgnoredA)).not.toContain('level_up');
  });

  it('19. no /users skillScores fallback', () => {
    const evaluation = {
      ...ctx({ skillScores: {} }),
      userProfile: { level: 1, skillScores: masteredFive },
    };
    expect(earnedIds(evaluation)).not.toContain('five_exercises');
  });

  it('20. no /users level fallback', () => {
    const evaluation = {
      ...ctx({ level: 1 }),
      userProfile: { level: 4, skillScores: {} },
    };
    expect(earnedIds(evaluation)).not.toContain('level_up');
  });

  it('awards milestone exercises from participant_progress', () => {
    const evaluation = ctx({ skillScores: scoresForIds(['l1_13', 'l1_15']) });
    expect(earnedIds(evaluation)).toContain('milestone_big_radius_linked');
    expect(earnedIds(evaluation)).toContain('milestone_snowflake');
  });

  it('requires all turn exercises for turn master', () => {
    const turnMaster = DEFAULT_ACHIEVEMENTS_CONFIG.items.find(
      (item) => item.id === 'milestone_turn_master'
    )!;
    const partial = ctx({ skillScores: scoresForIds(['l3_16', 'l3_17']) });
    expect(isAchievementRuleMet(turnMaster, partial)).toBe(false);
    expect(
      isAchievementRuleMet(
        turnMaster,
        ctx({ skillScores: scoresForIds(['l3_16', 'l3_17', 'l3_18', 'l3_19', 'l3_20', 'l3_21']) })
      )
    ).toBe(true);
  });
});

describe('canonical achievement evaluation — homework_done', () => {
  const completed = feedback({
    participantId: childA,
    items: [
      { itemId: 'item_1', text: 'Edges', completed: true },
      { itemId: 'item_2', text: 'Pole plant', completed: true },
    ],
  });

  it('21. feedback items >0, all completed → earned', () => {
    expect(
      earnedIds(ctx({ participantId: childA, lessonFeedback: [completed] }))
    ).toContain('homework_done');
  });

  it('22. one incomplete → not earned', () => {
    expect(
      earnedIds(
        ctx({
          participantId: childA,
          lessonFeedback: [
            feedback({
              participantId: childA,
              items: [
                { itemId: 'item_1', text: 'Edges', completed: true },
                { itemId: 'item_2', text: 'Pole plant', completed: false },
              ],
            }),
          ],
        })
      )
    ).not.toContain('homework_done');
  });

  it('23. empty feedback → not earned', () => {
    expect(
      earnedIds(
        ctx({
          participantId: childA,
          lessonFeedback: [
            feedback({
              participantId: childA,
              items: [],
            }),
          ],
        })
      )
    ).not.toContain('homework_done');
  });

  it('24. feedback A completed → no achievement B', () => {
    expect(
      earnedIds(ctx({ participantId: childB, lessonFeedback: [completed] }))
    ).not.toContain('homework_done');
  });

  it('25–27. legacy Booking.recommendations, completedRecommendationIds, and Chat Homework ignored', () => {
    const evaluation = {
      ...ctx({ participantId: childA, lessonFeedback: [] }),
      bookings: [
        {
          status: 'completed',
          recommendations: [{ id: 'rec_1', text: 'Legacy drill' }],
          completedRecommendationIds: ['rec_1'],
        },
      ],
      activityLogs: [{ type: 'recommendations_completed_all' }],
      chatHomework: { isHomework: true, homeworkForUserIds: [childA] },
    };
    expect(earnedIds(evaluation)).not.toContain('homework_done');
  });
});

describe('canonical achievement evaluation — account and course', () => {
  it('feedback_given is Account-level from canonical reviews, not activity_log', () => {
    const withReview = ctx({
      participantId: childA,
      accountReviews: [{ createdAtIso: '2026-03-01T12:00:00.000Z' }],
    });
    const withLogOnly = {
      ...ctx({ participantId: childA }),
      activityLogs: [{ type: 'review_created', timestamp: '2026-03-01T12:00:00.000Z' }],
    };
    expect(earnedIds(withReview)).toContain('feedback_given');
    expect(earnedIds(withLogOnly)).not.toContain('feedback_given');
    expect(earnedIds(ctx({ participantId: childB, accountReviews: withReview.accountReviews }))).toContain(
      'feedback_given'
    );
  });

  it('course_graduate is DEFERRED_TO_9C and never earned from lesson bookings', () => {
    const evaluation = {
      ...ctx({ lessonEvidence: presentLessons(selfId, 12) }),
      bookings: [{ id: 'course_synthetic_1', status: 'completed' }],
    };
    expect(earnedIds(evaluation)).not.toContain('course_graduate');
  });
});

describe('canonical achievement persistence merge', () => {
  const earnedAt = timestampFromDate(new Date('2026-01-10T12:00:00.000Z'));

  it('28–29. same achievement cannot duplicate and reload preserves earned', () => {
    const evaluated = evaluateEarnedAchievements(
      ctx({ lessonEvidence: presentLessons(selfId, 1) }),
      DEFAULT_ACHIEVEMENTS_CONFIG
    );
    const merged = mergeEvaluatedAndPersistedAchievements({
      evaluated,
      persistedEarned: {
        first_lesson: { earnedAt },
      },
      config: DEFAULT_ACHIEVEMENTS_CONFIG,
    });
    expect(merged.filter((item) => item.id === 'first_lesson')).toHaveLength(1);
    const afterThresholdChange = mergeEvaluatedAndPersistedAchievements({
      evaluated: [],
      persistedEarned: {
        first_lesson: { earnedAt },
      },
      config: DEFAULT_ACHIEVEMENTS_CONFIG,
    });
    expect(afterThresholdChange.some((item) => item.id === 'first_lesson')).toBe(true);
  });

  it('30–31. participant A persistence is separate from B and self', () => {
    const a = mergeEvaluatedAndPersistedAchievements({
      evaluated: [],
      persistedEarned: {
        first_lesson: { earnedAt },
      },
      config: DEFAULT_ACHIEVEMENTS_CONFIG,
    });
    const b = mergeEvaluatedAndPersistedAchievements({
      evaluated: [],
      persistedEarned: {},
      config: DEFAULT_ACHIEVEMENTS_CONFIG,
    });
    expect(a.some((item) => item.id === 'first_lesson')).toBe(true);
    expect(b.some((item) => item.id === 'first_lesson')).toBe(false);
  });

  it('32. threshold/config refresh does not duplicate a persisted badge', () => {
    const merged = mergeEvaluatedAndPersistedAchievements({
      evaluated: evaluateEarnedAchievements(
        ctx({ lessonEvidence: presentLessons(selfId, 1) }),
        DEFAULT_ACHIEVEMENTS_CONFIG
      ),
      persistedEarned: {
        first_lesson: { earnedAt },
      },
      config: DEFAULT_ACHIEVEMENTS_CONFIG,
    });
    expect(merged.filter((item) => item.id === 'first_lesson')).toHaveLength(1);
  });

  it('does not persist or re-present course_graduate from evaluated leftovers', () => {
    const merged = mergeEvaluatedAndPersistedAchievements({
      evaluated: [
        {
          id: 'course_graduate',
          icon: '🎓',
          labelRu: 'Выпускник курса',
          labelEn: 'Course graduate',
          earnedAt: '2026-01-01T00:00:00.000Z',
          order: 9,
        },
      ],
      persistedEarned: {},
      config: DEFAULT_ACHIEVEMENTS_CONFIG,
    });
    expect(merged.some((item) => item.id === 'course_graduate')).toBe(false);
  });

  it('shows only achievements earned on the local day in today section', () => {
    const today = getTodayAchievements(
      ctx({ skillScores: scoresForIds(['l1_1', 'l1_2', 'l1_3', 'l1_4', 'l1_5']) }),
      'ru',
      DEFAULT_ACHIEVEMENTS_CONFIG,
      {
        five_exercises: { earnedAt: timestampFromDate(new Date('2026-05-20T10:00:00.000Z')) },
      },
      new Date('2026-08-13T12:00:00')
    );
    expect(today.some((item) => item.id === 'five_exercises')).toBe(false);
  });
});

describe('canonical stats/achievements reachable isolation', () => {
  it('reachable evaluation and sync do not use leftover booking/log authority', () => {
    const evaluation = readRepoFile(
      'src/domain/achievements/canonicalAchievementEvaluation.ts'
    );
    const presented = readRepoFile(
      'src/features/participant-achievements/usePresentedParticipantAchievements.ts'
    );
    const sync = readRepoFile('src/features/profile/sync/useAchievementsSync.ts');
    const stats = readRepoFile(
      'src/features/student-cabinet/useSelectedParticipantLessonStats.ts'
    );
    const streak = readRepoFile('src/domain/achievements/trainingStreak.ts');
    const season = readRepoFile(
      'src/features/student-cabinet/components/student/StudentProfilePanels.tsx'
    );
    const coach = readRepoFile(
      'src/features/student-cabinet/components/student/StudentCoachPanel.tsx'
    );

    for (const source of [evaluation, presented, sync, stats, streak]) {
      expect(source).not.toContain('useBookingsStore');
      expect(source).not.toContain('completedRecommendationIds');
      expect(source).not.toContain('school_global_stats');
      expect(source).not.toContain('deletedCompletedStats');
    }
    expect(evaluation).not.toContain("type: 'booking_completed'");
    expect(streak).not.toContain('booking_completed');
    expect(streak).not.toContain('isAttendedLessonStatus');
    expect(stats).not.toContain('isAttendedLessonStatus');
    expect(season).toContain('useSelectedParticipantLessonStats');
    expect(coach).toContain('instructorLessonCountFromEvidence');
    expect(coach).not.toContain('getInstructorLessonCount');
    expect(sync).not.toContain('useBookingsStore');
  });
});
