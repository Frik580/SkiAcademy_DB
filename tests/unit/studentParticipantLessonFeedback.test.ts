import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParticipantLessonFeedbackReadModel } from '@ski-academy/shared-domain';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';
import {
  participantLessonFeedbackItemKey,
  useParticipantLessonFeedbackStore,
} from '../../src/features/participant-lesson-feedback/participantLessonFeedbackStore';
import {
  buildCanonicalRecommendationTodayTasks,
  selectExactParticipantFeedback,
  selectFeedbackForLesson,
  selectIncompleteLessonFeedback,
  selectInstructorParticipantLessonFeedback,
  selectLatestFeedbackHighlight,
  selectLatestParticipantLessonFeedback,
} from '../../src/features/student-cabinet/studentLessonFeedbackPresentation';
import { getTodayTasks } from '../../src/features/student-cabinet/components/student/studentSkillProgress';
import {
  loadManagedParticipantLessonFeedback,
  toggleManagedParticipantLessonFeedbackItem,
  togglePresentedParticipantLessonFeedbackItem,
  useSelectedParticipantLessonFeedback,
} from '../../src/features/student-cabinet/useSelectedParticipantLessonFeedback';
import type { UserProfile } from '../../src/types';

const queryManagedParticipantLessonFeedback = vi.fn();
const setManagedParticipantLessonFeedbackItemCompletion = vi.fn();

vi.mock('../../src/features/participant-lesson-feedback/participantLessonFeedbackService', () => ({
  queryManagedParticipantLessonFeedback: (...args: unknown[]) =>
    queryManagedParticipantLessonFeedback(...args),
  setManagedParticipantLessonFeedbackItemCompletion: (...args: unknown[]) =>
    setManagedParticipantLessonFeedbackItemCompletion(...args),
}));

const SELF = 'participant_self';
const CHILD_A = 'participant_child_a';
const CHILD_B = 'participant_child_b';
const LESSON_SELF = 'booking_self_01';
const LESSON_A = 'booking_child_a_01';
const LESSON_B = 'booking_child_b_01';

function feedback(input: {
  participantId: string;
  lessonBookingId: string;
  text: string;
  completed?: boolean;
  instructorId?: string;
  lessonDate?: string;
  revision?: number;
}): ParticipantLessonFeedbackReadModel {
  return {
    feedbackId: `feedback_${input.participantId}_${input.lessonBookingId}`,
    participantId: input.participantId as never,
    lessonBookingId: input.lessonBookingId as never,
    instructorId: (input.instructorId ?? 'instructor_01') as never,
    items: [
      {
        itemId: 'item_1',
        text: input.text,
        completed: input.completed ?? false,
      },
    ],
    revision: input.revision ?? 1,
    lessonDate: input.lessonDate ?? '2026-09-01',
  };
}

const profile: UserProfile = {
  uid: 'account_cabinet_01',
  email: 'self@example.com',
  displayName: 'Self',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
};

