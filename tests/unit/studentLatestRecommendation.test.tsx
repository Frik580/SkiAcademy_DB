import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedRecommendation } from '@ski-academy/shared-domain';
import { translations, type TranslationKey } from '../../src/lib/i18n/translations';
import { StudentCoachRecommendationsSection } from '../../src/features/student-cabinet/components/student/StudentHomeBottomSections';
import { queryManagedRecommendationsPage } from '../../src/features/participant-lesson-feedback/participantLessonFeedbackService';
import { StudentCoachSkillCommentsSection } from '../../src/features/student-cabinet/components/student/StudentCoachSkillCommentsSection';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import type { ParticipantProgressView } from '../../src/features/participant-progress/applyParticipantProgressToProfile';

let language: 'ru' | 'en' = 'en';
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language, t: (key: TranslationKey) => translations[language][key] }),
}));
vi.mock('../../src/features/participant-lesson-feedback/participantLessonFeedbackService', () => ({
  queryManagedRecommendationsPage: vi.fn(),
}));

const load = vi.mocked(queryManagedRecommendationsPage);
const lesson = 'lesson_a' as ManagedRecommendation['lessonBookingId'];
const item = (
  index: number,
  overrides: Partial<ManagedRecommendation> = {}
): ManagedRecommendation => ({
  itemId: `item_${index}`,
  text: `Drill ${index}`,
  lessonBookingId: lesson,
  lessonAvailable: true,
  lessonDate: '2026-10-03',
  completed: index === 0,
  ...overrides,
});
const page = (items: ManagedRecommendation[], nextCursor: string | null = null) => ({
  scope: 'managed_recommendations' as const,
  items,
  nextCursor,
});
const onOpen = vi.fn();
function tile(account = 'first', participantId = 'student_a') {
  return (
    <StudentCoachRecommendationsSection
      key={JSON.stringify([account, participantId])}
      participantId={participantId}
      instructorNames={
        new Map([
          ['coach_a', 'Coach A'],
          ['coach_b', 'Coach B'],
        ])
      }
      lessonContext={
        new Map([
          [
            lesson,
            { lessonBookingId: lesson, instructorId: 'different', instructorName: 'Wrong coach' },
          ],
        ])
      }
      onOpenLesson={onOpen}
    />
  );
}
beforeEach(() => {
  language = 'en';
  load.mockReset();
  onOpen.mockReset();
});

