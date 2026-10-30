import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ParticipantIdSchema,
  participantProgressDayKey,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  TodayProgressBlock,
  PresentedTodayProgressBlock,
} from '../../src/features/student-cabinet/components/student/StudentTodayProgressBlock';
import { buildParticipantTodayProgress } from '../../src/features/student-cabinet/components/student/studentTodayProgress';
import { useParticipantProgressStore } from '../../src/features/participant-progress/participantProgressStore';
import {
  toParticipantProgressView,
  type ParticipantProgressView,
} from '../../src/features/participant-progress/applyParticipantProgressToProfile';
import { useParticipantAchievementsStore } from '../../src/features/participant-achievements/participantAchievementsStore';
import { useAccountParticipantLessonStatsStore } from '../../src/features/lesson-bookings/accountParticipantLessonStatsStore';
import { DEFAULT_ACHIEVEMENTS_CONFIG, DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import { useCabinetProgressParticipantSelectionStore } from '../../src/features/student-cabinet/cabinetProgressParticipantSelectionStore';
import { useCabinetProgressParticipantSelection } from '../../src/features/student-cabinet/useCabinetProgressParticipantSelection';
import { CabinetParticipantAvatarSwitcher } from '../../src/features/student-cabinet/components/CabinetParticipantAvatarSwitcher';
import { toCabinetParticipantAvatarItems } from '../../src/features/student-cabinet/cabinetParticipantAvatarSwitcherContract';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import { usePresentedParticipantAchievements } from '../../src/features/participant-achievements/usePresentedParticipantAchievements';
import { useStudentTodayAchievements } from '../../src/features/student-cabinet/components/student/useStudentTodayAchievements';
import { useParticipantProgressDay } from '../../src/features/student-cabinet/components/student/useParticipantProgressDay';

const locale = vi.hoisted(() => ({ language: 'en' as 'en' | 'ru' }));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: locale.language, t: (key: string) => key }),
}));
const now = new Date('2026-10-05T20:00:00Z'); // Already Oct 6 in the school, independently of the browser timezone.
const firstId = ParticipantIdSchema.parse('participant_daily_a');
const secondId = ParticipantIdSchema.parse('participant_daily_b');
const firstSkill = DEFAULT_SKILL_CONFIG.items.find((item) => item.maxPoints >= 20)!;
const secondSkill = DEFAULT_SKILL_CONFIG.items.find(
  (item) => item.maxPoints >= 20 && item.id !== firstSkill.id
)!;
const managed: ManagedParticipantOption[] = [firstId, secondId].map((id, index) => ({
  participantId: id,
  participantManagementId: 'management_' + id,
  displayName: index ? 'Bob' : 'Alice',
  authority: index ? 'parent_guardian' : 'self',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 10 },
  revision: 1,
}));
function row(
  id: string,
  score: number,
  baseline: number,
  skillId: string,
  level: number
): ParticipantProgressView {
  return {
    participantId: id,
    level,
    skillScores: { [skillId]: score },
    skillComments: {},
    revision: 1,
    dailyProgress: {
      date: participantProgressDayKey(now),
      timeZone: 'Asia/Almaty',
      baselineLevel: level,
      baselineSkillScores: { [skillId]: baseline },
      complete: true,
    },
  };
}
const a = row(firstId, 8, 3, firstSkill.id, 1);
const b = row(secondId, 15, 6, secondSkill.id, 3);
function Harness({ participants = managed }: { participants?: ManagedParticipantOption[] }) {
  const { selectedParticipantId, selectParticipant } = useCabinetProgressParticipantSelection({
    accountId: 'account_daily_test',
    participants,
    loading: false,
  });
  const progress = useParticipantProgressStore((state) =>
    selectedParticipantId ? state.byId[selectedParticipantId] : undefined
  );
  const profiles = toCabinetParticipantAvatarItems(participants);
  const day = useParticipantProgressDay();
  const achievements = useStudentTodayAchievements(
    {
      selectedParticipantId,
      achievementsConfig: DEFAULT_ACHIEVEMENTS_CONFIG,
      skillConfig: DEFAULT_SKILL_CONFIG,
    },
    day
  );
  return (
    <>
      <CabinetParticipantAvatarSwitcher
        items={profiles}
        selectedParticipantId={selectedParticipantId}
        onSelect={selectParticipant}
        fallbackDisplayName="Owner"
        groupLabel="Participants"
        switchToParticipantLabel="Select {name}"
      />
      <PresentedTodayProgressBlock
        selectedParticipantId={selectedParticipantId}
        scopeParticipant={
          participants.length > 1
            ? profiles.find((item) => item.participantId === selectedParticipantId)
            : undefined
        }
        progress={buildParticipantTodayProgress(
          selectedParticipantId,
          progress,
          DEFAULT_SKILL_CONFIG,
          'en',
          now,
          day
        )}
        todayAchievements={achievements}
        achievementsConfig={DEFAULT_ACHIEVEMENTS_CONFIG}
        skillConfig={DEFAULT_SKILL_CONFIG}
      />
    </>
  );
}
function block() {
  return screen.getByText('Today’s Progress').parentElement!.parentElement!;
}
function xp() {
  return screen.getByText('Today’s Earned XP').parentElement!;
}
beforeEach(() => {
  locale.language = 'en';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  useCabinetProgressParticipantSelectionStore.getState().reset();
  useParticipantProgressStore.getState().clear();
  useParticipantProgressStore.getState().setItems([a, b]);
  useAccountParticipantLessonStatsStore.getState().reset();
  useAccountParticipantLessonStatsStore
    .getState()
    .setLoading({ accountId: 'account_daily_test', generation: 1 });
  useAccountParticipantLessonStatsStore
    .getState()
    .replaceItems({ accountId: 'account_daily_test', generation: 1, items: [] });
  useParticipantAchievementsStore.getState().clear();
  useParticipantAchievementsStore.getState().setItems(
    [firstId, secondId].map((participantId, index) => ({
      participantId,
      revision: 1,
      earned: {
        [index ? 'ten_lessons' : 'first_lesson']: {
          earnedAt: timestampFromDate(now),
          source: 'participant_attendance' as const,
        },
      },
      updatedAt: timestampFromDate(now),
    }))
  );
});
afterEach(() => vi.useRealTimers());