describe('student/guardian canonical lesson feedback', () => {
  beforeEach(() => {
    queryManagedParticipantLessonFeedback.mockReset();
    setManagedParticipantLessonFeedbackItemCompletion.mockReset();
    useParticipantLessonFeedbackStore.getState().clear();
  });

  it('1-3. presents exact selected participant feedback for self, child A, and child B', () => {
    const items = [
      feedback({ participantId: SELF, lessonBookingId: LESSON_SELF, text: 'Self carve' }),
      feedback({ participantId: CHILD_A, lessonBookingId: LESSON_A, text: 'A edging' }),
      feedback({ participantId: CHILD_B, lessonBookingId: LESSON_B, text: 'B poles' }),
    ];
    expect(selectLatestParticipantLessonFeedback(items, SELF)?.items[0]?.text).toBe('Self carve');
    expect(selectLatestParticipantLessonFeedback(items, CHILD_A)?.items[0]?.text).toBe('A edging');
    expect(selectLatestParticipantLessonFeedback(items, CHILD_B)?.items[0]?.text).toBe('B poles');
  });

  it('4. self → A → B → self keeps selection and does not require reload', async () => {
    queryManagedParticipantLessonFeedback.mockImplementation(
      async (input: { participantId: string }) => [
        feedback({
          participantId: input.participantId,
          lessonBookingId: `booking_${input.participantId}`,
          text: input.participantId,
        }),
      ]
    );
    const { result, rerender } = renderHook(
      (props: { selected: string }) =>
        useSelectedParticipantLessonFeedback({
          accountId: 'account_cabinet_01',
          selectedParticipantId: props.selected,
          participants: [
            { participantId: SELF, authority: 'self' },
            { participantId: CHILD_A, authority: 'parent_guardian' },
            { participantId: CHILD_B, authority: 'parent_guardian' },
          ] as never,
        }),
      { initialProps: { selected: SELF } }
    );

    await waitFor(() =>
      expect(useParticipantLessonFeedbackStore.getState().presentationParticipantId).toBe(SELF)
    );
    rerender({ selected: CHILD_A });
    rerender({ selected: CHILD_B });
    rerender({ selected: SELF });
    await waitFor(() =>
      expect(useParticipantLessonFeedbackStore.getState().presentationParticipantId).toBe(SELF)
    );
    expect(result.current.reload).toBeTypeOf('function');
    expect(
      queryManagedParticipantLessonFeedback.mock.calls.map((call) => call[0].participantId)
    ).toEqual([SELF, CHILD_A, CHILD_B, SELF]);
  });

  it('5. loads feedback for a dependent without /users identity', async () => {
    queryManagedParticipantLessonFeedback.mockResolvedValue([
      feedback({ participantId: CHILD_A, lessonBookingId: LESSON_A, text: 'Dependent drill' }),
    ]);
    renderHook(() =>
      useSelectedParticipantLessonFeedback({
        accountId: 'account_guardian_01',
        selectedParticipantId: CHILD_A,
        participants: [{ participantId: CHILD_A, authority: 'parent_guardian' }] as never,
      })
    );
    await waitFor(() =>
      expect(
        useParticipantLessonFeedbackStore.getState().byParticipantId[CHILD_A]?.items[0]?.items[0]
          ?.text
      ).toBe('Dependent drill')
    );
    expect(queryManagedParticipantLessonFeedback).toHaveBeenCalledWith({ participantId: CHILD_A });
  });

  it('6. never presents A feedback while B is selected', () => {
    const { replaceParticipantItems, setPresentationParticipantId } =
      useParticipantLessonFeedbackStore.getState();
    replaceParticipantItems(CHILD_A, [
      feedback({ participantId: CHILD_A, lessonBookingId: LESSON_A, text: 'A only' }),
    ]);
    replaceParticipantItems(CHILD_B, [
      feedback({ participantId: CHILD_B, lessonBookingId: LESSON_B, text: 'B only' }),
    ]);
    setPresentationParticipantId(CHILD_B);
    const state = useParticipantLessonFeedbackStore.getState();
    const presented = state.byParticipantId[state.presentationParticipantId!]?.items ?? [];
    expect(selectExactParticipantFeedback(presented, CHILD_B)[0]?.items[0]?.text).toBe('B only');
    expect(selectExactParticipantFeedback(presented, CHILD_A)).toEqual([]);
  });

  it('7. late response A cannot overwrite B', async () => {
    const { setPresentationParticipantId, beginLoad, applyLoad } =
      useParticipantLessonFeedbackStore.getState();
    setPresentationParticipantId(CHILD_B);
    const generationA = beginLoad(CHILD_A);
    beginLoad(CHILD_B);
    expect(
      applyLoad(CHILD_A, generationA, [
        feedback({ participantId: CHILD_A, lessonBookingId: LESSON_A, text: 'late A' }),
      ])
    ).toBe(true);
    const state = useParticipantLessonFeedbackStore.getState();
    expect(state.presentationParticipantId).toBe(CHILD_B);
    expect(state.byParticipantId[CHILD_B]?.items).toEqual([]);
    expect(state.byParticipantId[CHILD_A]?.items[0]?.items[0]?.text).toBe('late A');
  });

  it('8. empty B does not show cached A', () => {
    const { replaceParticipantItems, setPresentationParticipantId, beginLoad } =
      useParticipantLessonFeedbackStore.getState();
    replaceParticipantItems(CHILD_A, [
      feedback({ participantId: CHILD_A, lessonBookingId: LESSON_A, text: 'cached A' }),
    ]);
    setPresentationParticipantId(CHILD_B);
    beginLoad(CHILD_B);
    const state = useParticipantLessonFeedbackStore.getState();
    expect(state.byParticipantId[CHILD_B]?.items).toEqual([]);
    expect(state.byParticipantId[CHILD_B]?.loadState).toBe('loading');
    expect(state.byParticipantId[CHILD_A]?.items[0]?.items[0]?.text).toBe('cached A');
  });

  it('9. refetch does not reset participant selection', async () => {
    useParticipantLessonFeedbackStore.getState().setPresentationParticipantId(CHILD_A);
    queryManagedParticipantLessonFeedback.mockResolvedValue([
      feedback({ participantId: CHILD_A, lessonBookingId: LESSON_A, text: 'refetch A' }),
    ]);
    await loadManagedParticipantLessonFeedback(CHILD_A);
    expect(useParticipantLessonFeedbackStore.getState().presentationParticipantId).toBe(CHILD_A);
  });

  it('10. latest uses canonical selected participant', () => {
    const latest = selectLatestParticipantLessonFeedback(
      [
        feedback({
          participantId: CHILD_A,
          lessonBookingId: LESSON_A,
          text: 'older',
          lessonDate: '2026-08-01',
        }),
        feedback({
          participantId: CHILD_A,
          lessonBookingId: 'booking_child_a_02',
          text: 'newest',
          lessonDate: '2026-09-01',
        }),
        feedback({
          participantId: CHILD_B,
          lessonBookingId: LESSON_B,
          text: 'B newest',
          lessonDate: '2026-09-10',
        }),
      ],
      CHILD_A
    );
    expect(latest?.items[0]?.text).toBe('newest');
    expect(selectLatestFeedbackHighlight(latest!)?.isPending).toBe(true);
  });

  it('11. coach history uses canonical feedback for the instructor', () => {
    const rows = selectInstructorParticipantLessonFeedback(
      [
        feedback({
          participantId: CHILD_A,
          lessonBookingId: LESSON_A,
          text: 'A with coach',
          instructorId: 'instructor_01',
        }),
        feedback({
          participantId: CHILD_A,
          lessonBookingId: 'booking_other',
          text: 'A other coach',
          instructorId: 'instructor_02',
        }),
      ],
      CHILD_A,
      'instructor_01'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.items[0]?.text).toBe('A with coach');
  });

  it('12-13. history and lesson details use exact participant + lesson', () => {
    const items = [
      feedback({ participantId: CHILD_A, lessonBookingId: LESSON_A, text: 'A lesson' }),
      feedback({ participantId: CHILD_B, lessonBookingId: LESSON_A, text: 'B same lesson' }),
    ];
    expect(selectFeedbackForLesson(items, CHILD_A, LESSON_A)?.items[0]?.text).toBe('A lesson');
    expect(selectFeedbackForLesson(items, CHILD_B, LESSON_A)?.items[0]?.text).toBe('B same lesson');
    expect(selectFeedbackForLesson(items, CHILD_A, LESSON_B)).toBeNull();
  });

  it('14. needs attention uses canonical incomplete items', () => {
    const incomplete = selectIncompleteLessonFeedback(
      [
        feedback({
          participantId: CHILD_A,
          lessonBookingId: LESSON_A,
          text: 'open',
          completed: false,
        }),
        feedback({
          participantId: CHILD_A,
          lessonBookingId: 'booking_done',
          text: 'done',
          completed: true,
        }),
      ],
      CHILD_A
    );
    expect(incomplete.map((item) => item.lessonBookingId)).toEqual([LESSON_A]);
  });

  it('15-16. today uses canonical pending items and excludes completed', () => {
    const tasks = buildCanonicalRecommendationTodayTasks({
      items: [
        feedback({
          participantId: CHILD_A,
          lessonBookingId: LESSON_A,
          text: 'pending drill',
          completed: false,
          lessonDate: '2026-09-10',
        }),
        feedback({
          participantId: CHILD_A,
          lessonBookingId: 'booking_done',
          text: 'already done',
          completed: true,
          lessonDate: '2026-09-10',
        }),
      ],
      participantId: CHILD_A,
      language: 'en',
      fromDate: new Date('2026-09-11T12:00:00'),
    });
    expect(tasks.map((task) => task.label)).toEqual(['pending drill']);
    const today = getTodayTasks(profile, 'en', undefined, tasks);
    expect(
      today.filter((task) => task.kind === 'recommendation').map((task) => task.label)
    ).toEqual(['pending drill']);
  });

  it('17. presentation helpers never read Booking.recommendations', () => {
    expect(selectLatestParticipantLessonFeedback.toString()).not.toContain('recommendations');
    expect(buildCanonicalRecommendationTodayTasks.toString()).not.toContain(
      'completedRecommendationIds'
    );
  });

  it('18-24. completion command sends exact ids and expectedRevision without actor fields', async () => {
    setManagedParticipantLessonFeedbackItemCompletion.mockResolvedValue({
      revision: 2,
      completed: true,
      itemId: 'item_1',
      participantId: CHILD_A,
      lessonBookingId: LESSON_A,
    });
    queryManagedParticipantLessonFeedback.mockResolvedValue([
      feedback({
        participantId: CHILD_A,
        lessonBookingId: LESSON_A,
        text: 'pending drill',
        completed: true,
        revision: 2,
      }),
    ]);
    const ok = await toggleManagedParticipantLessonFeedbackItem({
      accountId: 'account_guardian_01',
      participantId: CHILD_A,
      lessonBookingId: LESSON_A,
      itemId: 'item_1',
      completed: true,
      expectedRevision: 1,
      exercisedCapability: 'parent_guardian',
    });
    expect(ok).toBe(true);
    expect(setManagedParticipantLessonFeedbackItemCompletion).toHaveBeenCalledWith({
      accountId: 'account_guardian_01',
      participantId: CHILD_A,
      lessonBookingId: LESSON_A,
      itemId: 'item_1',
      completed: true,
      expectedRevision: 1,
      exercisedCapability: 'parent_guardian',
    });
    const sent = setManagedParticipantLessonFeedbackItemCompletion.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(sent).not.toHaveProperty('userId');
    expect(sent).not.toHaveProperty('instructorId');
  });

  it('19. checked item sends completed=false', async () => {
    setManagedParticipantLessonFeedbackItemCompletion.mockResolvedValue({
      revision: 3,
      completed: false,
      itemId: 'item_1',
      participantId: CHILD_A,
      lessonBookingId: LESSON_A,
    });
    queryManagedParticipantLessonFeedback.mockResolvedValue([]);
    await toggleManagedParticipantLessonFeedbackItem({
      accountId: 'account_guardian_01',
      participantId: CHILD_A,
      lessonBookingId: LESSON_A,
      itemId: 'item_1',
      completed: false,
      expectedRevision: 2,
      exercisedCapability: 'parent_guardian',
    });
    expect(setManagedParticipantLessonFeedbackItemCompletion.mock.calls[0]?.[0].completed).toBe(
      false
    );
  });

  it('25. duplicate pending toggle is blocked', async () => {
    const store = useParticipantLessonFeedbackStore.getState();
    const key = participantLessonFeedbackItemKey(CHILD_A, LESSON_A, 'item_1');
    store.setPending(key, true);
    const blocked = await toggleManagedParticipantLessonFeedbackItem({
      accountId: 'account_guardian_01',
      participantId: CHILD_A,
      lessonBookingId: LESSON_A,
      itemId: 'item_1',
      completed: true,
      expectedRevision: 1,
      exercisedCapability: 'parent_guardian',
    });
    expect(blocked).toBe(false);
    expect(setManagedParticipantLessonFeedbackItemCompletion).not.toHaveBeenCalled();
  });

  it('26. success updates canonical state for that participant', async () => {
    const store = useParticipantLessonFeedbackStore.getState();
    store.replaceParticipantItems(CHILD_A, [
      feedback({
        participantId: CHILD_A,
        lessonBookingId: LESSON_A,
        text: 'open',
        completed: false,
      }),
    ]);
    setManagedParticipantLessonFeedbackItemCompletion.mockResolvedValue({
      revision: 2,
      completed: true,
      itemId: 'item_1',
      participantId: CHILD_A,
      lessonBookingId: LESSON_A,
    });
    queryManagedParticipantLessonFeedback.mockResolvedValue([
      feedback({
        participantId: CHILD_A,
        lessonBookingId: LESSON_A,
        text: 'open',
        completed: true,
        revision: 2,
      }),
    ]);
    await toggleManagedParticipantLessonFeedbackItem({
      accountId: 'account_guardian_01',
      participantId: CHILD_A,
      lessonBookingId: LESSON_A,
      itemId: 'item_1',
      completed: true,
      expectedRevision: 1,
      exercisedCapability: 'parent_guardian',
    });
    expect(
      useParticipantLessonFeedbackStore.getState().byParticipantId[CHILD_A]?.items[0]?.items[0]
        ?.completed
    ).toBe(true);
  });

  it('27. failure does not fake completion', async () => {
    const store = useParticipantLessonFeedbackStore.getState();
    store.replaceParticipantItems(CHILD_A, [
      feedback({
        participantId: CHILD_A,
        lessonBookingId: LESSON_A,
        text: 'open',
        completed: false,
      }),
    ]);
    setManagedParticipantLessonFeedbackItemCompletion.mockRejectedValue(new Error('nope'));
    await expect(
      toggleManagedParticipantLessonFeedbackItem({
        accountId: 'account_guardian_01',
        participantId: CHILD_A,
        lessonBookingId: LESSON_A,
        itemId: 'item_1',
        completed: true,
        expectedRevision: 1,
        exercisedCapability: 'parent_guardian',
      })
    ).rejects.toThrow('nope');
    expect(
      useParticipantLessonFeedbackStore.getState().byParticipantId[CHILD_A]?.items[0]?.items[0]
        ?.completed
    ).toBe(false);
  });

  it('28. stale_version refetches and reconciles', async () => {
    const store = useParticipantLessonFeedbackStore.getState();
    store.replaceParticipantItems(CHILD_A, [
      feedback({
        participantId: CHILD_A,
        lessonBookingId: LESSON_A,
        text: 'open',
        completed: false,
      }),
    ]);
    setManagedParticipantLessonFeedbackItemCompletion.mockRejectedValue(
      new CanonicalCommandClientError('stale_version', { correlationId: 'correlation_stale_01' })
    );
    queryManagedParticipantLessonFeedback.mockResolvedValue([
      feedback({
        participantId: CHILD_A,
        lessonBookingId: LESSON_A,
        text: 'open',
        completed: false,
        revision: 4,
      }),
    ]);
    await expect(
      toggleManagedParticipantLessonFeedbackItem({
        accountId: 'account_guardian_01',
        participantId: CHILD_A,
        lessonBookingId: LESSON_A,
        itemId: 'item_1',
        completed: true,
        expectedRevision: 1,
        exercisedCapability: 'parent_guardian',
      })
    ).rejects.toBeInstanceOf(CanonicalCommandClientError);
    expect(
      useParticipantLessonFeedbackStore.getState().byParticipantId[CHILD_A]?.items[0]?.revision
    ).toBe(4);
    expect(
      useParticipantLessonFeedbackStore.getState().byParticipantId[CHILD_A]?.items[0]?.items[0]
        ?.completed
    ).toBe(false);
  });

  it('29. A completion does not mutate B', async () => {
    const store = useParticipantLessonFeedbackStore.getState();
    store.replaceParticipantItems(CHILD_A, [
      feedback({
        participantId: CHILD_A,
        lessonBookingId: LESSON_A,
        text: 'A open',
        completed: false,
      }),
    ]);
    store.replaceParticipantItems(CHILD_B, [
      feedback({
        participantId: CHILD_B,
        lessonBookingId: LESSON_B,
        text: 'B open',
        completed: false,
      }),
    ]);
    setManagedParticipantLessonFeedbackItemCompletion.mockResolvedValue({
      revision: 2,
      completed: true,
      itemId: 'item_1',
      participantId: CHILD_A,
      lessonBookingId: LESSON_A,
    });
    queryManagedParticipantLessonFeedback.mockResolvedValue([
      feedback({
        participantId: CHILD_A,
        lessonBookingId: LESSON_A,
        text: 'A open',
        completed: true,
        revision: 2,
      }),
    ]);
    await toggleManagedParticipantLessonFeedbackItem({
      accountId: 'account_guardian_01',
      participantId: CHILD_A,
      lessonBookingId: LESSON_A,
      itemId: 'item_1',
      completed: true,
      expectedRevision: 1,
      exercisedCapability: 'parent_guardian',
    });
    expect(
      useParticipantLessonFeedbackStore.getState().byParticipantId[CHILD_B]?.items[0]?.items[0]
        ?.completed
    ).toBe(false);
  });

  it('30. guardian/dependent toggle uses parent_guardian capability', async () => {
    const store = useParticipantLessonFeedbackStore.getState();
    store.setPresentationParticipantId(CHILD_A);
    store.setCompletionCapability(CHILD_A, 'parent_guardian');
    store.replaceParticipantItems(CHILD_A, [
      feedback({ participantId: CHILD_A, lessonBookingId: LESSON_A, text: 'open' }),
    ]);
    setManagedParticipantLessonFeedbackItemCompletion.mockResolvedValue({
      revision: 2,
      completed: true,
      itemId: 'item_1',
      participantId: CHILD_A,
      lessonBookingId: LESSON_A,
    });
    queryManagedParticipantLessonFeedback.mockResolvedValue([
      feedback({
        participantId: CHILD_A,
        lessonBookingId: LESSON_A,
        text: 'open',
        completed: true,
        revision: 2,
      }),
    ]);
    await togglePresentedParticipantLessonFeedbackItem({
      accountId: 'account_guardian_01',
      lessonBookingId: LESSON_A,
      itemId: 'item_1',
      completed: true,
    });
    expect(setManagedParticipantLessonFeedbackItemCompletion.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        participantId: CHILD_A,
        exercisedCapability: 'parent_guardian',
      })
    );
  });

  it('31-35. loading placeholder hides previous participant and does not reload', async () => {
    const { replaceParticipantItems, setPresentationParticipantId, beginLoad, applyLoad } =
      useParticipantLessonFeedbackStore.getState();
    replaceParticipantItems(CHILD_A, [
      feedback({ participantId: CHILD_A, lessonBookingId: LESSON_A, text: 'A cached' }),
    ]);
    setPresentationParticipantId(CHILD_B);
    const generation = beginLoad(CHILD_B);
    expect(useParticipantLessonFeedbackStore.getState().byParticipantId[CHILD_B]?.loadState).toBe(
      'loading'
    );
    expect(useParticipantLessonFeedbackStore.getState().byParticipantId[CHILD_B]?.items).toEqual(
      []
    );
    expect(useParticipantLessonFeedbackStore.getState().presentationParticipantId).toBe(CHILD_B);
    await act(async () => {
      applyLoad(CHILD_B, generation, []);
    });
    expect(
      useParticipantLessonFeedbackStore.getState().byParticipantId[CHILD_A]?.items[0]?.items[0]
        ?.text
    ).toBe('A cached');
    const source = `${loadManagedParticipantLessonFeedback.toString()}${toggleManagedParticipantLessonFeedbackItem.toString()}`;
    expect(source).not.toContain('location.reload');
    expect(source).not.toContain('router.refresh');
  });
});