describe('Coach recommendations', () => {
  it('hides pagination entirely when there are no recommendations', async () => {
    load.mockResolvedValue(page([]));
    render(tile());
    expect(await screen.findByText('No coach recommendations yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByText(/^Page \d+$/)).toBeNull();
  });

  it.each([1, 5, 6, 11])('shows %i recommendations in individual pages', async (count) => {
    const items = Array.from({ length: count }, (_, i) => item(i));
    load.mockImplementation(async (_, cursor) => {
      const offset = Number(cursor ?? 0);
      return page(items.slice(offset, offset + 5), offset + 5 < count ? String(offset + 5) : null);
    });
    render(tile());
    const user = userEvent.setup();
    for (let offset = 0; offset < count; offset += 5) {
      expect(await screen.findByText(`Drill ${offset}`, { exact: true })).toBeVisible();
      expect(screen.getAllByRole('listitem')).toHaveLength(Math.min(count - offset, 5));
      const hasPrevious = offset > 0;
      const hasNext = offset + 5 < count;
      expect(Boolean(screen.queryByRole('button', { name: 'Back' }))).toBe(hasPrevious);
      expect(Boolean(screen.queryByRole('button', { name: 'Next' }))).toBe(hasNext);
      expect(screen.queryByText(/^Page \d+$/)).toBeNull();
      if (hasNext) {
        screen.getByRole('button', { name: 'Next' }).focus();
        await user.keyboard('{Enter}');
      }
    }
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    if (count > 5) {
      const back = screen.getByRole('button', { name: 'Back' });
      back.focus();
      await user.keyboard(' ');
      expect(
        await screen.findByText(`Drill ${count === 11 ? 5 : 0}`, { exact: true })
      ).toBeVisible();
    }
  });

  it.each(['en', 'ru'] as const)(
    'shows full text, statuses, and only confirmed authors in %s',
    async (lang) => {
      language = lang;
      const fullText = 'Длинная рекомендация. '.repeat(50) + '\nСледующий абзац.';
      load.mockResolvedValue(
        page([
          item(0, {
            text: fullText,
            instructorId: 'coach_a' as ManagedRecommendation['instructorId'],
          }),
          item(1, { instructorId: 'coach_b' as ManagedRecommendation['instructorId'] }),
          item(2, { lessonAvailable: false }),
        ])
      );
      render(tile());
      expect(
        screen.getByRole('heading', { name: translations[lang].scCoachRecommendations })
      ).toBeVisible();
      const [first, second, third] = await screen.findAllByRole('listitem');
      expect(first.querySelector('blockquote')?.textContent).toBe(fullText);
      expect(within(first).getByText(translations[lang].scRecommendationCompleted)).toBeVisible();
      expect(within(second).getByText(translations[lang].scRecommendationIncomplete)).toBeVisible();
      expect(within(first).getByText('Coach A')).toBeVisible();
      expect(within(second).getByText('Coach B')).toBeVisible();
      expect(screen.queryByText('Wrong coach')).toBeNull();
      expect(within(third).queryByRole('button')).toBeNull();
      const details = within(first).getByRole('button', { name: translations[lang].scMoreDetails });
      details.focus();
      await userEvent.keyboard('{Enter}');
      expect(onOpen).toHaveBeenCalledWith(lesson);
    }
  );

  it('clears previous data when a page is denied and supports keyboard Retry', async () => {
    load
      .mockResolvedValueOnce(page([item(0)], 'next'))
      .mockRejectedValueOnce({ code: 'functions/permission-denied' })
      .mockResolvedValueOnce(page([item(1)]));
    render(tile());
    await screen.findByText('Drill 0');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText('Drill 0')).toBeNull();
    screen.getByRole('button', { name: 'Retry' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Drill 1')).toBeVisible();
    expect(load).toHaveBeenLastCalledWith('student_a', 'next', expect.any(AbortSignal));
  });

  it.each([
    ['first', 'student_b'],
    ['second', 'student_a'],
  ])('resets pagination and ignores old requests for %s/%s', async (account, participant) => {
    let finishOld: (value: ReturnType<typeof page>) => void = () => undefined;
    load
      .mockResolvedValueOnce(page([item(0)], 'old-next'))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          })
      )
      .mockResolvedValueOnce(page([item(8)]));
    const view = render(tile());
    await screen.findByText('Drill 0');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Back' })).toBeVisible();
    view.rerender(tile(account, participant));
    expect(await screen.findByText('Drill 8')).toBeVisible();
    expect(screen.queryByText(/^Page \d+$/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    await act(async () => finishOld(page([item(1)])));
    expect(screen.queryByText('Drill 1')).toBeNull();
    expect(load).toHaveBeenLastCalledWith(participant, undefined, expect.any(AbortSignal));
  });
});

describe('Coach exercise comments tile', () => {
  const skillIds = DEFAULT_SKILL_CONFIG.items.slice(0, 7).map((skill) => skill.id);
  function progress(participantId = 'student_a', count = 7): ParticipantProgressView {
    const ids = skillIds.slice(0, count);
    return {
      participantId,
      level: 1,
      revision: 1,
      skillScores: {},
      skillComments: Object.fromEntries(ids.map((id, index) => [id, `Coach note ${index}`])),
      skillCommentAttribution: Object.fromEntries(
        ids.map((id, index) => [
          id,
          {
            instructorId: 'coach_a' as never,
            accountId: 'account_a' as never,
            updatedAt: { seconds: 1000 + index, nanoseconds: 0 },
            revision: 1,
          },
        ])
      ),
    };
  }
  function commentsTile(value?: ParticipantProgressView, participantId = 'student_a') {
    return (
      <StudentCoachSkillCommentsSection
        key={participantId}
        participantId={participantId}
        progress={value}
        skillConfig={DEFAULT_SKILL_CONFIG}
        instructors={[{ id: 'coach_a', name: 'Coach A' }]}
      />
    );
  }

  it('has a localized empty state and hides navigation without comments', () => {
    render(commentsTile(progress('student_a', 0)));
    expect(screen.getByText(translations.en.scNoCoachExerciseComments)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByText(/^Page \d+$/)).toBeNull();
  });

  it('shows five latest comments and navigates without page numbers', async () => {
    render(commentsTile(progress()));
    const user = userEvent.setup();
    expect(screen.getByRole('heading', { name: translations.en.scCoachExerciseComments })).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('Coach note 6')).toBeVisible();
    expect(screen.queryByText('Coach note 0')).toBeNull();
    expect(screen.getAllByText(/^Coach A(?:\s*·|$)/)).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByText(/^Page \d+$/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Coach note 0')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Coach note 6')).toBeVisible();
  });

  it('shows unknown authors without falsely assigning old comments', () => {
    const value = progress('student_a', 1);
    render(commentsTile({ ...value, skillCommentAttribution: undefined }));
    expect(screen.getByText('Author unknown')).toBeVisible();
    expect(screen.queryByText(/^Coach A(?:\s*·|$)/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('does not show another participant\'s progress and resets on switching participants', async () => {
    const view = render(commentsTile(progress()));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Coach note 0')).toBeVisible();
    view.rerender(commentsTile(progress('student_b', 1), 'student_b'));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Coach note 0')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    view.rerender(commentsTile(progress('student_a', 2), 'student_b'));
    expect(screen.getByText(translations.en.scNoCoachExerciseComments)).toBeVisible();
  });

  it('renders Russian heading and empty state', () => {
    language = 'ru';
    render(commentsTile(progress('student_a', 0)));
    expect(
      screen.getByRole('heading', { name: translations.ru.scCoachExerciseComments })
    ).toBeVisible();
    expect(screen.getByText(translations.ru.scNoCoachExerciseComments)).toBeVisible();
  });
});