describe('participant daily progress block', () => {
  it('rolls the entire participant tile over at school midnight and on visibility return', () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T18:59:00Z'));
    const { unmount } = render(<Harness />);
    expect(xp()).toHaveTextContent('+5 XP');
    expect(screen.getByText('New achievements today:')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByText('Today’s Progress')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Select Bob' }));
    expect(screen.queryByText('Today’s Progress')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Select Alice' }));
    expect(screen.queryByText('Today’s Progress')).toBeNull();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByText('Today’s Progress')).toBeNull();
    act(() => {
      vi.setSystemTime(new Date('2026-10-06T18:59:00Z'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(xp()).toHaveTextContent('+5 XP');
    act(() => {
      vi.setSystemTime(new Date('2026-10-06T19:01:00Z'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.queryByText('Today’s Progress')).toBeNull();
    unmount();
  });
  it('cleans up its one timer and visibility listener on remount', () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const first = renderHook(() => useParticipantProgressDay());
    expect(vi.getTimerCount()).toBe(1);
    first.unmount();
    expect(vi.getTimerCount()).toBe(0);
    const second = renderHook(() => useParticipantProgressDay());
    expect(vi.getTimerCount()).toBe(1);
    second.unmount();
    expect(vi.getTimerCount()).toBe(0);
    const listeners = add.mock.calls.filter(([event]) => event === 'visibilitychange');
    for (const [, listener] of listeners) {
      expect(remove).toHaveBeenCalledWith('visibilitychange', listener);
    }
    add.mockRestore();
    remove.mockRestore();
  });
  it('switches XP, current level, trainer scores and persisted achievements through the shared header state', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const root = block();
    expect(xp()).toHaveTextContent('+5 XP');
    expect(within(root).getByText(/Current score: 8/)).toBeInTheDocument();
    expect(within(root).getByText('Level 1')).toBeInTheDocument();
    expect(within(root).queryByText(/Current score: 15/)).toBeNull();
    const beforeAchievements =
      within(root).getByText('New achievements today:').parentElement!.textContent;
    await user.click(screen.getByRole('button', { name: 'Select Bob' }));
    expect(block()).toBe(root);
    expect(xp()).toHaveTextContent('+9 XP');
    expect(within(root).getByText(/Current score: 15/)).toBeInTheDocument();
    expect(within(root).queryByText(/Current score: 8/)).toBeNull();
    expect(within(root).getByText('Level 3')).toBeInTheDocument();
    expect(within(root).getByText('New achievements today:').parentElement!.textContent).not.toBe(
      beforeAchievements
    );
    const scopes = root.querySelectorAll('[data-participant-scope]');
    expect(scopes).toHaveLength(1);
    expect(scopes[0]).toHaveTextContent('Bob');
    expect(
      screen
        .getByText('New achievements today:')
        .parentElement!.querySelector('[data-participant-scope]')
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Select Alice' }));
    expect(block()).toBe(root);
    expect(xp()).toHaveTextContent('+5 XP');
    expect(within(root).queryByText(/Current score: 15/)).toBeNull();
    expect(within(root).getByText('New achievements today:').parentElement!.textContent).toBe(
      beforeAchievements
    );
  });
  it('has one scope indicator in the whole-block header and none inside achievements', () => {
    render(<Harness />);
    expect(block().querySelectorAll('[data-participant-scope]')).toHaveLength(1);
    expect(
      screen.getByText('Today’s Progress').parentElement!.querySelector('[data-participant-scope]')
    ).toHaveTextContent('Alice');
    expect(
      screen
        .getByText('New achievements today:')
        .parentElement!.querySelector('[data-participant-scope]')
    ).toBeNull();
  });
  it('hides the whole-block badge for a sole participant', () => {
    render(<Harness participants={managed.slice(1)} />);
    expect(block().querySelector('[data-participant-scope]')).toBeNull();
    expect(xp()).toHaveTextContent('+9 XP');
  });
  it('reacts to the selected canonical row update without a reload or remount', () => {
    render(<Harness />);
    const root = block();
    act(() =>
      useParticipantProgressStore
        .getState()
        .upsertItem({ ...a, skillScores: { [firstSkill.id]: 10 }, revision: 2 })
    );
    expect(block()).toBe(root);
    expect(xp()).toHaveTextContent('+7 XP');
  });
  it('shows unknown daily evidence without claiming zero XP or no trainer scores', () => {
    useParticipantProgressStore.getState().upsertItem({ ...a, dailyProgress: undefined });
    render(<Harness />);
    expect(xp()).toHaveTextContent('— XP');
    expect(xp()).not.toHaveTextContent('+0 XP');
    expect(within(block()).getByText('Level 1')).toBeInTheDocument();
    expect(within(block()).getByText('New achievements today:')).toBeInTheDocument();
    expect(
      screen.getByText('Today’s exercise score history is not available yet.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No exercise XP assigned by instructor today yet.')).toBeNull();
  });
  it('never uses another participant row or reconstructs daily XP from a current total', () => {
    expect(buildParticipantTodayProgress(firstId, b).level).toBeUndefined();
    expect(
      buildParticipantTodayProgress(firstId, { ...a, dailyProgress: undefined }).todayXP
    ).toBeNull();
    expect(
      buildParticipantTodayProgress(
        firstId,
        { ...a, dailyProgress: { ...a.dailyProgress!, complete: false } },
        DEFAULT_SKILL_CONFIG,
        'en',
        now
      ).todayXP
    ).toBeNull();
    expect(
      buildParticipantTodayProgress(
        firstId,
        a,
        DEFAULT_SKILL_CONFIG,
        'en',
        new Date('2026-10-06T19:00:00Z')
      ).exercises
    ).toEqual([]);
  });
  it('preserves daily evidence from the read model and measures net gains rather than duplicate updates', () => {
    const view = toParticipantProgressView({ ...a, participantId: firstId });
    expect(view.dailyProgress).toEqual(a.dailyProgress);
    expect(
      buildParticipantTodayProgress(
        firstId,
        { ...view, skillScores: { [firstSkill.id]: 6 } },
        DEFAULT_SKILL_CONFIG,
        'en',
        now
      ).todayXP
    ).toBe(3);
  });
});

describe('today achievements visual data states', () => {
  it('excludes an evaluated achievement without trustworthy earnedAt from today', () => {
    useParticipantAchievementsStore.getState().clear();
    useParticipantProgressStore.getState().upsertItem({ ...a, level: 2 });
    const input = {
      selectedParticipantId: firstId,
      language: 'en' as const,
      accountReviews: [],
      achievementsConfig: DEFAULT_ACHIEVEMENTS_CONFIG,
      skillConfig: DEFAULT_SKILL_CONFIG,
    };
    const { result } = renderHook(() => ({
      all: usePresentedParticipantAchievements(input).achievements,
      today: useStudentTodayAchievements(input),
    }));
    expect(result.current.all.some((item) => !item.earnedAt)).toBe(true);
    expect(result.current.today).toEqual([]);
  });
  it('shows verified zero only when existing evidence keeps the tile visible', () => {
    useParticipantProgressStore
      .getState()
      .upsertItem({ ...a, skillScores: { [firstSkill.id]: 3 } });
    render(<Harness />);
    expect(xp()).toHaveTextContent('+0 XP');
    expect(
      screen.getByText('No exercise XP assigned by instructor today yet.')
    ).toBeInTheDocument();
    expect(block().querySelector('.sc-today-achievements-xp')).not.toHaveAttribute('data-positive');
  });
  it('retains unknown XP, real exercise evidence and actual level-up for an incomplete baseline', () => {
    useParticipantProgressStore
      .getState()
      .upsertItem({ ...a, level: 2, dailyProgress: { ...a.dailyProgress!, complete: false } });
    render(<Harness />);
    expect(xp()).toHaveTextContent('— XP');
    expect(screen.getByText(/Current score: 8/)).toBeInTheDocument();
    expect(screen.getByText('New Level: 2')).toBeInTheDocument();
    expect(screen.queryByText('Level 2')).toBeNull();
  });
  it('preserves multiple exercise limits and net deltas without interactive score controls', () => {
    const progress = buildParticipantTodayProgress(
      firstId,
      {
        ...a,
        skillScores: { [firstSkill.id]: 8, [secondSkill.id]: secondSkill.maxPoints + 10 },
        dailyProgress: {
          ...a.dailyProgress!,
          baselineSkillScores: { [firstSkill.id]: 3, [secondSkill.id]: secondSkill.maxPoints - 2 },
        },
      },
      DEFAULT_SKILL_CONFIG,
      'en',
      now
    );
    render(<PresentedTodayProgressBlock progress={progress} todayAchievements={[]} />);
    expect(xp()).toHaveTextContent('+7 XP');
    expect(
      screen.getByText(
        `Current score: ${secondSkill.maxPoints} / ${secondSkill.maxPoints} XP (max ${secondSkill.maxPoints} XP)`
      )
    ).toBeInTheDocument();
    expect(block().querySelectorAll('.sc-today-achievements-score-row')).toHaveLength(2);
    expect(within(block()).queryByRole('button')).toBeNull();
    expect(screen.queryByText('New achievements today:')).toBeNull();
  });
  it('keeps the existing hidden state for no selection, missing/loading evidence and verified empty days', () => {
    const { rerender } = render(
      <TodayProgressBlock progress={buildParticipantTodayProgress(undefined, a)} />
    );
    expect(screen.queryByText('Today’s Progress')).toBeNull();
    act(() => useParticipantAchievementsStore.getState().clear());
    rerender(
      <TodayProgressBlock
        selectedParticipantId={firstId}
        progress={buildParticipantTodayProgress(firstId, undefined)}
      />
    );
    expect(screen.queryByText('Today’s Progress')).toBeNull();
    rerender(
      <PresentedTodayProgressBlock
        progress={{ todayXP: 0, todayLevelUp: null, exercises: [], level: 1 }}
        todayAchievements={[]}
      />
    );
    expect(screen.queryByText('Today’s Progress')).toBeNull();
  });
  it('does not display an older persisted achievement as earned today', () => {
    useParticipantAchievementsStore.getState().setItems([
      {
        participantId: firstId,
        revision: 2,
        earned: {
          first_lesson: {
            earnedAt: timestampFromDate(new Date('2026-10-05T18:59:59Z')),
            source: 'participant_attendance',
          },
        },
        updatedAt: timestampFromDate(now),
      },
    ]);
    render(<Harness />);
    expect(xp()).toHaveTextContent('+5 XP');
    expect(screen.queryByText('New achievements today:')).toBeNull();
  });
  it('uses the resort midnight for baseline expiry without recalculating browser-local XP', () => {
    for (const instant of ['2026-10-06T18:59:59.999Z', '2026-10-06T19:00:00Z']) {
      const progress = buildParticipantTodayProgress(
        firstId,
        a,
        DEFAULT_SKILL_CONFIG,
        'en',
        new Date(instant)
      );
      expect(progress.todayXP).toBe(instant.includes('18:59') ? 5 : null);
      expect(progress.exercises).toHaveLength(instant.includes('18:59') ? 1 : 0);
    }
  });
  it('retains Russian labels, long achievement names and unknown history', () => {
    locale.language = 'ru';
    render(
      <PresentedTodayProgressBlock
        progress={{ todayXP: null, todayLevelUp: null, exercises: [], level: 1 }}
        todayAchievements={[
          {
            id: 'fixture',
            icon: '',
            label: 'Длинное название подтверждённого достижения для проверки переноса текста',
          },
        ]}
      />
    );
    expect(screen.getByText('Достижения за сегодня')).toBeInTheDocument();
    expect(screen.getByText('Дневная история оценок ещё недоступна.')).toBeInTheDocument();
    expect(screen.getByText('История оценок за сегодня ещё недоступна.')).toBeInTheDocument();
    expect(screen.getByText('Уровень 1')).toBeInTheDocument();
    expect(screen.getByText('Новые достижения сегодня:')).toBeInTheDocument();
  });
});
